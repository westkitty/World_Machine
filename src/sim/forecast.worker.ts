import { runBranch } from './compare';
import type { ForecastInboundMessage, ForecastOutboundMessage } from './forecast_protocol';

let currentJobId: string | null = null;
let cancelRequested = false;

self.onmessage = (event: MessageEvent<ForecastInboundMessage>) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'cancel') {
    if (currentJobId === msg.id) {
      cancelRequested = true;
      self.postMessage({ type: 'cancelled', id: msg.id } satisfies ForecastOutboundMessage);
      currentJobId = null;
    }
    return;
  }

  if (msg.type === 'start') {
    const { id, originFingerprint, base, policyA, policyB, ticks } = msg.request;
    currentJobId = id;
    cancelRequested = false;

    try {
      const totalTicks = ticks * 2;
      let lastReportedPct = -1;

      const reportProgress = (branch: 'A' | 'B', branchDone: number) => {
        const ticksDone = (branch === 'A' ? 0 : ticks) + branchDone;
        const pct = Math.floor((ticksDone / totalTicks) * 100);
        if (pct !== lastReportedPct || ticksDone === totalTicks) {
          lastReportedPct = pct;
          self.postMessage({
            type: 'progress',
            id,
            originFingerprint,
            ticksDone,
            totalTicks,
            pct,
            branch,
          } satisfies ForecastOutboundMessage);
        }
      };

      // Branch A
      const resA = runBranch(base, 'Strategy A', policyA, ticks, (done) => {
        if (cancelRequested || currentJobId !== id) return false;
        reportProgress('A', done);
        return true;
      });

      if (!resA || cancelRequested || currentJobId !== id) {
        if (cancelRequested && currentJobId === id) {
          self.postMessage({ type: 'cancelled', id } satisfies ForecastOutboundMessage);
          currentJobId = null;
        }
        return;
      }

      // Branch B
      const resB = runBranch(base, 'Strategy B', policyB, ticks, (done) => {
        if (cancelRequested || currentJobId !== id) return false;
        reportProgress('B', done);
        return true;
      });

      if (!resB || cancelRequested || currentJobId !== id) {
        if (cancelRequested && currentJobId === id) {
          self.postMessage({ type: 'cancelled', id } satisfies ForecastOutboundMessage);
          currentJobId = null;
        }
        return;
      }

      if (currentJobId === id && !cancelRequested) {
        self.postMessage({
          type: 'result',
          id,
          originFingerprint,
          result: [resA, resB],
        } satisfies ForecastOutboundMessage);
        currentJobId = null;
      }
    } catch (err) {
      if (currentJobId === id) {
        self.postMessage({
          type: 'error',
          id,
          error: (err as Error).message || String(err),
        } satisfies ForecastOutboundMessage);
        currentJobId = null;
      }
    }
  }
};
