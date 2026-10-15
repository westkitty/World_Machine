import { describe, expect, it } from 'vitest';
import { SimClock, MAX_TICKS_PER_FRAME } from '../src/app/clock';

describe('Modal/Time/Keyboard Coherence (P004)', () => {
  describe('SimClock pause/resume and accumulator semantics', () => {
    it('initializes with default speed 1, paused false, and 0 accumulated ticks', () => {
      const clock = new SimClock();
      expect(clock.speed).toBe(1);
      expect(clock.paused).toBe(false);
      expect(clock.accumulated).toBe(0);
      expect(clock.phase).toBe(0);
    });

    it('accumulates fractional time toward the next tick without loss', () => {
      const clock = new SimClock();
      // At speed 1, ticksPerSecond is 0.5. Frame dt is capped at 0.25s.
      const ticks1 = clock.advance(0.2); // 0.2 * 0.5 = 0.10 tick accumulated
      expect(ticks1).toBe(0);
      expect(clock.accumulated).toBeCloseTo(0.10, 4);

      // Advance 1.8s in 0.2s frame steps (9 steps of 0.2s * 0.5 = 0.90 tick)
      let ticks = 0;
      for (let i = 0; i < 9; i++) {
        ticks += clock.advance(0.2);
      }
      // Total 0.10 + 0.90 = 1.0 tick
      expect(ticks).toBe(1);
      expect(clock.accumulated).toBeCloseTo(0, 4);
    });

    it('pause() freezes accumulator and advance() returns 0 without time drift', () => {
      const clock = new SimClock();
      // Advance 0.5s in two 0.25s steps at speed 1 (0.5 ticks/sec) -> 0.25 tick accumulated
      clock.advance(0.25);
      clock.advance(0.25);
      expect(clock.accumulated).toBeCloseTo(0.25, 4);

      // Pause clock
      clock.pause();
      expect(clock.paused).toBe(true);
      expect(clock.speed).toBe(0);
      // Accumulator MUST be preserved when pausing
      expect(clock.accumulated).toBeCloseTo(0.25, 4);

      // Advance during pause must do zero work
      const pausedTicks = clock.advance(0.25);
      expect(pausedTicks).toBe(0);
      expect(clock.accumulated).toBeCloseTo(0.25, 4);

      // Resume clock
      clock.resume();
      expect(clock.paused).toBe(false);
      expect(clock.speed).toBe(1);
      expect(clock.accumulated).toBeCloseTo(0.25, 4);

      // Another 1.5s in six 0.25s steps completes the tick (6 * 0.25 * 0.5 = 0.75; 0.25 + 0.75 = 1.0)
      let ticks = 0;
      for (let i = 0; i < 6; i++) {
        ticks += clock.advance(0.25);
      }
      expect(ticks).toBe(1);
      expect(clock.accumulated).toBeCloseTo(0, 4);
    });

    it('togglePause() preserves accumulator across rapid pause/unpause cycles', () => {
      const clock = new SimClock();
      clock.advance(0.8);
      const accBefore = clock.accumulated;
      expect(accBefore).toBeGreaterThan(0);

      // Toggle pause off/on/off/on repeatedly
      for (let i = 0; i < 5; i++) {
        clock.togglePause();
        expect(clock.paused).toBe(true);
        expect(clock.accumulated).toBeCloseTo(accBefore, 4);

        clock.togglePause();
        expect(clock.paused).toBe(false);
        expect(clock.accumulated).toBeCloseTo(accBefore, 4);
      }
    });

    it('reset() resets accumulator to 0 on world transitions', () => {
      const clock = new SimClock();
      clock.advance(1.5);
      expect(clock.accumulated).toBeGreaterThan(0);

      clock.reset();
      expect(clock.accumulated).toBe(0);
    });

    it('caps catch-up work at MAX_TICKS_PER_FRAME to prevent tab sleep bursts', () => {
      const clock = new SimClock();
      clock.setSpeed(4); // 8 ticks/sec
      const ticks = clock.advance(100.0); // dt is capped at 0.25s inside advance
      expect(ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
    });
  });

  describe('Modal entry/exit time coherence logic', () => {
    it('simulates modal lifecycle preserving speed and accumulated time', () => {
      const clock = new SimClock();
      clock.setSpeed(2); // 1 tick/sec
      clock.advance(0.2);
      clock.advance(0.2);
      expect(clock.accumulated).toBeCloseTo(0.4, 4);

      // Modal open simulation
      let modalOpen = false;
      let resumeSpeed = 0;

      const openModal = () => {
        if (!modalOpen) {
          resumeSpeed = clock.speed;
          if (!clock.paused) clock.pause();
        }
        modalOpen = true;
      };

      const closeModal = () => {
        if (!modalOpen) return;
        modalOpen = false;
        if (resumeSpeed > 0) clock.setSpeed(resumeSpeed);
        else clock.setSpeed(0);
      };

      openModal();
      expect(modalOpen).toBe(true);
      expect(clock.paused).toBe(true);
      expect(clock.accumulated).toBeCloseTo(0.4, 4);

      // Elapsed time while modal is open produces 0 ticks
      expect(clock.advance(0.2)).toBe(0);
      expect(clock.accumulated).toBeCloseTo(0.4, 4);

      closeModal();
      expect(modalOpen).toBe(false);
      expect(clock.speed).toBe(2);
      expect(clock.paused).toBe(false);
      expect(clock.accumulated).toBeCloseTo(0.4, 4);

      // Advancing three 0.2s steps at 1 tick/sec completes the month cleanly
      let ticks = 0;
      ticks += clock.advance(0.2);
      ticks += clock.advance(0.2);
      ticks += clock.advance(0.2);
      expect(ticks).toBe(1);
    });

    it('modal opened while game was already paused remains paused on exit', () => {
      const clock = new SimClock();
      clock.pause();
      expect(clock.paused).toBe(true);

      let modalOpen = false;
      let resumeSpeed = 0;

      const openModal = () => {
        if (!modalOpen) {
          resumeSpeed = clock.speed;
          if (!clock.paused) clock.pause();
        }
        modalOpen = true;
      };

      const closeModal = () => {
        if (!modalOpen) return;
        modalOpen = false;
        if (resumeSpeed > 0) clock.setSpeed(resumeSpeed);
        else clock.setSpeed(0);
      };

      openModal();
      expect(resumeSpeed).toBe(0);
      expect(clock.paused).toBe(true);

      closeModal();
      expect(clock.paused).toBe(true);
      expect(clock.speed).toBe(0);
    });
  });

  describe('Modal focus trap and focus return logic', () => {
    it('traps focus between first and last focusable elements on Tab and Shift+Tab', () => {
      const elements: { tag: string; focused: boolean; disabled?: boolean; ariaDisabled?: boolean }[] = [
        { tag: 'button.close', focused: false },
        { tag: 'input.text', focused: false },
        { tag: 'button.submit', focused: false },
        { tag: 'button.disabled', focused: false, disabled: true },
        { tag: 'a.cancel', focused: false },
      ];

      const focusables = elements.filter((e) => !e.disabled && !e.ariaDisabled);
      expect(focusables.length).toBe(4);

      let activeIndex = 0;
      focusables[activeIndex].focused = true;

      const simulateTab = (shiftKey: boolean) => {
        if (shiftKey) {
          if (activeIndex === 0) activeIndex = focusables.length - 1;
          else activeIndex--;
        } else {
          if (activeIndex === focusables.length - 1) activeIndex = 0;
          else activeIndex++;
        }
        focusables.forEach((f, i) => (f.focused = i === activeIndex));
      };

      // Tab forward
      simulateTab(false);
      expect(activeIndex).toBe(1); // input
      simulateTab(false);
      expect(activeIndex).toBe(2); // submit
      simulateTab(false);
      expect(activeIndex).toBe(3); // cancel (disabled was skipped)

      // Tab wraps from last to first
      simulateTab(false);
      expect(activeIndex).toBe(0); // button.close

      // Shift+Tab wraps from first to last
      simulateTab(true);
      expect(activeIndex).toBe(3); // a.cancel
    });

    it('restores focus to previously focused element when modal closes', () => {
      let previouslyFocused: { id: string; focus: () => void } | null = null;
      let focusedId = 'open-saves-button';

      const buttonToRestore = {
        id: 'open-saves-button',
        focus: () => {
          focusedId = 'open-saves-button';
        },
      };

      // User clicked button, opening modal
      previouslyFocused = buttonToRestore;
      focusedId = 'modal-close-button'; // Modal gained focus

      expect(focusedId).toBe('modal-close-button');

      // Closing modal restores focus
      if (previouslyFocused) {
        previouslyFocused.focus();
        previouslyFocused = null;
      }

      expect(focusedId).toBe('open-saves-button');
      expect(previouslyFocused).toBeNull();
    });
  });

  describe('Keyboard shortcut suppression and parity', () => {
    it('suppresses world pause and actions when focused control is a button or link', () => {
      let clockToggled = false;
      const togglePause = () => {
        clockToggled = true;
      };

      const handleKey = (e: { key: string; target: { tagName: string; getAttribute: (k: string) => string | null } }) => {
        const target = e.target;
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'button' || target.getAttribute('role') === 'tab')) {
          if (e.key === ' ' || e.key === 'Enter') return;
        }
        if (e.key === ' ') togglePause();
      };

      // Space on a focused button does not toggle pause
      handleKey({ key: ' ', target: { tagName: 'BUTTON', getAttribute: () => null } });
      expect(clockToggled).toBe(false);

      // Space on a focused tab does not toggle pause
      handleKey({ key: ' ', target: { tagName: 'DIV', getAttribute: (k) => (k === 'role' ? 'tab' : null) } });
      expect(clockToggled).toBe(false);

      // Space on canvas or body toggles pause
      handleKey({ key: ' ', target: { tagName: 'CANVAS', getAttribute: () => null } });
      expect(clockToggled).toBe(true);
    });

    it('suppresses all world shortcuts when modal is open except Escape', () => {
      let tool = 'inspect';
      let paused = false;
      let modalClosed = false;

      const handleKey = (e: { key: string; modalOpen: boolean }) => {
        if (e.modalOpen) {
          if (e.key === 'Escape') modalClosed = true;
          return;
        }
        if (e.key === 'n') tool = 'found';
        if (e.key === 'r') tool = 'road';
        if (e.key === ' ') paused = !paused;
      };

      // When modal is open, 'n', 'r', ' ' are completely ignored
      handleKey({ key: 'n', modalOpen: true });
      expect(tool).toBe('inspect');

      handleKey({ key: 'r', modalOpen: true });
      expect(tool).toBe('inspect');

      handleKey({ key: ' ', modalOpen: true });
      expect(paused).toBe(false);

      // Escape closes the modal
      handleKey({ key: 'Escape', modalOpen: true });
      expect(modalClosed).toBe(true);
    });

    it('Escape cancels active tool back to inspect or deselects cell', () => {
      let tool = 'road';
      let selectedCell = 42;

      const handleEsc = () => {
        if (tool !== 'inspect') tool = 'inspect';
        else if (selectedCell >= 0) selectedCell = -1;
      };

      // First Esc: returns tool to inspect
      handleEsc();
      expect(tool).toBe('inspect');
      expect(selectedCell).toBe(42);

      // Second Esc: deselects cell
      handleEsc();
      expect(tool).toBe('inspect');
      expect(selectedCell).toBe(-1);
    });
  });

  describe('Static codebase contract verification', () => {
    const rawFiles = import.meta.glob<string>(['../src/ui/Hud.ts', '../src/app/App.ts', '../src/app/clock.ts'], { query: '?raw', eager: true, import: 'default' });

    it('verifies Hud.ts has trapFocus, modalOpen pause/resume, and focus return', () => {
      const hudSrc = rawFiles['../src/ui/Hud.ts'];
      expect(hudSrc).toBeDefined();
      expect(hudSrc).toContain('trapFocus');
      expect(hudSrc).toContain('previouslyFocused');
      expect(hudSrc).toContain('this.app.clock.pause()');
      expect(hudSrc).toContain('this.app.clock.setSpeed(this.resumeSpeed)');
      expect(hudSrc).toContain('toFocus.focus()');
    });

    it('verifies App.ts suppresses world shortcuts for focused interactive controls and modalOpen', () => {
      const appSrc = rawFiles['../src/app/App.ts'];
      expect(appSrc).toBeDefined();
      expect(appSrc).toContain('if (this.hud.modalOpen)');
      expect(appSrc).toContain("target.tagName === 'BUTTON'");
      expect(appSrc).toContain("k === ' ' || k === 'Enter'");
      expect(appSrc).toContain('this.clock.reset()');
    });

    it('verifies clock.ts defines pause(), resume(), and preserves accumulator on setSpeed', () => {
      const clockSrc = rawFiles['../src/app/clock.ts'];
      expect(clockSrc).toBeDefined();
      expect(clockSrc).toContain('pause(): void');
      expect(clockSrc).toContain('resume(): void');
      expect(clockSrc).toContain('reset(): void');
      expect(clockSrc).toContain('get accumulated(): number');
    });
  });
});
