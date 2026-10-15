import type { Policy, WorldState } from './types';
import type { BranchResult } from './compare';

export interface ForecastRequest {
  id: string;
  originSeed: string;
  originTick: number;
  originFingerprint: string;
  base: WorldState;
  policyA: Partial<Policy>;
  policyB: Partial<Policy>;
  ticks: number;
}

export type ForecastInboundMessage =
  | { type: 'start'; request: ForecastRequest }
  | { type: 'cancel'; id: string };

export interface ForecastProgressData {
  id: string;
  originFingerprint: string;
  ticksDone: number;
  totalTicks: number;
  pct: number;
  branch: 'A' | 'B';
}

export type ForecastOutboundMessage =
  | {
      type: 'progress';
      id: string;
      originFingerprint: string;
      ticksDone: number;
      totalTicks: number;
      pct: number;
      branch: 'A' | 'B';
    }
  | {
      type: 'result';
      id: string;
      originFingerprint: string;
      result: [BranchResult, BranchResult];
    }
  | {
      type: 'cancelled';
      id: string;
    }
  | {
      type: 'error';
      id: string;
      error: string;
    };
