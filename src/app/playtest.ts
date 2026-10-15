/**
 * Human Playtest Program Protocol and Consent-Safe Diagnostics (P075)
 *
 * Implements privacy-first, 100% local, consent-safe session diagnostics
 * for repeatable uncoached playtests. Tracks task completion milestones,
 * confusion indicators, perceived causality feedback, and return-session
 * comprehension without any network telemetry or PII transmission.
 */

export const PLAYTEST_STORAGE_KEY = 'wm:playtest:opt_in';
export const PLAYTEST_DATA_KEY = 'wm:playtest:session';
export const PLAYTEST_SCHEMA_VERSION = 1;

export interface PlaytestEvent {
  timestampMs: number;
  tick: number;
  type: string;
  category: 'onboarding' | 'navigation' | 'stewardship' | 'commerce' | 'crisis' | 'forecast' | 'save' | 'feedback';
  detail?: string;
}

export interface PlaytestFeedbackRubric {
  /** 1-5 Likert: Did you understand why your settlements prospered or declined? */
  perceivedCausality: number;
  /** 1-5 Likert: Did you feel meaningful agency as planetary steward? */
  stewardAgency: number;
  /** 1-5 Likert: Overall session engagement and enjoyment */
  enjoyment: number;
  /** 1-5 Likert: Return comprehension (clarity upon resuming a saved game) */
  returnComprehension?: number;
  /** Specific friction or confusion points encountered */
  confusionPoints?: string;
  /** Positive highlights or notable moments */
  feedbackNotes?: string;
}

export interface PlaytestSessionReport {
  schemaVersion: number;
  sessionId: string;
  optedIn: boolean;
  buildId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  ticksSimulated: number;
  completedTasks: string[];
  loggedConfusionPoints: string[];
  eventCounts: Record<string, number>;
  events: PlaytestEvent[];
  rubric?: PlaytestFeedbackRubric;
}

/** Standardized uncoached playtest tasks */
export const UNCOACHED_TASKS = {
  TASK_A_ONBOARDING: 'task_a_onboarding', // Boot, rotate globe, inspect 3 regions
  TASK_B_STEWARDSHIP: 'task_b_stewardship', // Build structure, set policy, designate reserve
  TASK_C_COMMERCE: 'task_c_commerce', // Inspect trade routes, open trade between settlements
  TASK_D_CRISIS: 'task_d_crisis', // Encounter or respond to a planetary crisis
  TASK_E_FORECAST: 'task_e_forecast', // Compare 12-month projections, adopt a future branch
  TASK_F_RETURN: 'task_f_return', // Save game, reload, resume stewardship without disorientation
} as const;

export type UncoachedTaskId = typeof UNCOACHED_TASKS[keyof typeof UNCOACHED_TASKS];

export class PlaytestTracker {
  private optedIn: boolean;
  private sessionId: string;
  private startedAt: number;
  private buildId: string;
  private events: PlaytestEvent[] = [];
  private completedTasks: Set<string> = new Set();
  private confusionPoints: string[] = [];
  private rubric?: PlaytestFeedbackRubric;
  private maxEvents = 500;

  constructor(buildId = 'world-machine-v1.0.0') {
    this.buildId = buildId;
    this.sessionId = `pt-${Math.random().toString(36).substring(2, 9)}`;
    this.startedAt = Date.now();
    this.optedIn = this.readOptIn();
  }

  private readOptIn(): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(PLAYTEST_STORAGE_KEY) === 'true';
      }
    } catch {
      // Storage access blocked or unavailable
    }
    return false;
  }

  public setOptIn(enabled: boolean): void {
    this.optedIn = enabled;
    if (!enabled) {
      this.clear();
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (enabled) {
          window.localStorage.setItem(PLAYTEST_STORAGE_KEY, 'true');
        } else {
          window.localStorage.removeItem(PLAYTEST_STORAGE_KEY);
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  public isOptedIn(): boolean {
    return this.optedIn;
  }

  public logEvent(
    type: string,
    category: PlaytestEvent['category'],
    detail?: string,
    tick = 0
  ): void {
    if (!this.optedIn) return;

    if (this.events.length >= this.maxEvents) {
      this.events.shift(); // Bound memory capacity
    }

    this.events.push({
      timestampMs: Date.now() - this.startedAt,
      tick,
      type,
      category,
      detail,
    });
  }

  public completeTask(taskId: UncoachedTaskId, tick = 0): void {
    if (!this.optedIn) return;
    this.completedTasks.add(taskId);
    this.logEvent(`task_complete:${taskId}`, 'onboarding', taskId, tick);
  }

  public isTaskComplete(taskId: UncoachedTaskId): boolean {
    return this.completedTasks.has(taskId);
  }

  public logConfusion(area: string, description: string, tick = 0): void {
    if (!this.optedIn) return;
    const entry = `[${area}] ${description}`;
    this.confusionPoints.push(entry);
    this.logEvent('confusion_flagged', 'feedback', entry, tick);
  }

  public submitRubric(rubric: PlaytestFeedbackRubric, tick = 0): void {
    if (!this.optedIn) return;
    this.rubric = { ...rubric };
    this.logEvent('rubric_submitted', 'feedback', `Causality: ${rubric.perceivedCausality}/5, Agency: ${rubric.stewardAgency}/5`, tick);
  }

  public exportReport(ticksSimulated = 0): PlaytestSessionReport {
    const counts: Record<string, number> = {};
    for (const e of this.events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }

    return {
      schemaVersion: PLAYTEST_SCHEMA_VERSION,
      sessionId: this.sessionId,
      optedIn: this.optedIn,
      buildId: this.buildId,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      ticksSimulated,
      completedTasks: Array.from(this.completedTasks),
      loggedConfusionPoints: [...this.confusionPoints],
      eventCounts: counts,
      events: [...this.events],
      rubric: this.rubric ? { ...this.rubric } : undefined,
    };
  }

  public exportJson(ticksSimulated = 0): string {
    return JSON.stringify(this.exportReport(ticksSimulated), null, 2);
  }

  public clear(): void {
    this.events = [];
    this.completedTasks.clear();
    this.confusionPoints = [];
    this.rubric = undefined;
    this.startedAt = Date.now();
  }
}

let activeTracker: PlaytestTracker | null = null;

export function getPlaytestTracker(): PlaytestTracker {
  if (!activeTracker) {
    activeTracker = new PlaytestTracker();
  }
  return activeTracker;
}
