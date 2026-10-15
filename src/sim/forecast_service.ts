import { computeStateFingerprint, type BranchResult } from './compare';
import { runBranch } from './compare';
import type {
  ForecastInboundMessage,
  ForecastOutboundMessage,
  ForecastRequest,
} from './forecast_protocol';
import type { Policy, WorldState } from './types';

export interface ForecastProgress {
  ticksDone: number;
  totalTicks: number;
  pct: number;
  branch: 'A' | 'B';
}

export interface ForecastState {
  status: 'idle' | 'running' | 'complete' | 'stale' | 'error';
  progress: ForecastProgress | null;
  result: [BranchResult, BranchResult] | null;
  error: string | null;
  originFingerprint: string | null;
  originTick: number;
  originSeed: string;
  requestId: string | null;
}

export class ForecastService {
  private worker: Worker | null = null;
  private requestCounter = 0;
  private listeners = new Set<(state: ForecastState) => void>();
  private fallbackCancel: (() => void) | null = null;

  private state: ForecastState = {
    status: 'idle',
    progress: null,
    result: null,
    error: null,
    originFingerprint: null,
    originTick: -1,
    originSeed: '',
    requestId: null,
  };

  constructor(private readonly workerFactory?: () => Worker | null) {
    this.initWorker();
  }

  private initWorker(): void {
    if (this.workerFactory) {
      this.worker = this.workerFactory();
    } else if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        console.warn('Could not instantiate forecast Web Worker, falling back to local simulation:', err);
        this.worker = null;
      }
    }

    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<ForecastOutboundMessage>) => {
        this.handleMessage(event.data);
      };
      this.worker.onerror = (err) => {
        console.error('Forecast worker error:', err);
        if (this.state.status === 'running') {
          this.state.status = 'error';
          this.state.error = 'Worker execution error';
          this.state.progress = null;
          this.notify();
        }
      };
    }
  }

  getState(): Readonly<ForecastState> {
    return this.state;
  }

  subscribe(listener: (state: ForecastState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in forecast subscriber:', err);
      }
    }
  }

  start(base: WorldState, policyA: Partial<Policy>, policyB: Partial<Policy>, ticks: number): void {
    const originFingerprint = computeStateFingerprint(base);
    const id = `req-${++this.requestCounter}`;

    if (this.state.status === 'running' && this.state.requestId) {
      this.cancel();
    }

    this.state = {
      status: 'running',
      progress: { ticksDone: 0, totalTicks: ticks * 2, pct: 0, branch: 'A' },
      result: null,
      error: null,
      originFingerprint,
      originTick: base.tick,
      originSeed: base.seed,
      requestId: id,
    };
    this.notify();

    const request: ForecastRequest = {
      id,
      originSeed: base.seed,
      originTick: base.tick,
      originFingerprint,
      base,
      policyA,
      policyB,
      ticks,
    };

    if (this.worker) {
      const msg: ForecastInboundMessage = { type: 'start', request };
      this.worker.postMessage(msg);
    } else {
      this.runLocalFallback(request);
    }
  }

  cancel(): void {
    if (this.state.status !== 'running' || !this.state.requestId) return;

    const id = this.state.requestId;
    if (this.worker) {
      const msg: ForecastInboundMessage = { type: 'cancel', id };
      this.worker.postMessage(msg);
    }
    if (this.fallbackCancel) {
      this.fallbackCancel();
      this.fallbackCancel = null;
    }

    this.state.status = 'idle';
    this.state.progress = null;
    this.notify();
  }

  invalidate(): void {
    if (this.state.status === 'running') {
      this.cancel();
    }
    this.state = {
      status: 'idle',
      progress: null,
      result: null,
      error: null,
      originFingerprint: null,
      originTick: -1,
      originSeed: '',
      requestId: null,
    };
    this.notify();
  }

  checkStaleness(currentState: WorldState): boolean {
    if (this.state.status === 'idle') return false;

    const isDifferent =
      currentState.seed !== this.state.originSeed ||
      currentState.tick !== this.state.originTick ||
      computeStateFingerprint(currentState) !== this.state.originFingerprint;

    if (isDifferent) {
      if (this.state.status === 'running') {
        this.cancel();
      }
      if (this.state.status !== 'stale') {
        this.state.status = 'stale';
        this.notify();
      }
      return true;
    }

    return false;
  }

  handleMessage(msg: ForecastOutboundMessage): void {
    if (!msg || msg.id !== this.state.requestId) return;

    switch (msg.type) {
      case 'progress': {
        if (this.state.status === 'running') {
          this.state.progress = {
            ticksDone: msg.ticksDone,
            totalTicks: msg.totalTicks,
            pct: msg.pct,
            branch: msg.branch,
          };
          this.notify();
        }
        break;
      }
      case 'result': {
        if (this.state.status === 'running') {
          this.state.status = 'complete';
          this.state.result = msg.result;
          this.state.progress = null;
          this.notify();
        }
        break;
      }
      case 'cancelled': {
        if (this.state.status === 'running') {
          this.state.status = 'idle';
          this.state.progress = null;
          this.notify();
        }
        break;
      }
      case 'error': {
        if (this.state.status === 'running') {
          this.state.status = 'error';
          this.state.error = msg.error;
          this.state.progress = null;
          this.notify();
        }
        break;
      }
    }
  }

  private runLocalFallback(req: ForecastRequest): void {
    const { id, originFingerprint, base, policyA, policyB, ticks } = req;
    const totalTicks = ticks * 2;
    let isCancelled = false;
    this.fallbackCancel = () => {
      isCancelled = true;
    };

    setTimeout(() => {
      if (isCancelled || this.state.requestId !== id) return;
      try {
        const resA = runBranch(base, 'Strategy A', policyA, ticks, (ticksDone) => {
          if (isCancelled || this.state.requestId !== id) return false;
          this.handleMessage({
            type: 'progress',
            id,
            originFingerprint,
            ticksDone,
            totalTicks,
            pct: Math.floor((ticksDone / totalTicks) * 100),
            branch: 'A',
          });
          return true;
        });

        if (!resA || isCancelled || this.state.requestId !== id) return;

        const resB = runBranch(base, 'Strategy B', policyB, ticks, (ticksDone) => {
          if (isCancelled || this.state.requestId !== id) return false;
          const totalDone = ticks + ticksDone;
          this.handleMessage({
            type: 'progress',
            id,
            originFingerprint,
            ticksDone: totalDone,
            totalTicks,
            pct: Math.floor((totalDone / totalTicks) * 100),
            branch: 'B',
          });
          return true;
        });

        if (!resB || isCancelled || this.state.requestId !== id) return;

        this.handleMessage({
          type: 'result',
          id,
          originFingerprint,
          result: [resA, resB],
        });
      } catch (err) {
        if (!isCancelled && this.state.requestId === id) {
          this.handleMessage({
            type: 'error',
            id,
            error: (err as Error).message || String(err),
          });
        }
      }
    }, 0);
  }

  destroy(): void {
    this.cancel();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners.clear();
  }
}
