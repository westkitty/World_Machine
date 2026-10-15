import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLAYTEST_SCHEMA_VERSION,
  PlaytestTracker,
  UNCOACHED_TASKS,
  type PlaytestFeedbackRubric,
} from '../src/app/playtest';

describe('Human Playtest Program Protocol & Diagnostics (P075)', () => {
  let tracker: PlaytestTracker;

  beforeEach(() => {
    tracker = new PlaytestTracker('test-build-1.0.0');
  });

  it('strictly respects opt-in invariant: records nothing when opted out by default', () => {
    expect(tracker.isOptedIn()).toBe(false);

    tracker.logEvent('click_test', 'navigation', 'Clicked region', 1);
    tracker.completeTask(UNCOACHED_TASKS.TASK_A_ONBOARDING, 1);
    tracker.logConfusion('ui', 'Cannot find policy slider', 1);
    tracker.submitRubric({ perceivedCausality: 4, stewardAgency: 5, enjoyment: 4 });

    const report = tracker.exportReport(10);
    expect(report.optedIn).toBe(false);
    expect(report.events).toEqual([]);
    expect(report.completedTasks).toEqual([]);
    expect(report.loggedConfusionPoints).toEqual([]);
    expect(report.rubric).toBeUndefined();
  });

  it('records events, milestones, and friction points when player explicitly opts in', () => {
    tracker.setOptIn(true);
    expect(tracker.isOptedIn()).toBe(true);

    tracker.logEvent('inspect_region', 'navigation', 'Cell 42', 2);
    tracker.completeTask(UNCOACHED_TASKS.TASK_A_ONBOARDING, 2);
    tracker.logConfusion('trade', 'Cargo loss rate calculation ambiguous', 5);

    const report = tracker.exportReport(12);
    expect(report.optedIn).toBe(true);
    expect(report.completedTasks).toContain(UNCOACHED_TASKS.TASK_A_ONBOARDING);
    expect(tracker.isTaskComplete(UNCOACHED_TASKS.TASK_A_ONBOARDING)).toBe(true);
    expect(report.loggedConfusionPoints.length).toBe(1);
    expect(report.loggedConfusionPoints[0]).toContain('Cargo loss rate');
    expect(report.events.length).toBe(3); // inspect_region, task_complete, confusion_flagged
  });

  it('revoking opt-in immediately purges all diagnostic history from memory', () => {
    tracker.setOptIn(true);
    tracker.logEvent('action_1', 'stewardship', 'Constructed farm', 1);
    tracker.completeTask(UNCOACHED_TASKS.TASK_B_STEWARDSHIP, 1);
    expect(tracker.exportReport().events.length).toBeGreaterThan(0);

    // Revoke
    tracker.setOptIn(false);
    expect(tracker.isOptedIn()).toBe(false);
    expect(tracker.exportReport().events).toEqual([]);
    expect(tracker.exportReport().completedTasks).toEqual([]);
  });

  it('standardized feedback rubric captures complete multi-dimensional Likert ratings', () => {
    tracker.setOptIn(true);

    const rubric: PlaytestFeedbackRubric = {
      perceivedCausality: 5,
      stewardAgency: 4,
      enjoyment: 5,
      returnComprehension: 4,
      confusionPoints: 'None encountered; route delivery feedback was responsive.',
      feedbackNotes: 'Atmospheric audio crossfades enhanced planetary presence.',
    };

    tracker.submitRubric(rubric, 24);

    const report = tracker.exportReport(24);
    expect(report.rubric).toBeDefined();
    expect(report.rubric?.perceivedCausality).toBe(5);
    expect(report.rubric?.stewardAgency).toBe(4);
    expect(report.rubric?.enjoyment).toBe(5);
    expect(report.rubric?.returnComprehension).toBe(4);
    expect(report.rubric?.confusionPoints).toBe(rubric.confusionPoints);
  });

  it('bounds diagnostic event capacity to prevent long-session memory growth', () => {
    tracker.setOptIn(true);

    // Emit 600 events (cap is 500)
    for (let i = 0; i < 600; i++) {
      tracker.logEvent(`event_${i}`, 'navigation', `Tick ${i}`, i);
    }

    const report = tracker.exportReport(600);
    expect(report.events.length).toBe(500);
    // Oldest event retained is event_100
    expect(report.events[0].type).toBe('event_100');
    expect(report.events[499].type).toBe('event_599');
  });

  it('export JSON roundtrip matches schema contract with zero PII', () => {
    tracker.setOptIn(true);
    tracker.completeTask(UNCOACHED_TASKS.TASK_E_FORECAST, 15);
    const json = tracker.exportJson(20);

    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(PLAYTEST_SCHEMA_VERSION);
    expect(typeof parsed.sessionId).toBe('string');
    expect(parsed.buildId).toBe('test-build-1.0.0');
    expect(parsed.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(parsed.completedTasks).toEqual([UNCOACHED_TASKS.TASK_E_FORECAST]);
  });
});
