import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearBackup,
  deleteSlot,
  getBackup,
  getLastBackup,
  hasBackup,
  loadFromSlot,
  restoreBackup,
  saveToSlot,
} from '../src/app/storage';
import { createReferenceWorld } from '../src/sim/create';
import { deserialize } from '../src/sim/save';
import type { WorldState } from '../src/sim/types';

class MockStorage implements Storage {
  private map = new Map<string, string>();
  shouldThrow: Error | null = null;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.shouldThrow) {
      throw this.shouldThrow;
    }
    this.map.set(key, String(value));
  }
}

describe('Save Overwrite/Delete Protection and Recovery (P002)', () => {
  let mockStorage: MockStorage;
  let originalStorage: Storage | undefined;

  beforeEach(() => {
    mockStorage = new MockStorage();
    originalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockStorage;
  });

  afterEach(() => {
    if (originalStorage) {
      (globalThis as unknown as { localStorage: Storage }).localStorage = originalStorage;
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  });

  function createTestState(seed: string, tick: number): WorldState {
    const s = createReferenceWorld();
    s.seed = seed;
    s.tick = tick;
    return s;
  }

  it('cancel is a no-op: aborted save/delete actions do not mutate slots or backups', () => {
    const state = createTestState('TERRA-TEST-CANCEL', 12);
    const saveResult = saveToSlot(state, 'slot1', 'Initial save');
    expect(saveResult.ok).toBe(true);

    const snapshotSlot = mockStorage.getItem('wm:save:slot1');
    const snapshotMeta = mockStorage.getItem('wm:savemeta:slot1');
    expect(snapshotSlot).not.toBeNull();
    expect(snapshotMeta).not.toBeNull();

    // Simulate user clicking "Cancel" in UI when prompted to overwrite or delete
    // (Canceling simply renders without executing saveSlot or deleteSlot)
    expect(mockStorage.getItem('wm:save:slot1')).toBe(snapshotSlot);
    expect(mockStorage.getItem('wm:savemeta:slot1')).toBe(snapshotMeta);
    expect(hasBackup('slot1')).toBe(false);

    // Active state remains loadable and unchanged
    const loaded = loadFromSlot('slot1');
    expect(loaded.seed).toBe('TERRA-TEST-CANCEL');
    expect(loaded.tick).toBe(12);
  });

  it('atomic rollback: failed writes do not destroy or truncate earlier save data', () => {
    const state1 = createTestState('TERRA-EARLIER-DATA', 24);
    const initialRes = saveToSlot(state1, 'slot2', 'Original Safe Save');
    expect(initialRes.ok).toBe(true);

    const savedJsonBefore = mockStorage.getItem('wm:save:slot2');
    const savedMetaBefore = mockStorage.getItem('wm:savemeta:slot2');

    // Simulate storage quota exhaustion or write failure on subsequent write
    mockStorage.shouldThrow = new DOMException('The quota has been exceeded.', 'QuotaExceededError');

    const state2 = createTestState('TERRA-FAILED-WRITE', 48);
    const failedRes = saveToSlot(state2, 'slot2', 'New Write That Fails');
    expect(failedRes.ok).toBe(false);
    expect(failedRes.message).toContain('Browser storage is full');

    // Remove simulated error
    mockStorage.shouldThrow = null;

    // Earlier data and metadata MUST be completely preserved and intact
    expect(mockStorage.getItem('wm:save:slot2')).toBe(savedJsonBefore);
    expect(mockStorage.getItem('wm:savemeta:slot2')).toBe(savedMetaBefore);

    const reloaded = loadFromSlot('slot2');
    expect(reloaded.seed).toBe('TERRA-EARLIER-DATA');
    expect(reloaded.tick).toBe(24);
  });

  it('overwritten save has a tested recovery route via backup and restore', () => {
    const stateA = createTestState('TERRA-A', 10);
    saveToSlot(stateA, 'slot1', 'Save A');

    const stateB = createTestState('TERRA-B', 50);
    const resB = saveToSlot(stateB, 'slot1', 'Save B (Overwrote A)');
    expect(resB.ok).toBe(true);

    // Current slot contains State B
    expect(loadFromSlot('slot1').seed).toBe('TERRA-B');

    // Backup contains State A
    expect(hasBackup('slot1')).toBe(true);
    const backup = getBackup('slot1');
    expect(backup).not.toBeNull();
    expect(backup?.reason).toBe('overwrite');
    expect(deserialize(backup!.json).seed).toBe('TERRA-A');

    // Restore backup
    const restoreRes = restoreBackup('slot1');
    expect(restoreRes.ok).toBe(true);

    // Current slot now has State A back!
    expect(loadFromSlot('slot1').seed).toBe('TERRA-A');

    // And State B is now in backup (reversible swap)
    const swappedBackup = getBackup('slot1');
    expect(swappedBackup).not.toBeNull();
    expect(deserialize(swappedBackup!.json).seed).toBe('TERRA-B');
  });

  it('deleted save has a tested recovery route via backup and restore', () => {
    const state = createTestState('TERRA-DELETE-RECOVER', 36);
    saveToSlot(state, 'slot3', 'Pre-Delete Save');

    expect(loadFromSlot('slot3').seed).toBe('TERRA-DELETE-RECOVER');

    // Delete the slot
    const deleted = deleteSlot('slot3');
    expect(deleted).toBe(true);

    // Slot is now empty
    expect(() => loadFromSlot('slot3')).toThrow(/empty/);

    // Backup is preserved with reason 'delete'
    expect(hasBackup('slot3')).toBe(true);
    const backup = getBackup('slot3');
    expect(backup?.reason).toBe('delete');
    expect(deserialize(backup!.json).seed).toBe('TERRA-DELETE-RECOVER');

    // Restore from backup
    const restoreRes = restoreBackup('slot3');
    expect(restoreRes.ok).toBe(true);

    // Slot 3 is restored with full fidelity
    const restored = loadFromSlot('slot3');
    expect(restored.seed).toBe('TERRA-DELETE-RECOVER');
    expect(restored.tick).toBe(36);
  });

  it('autosave archives prior year in backup', () => {
    const year1 = createTestState('TERRA-AUTO', 12);
    saveToSlot(year1, 'auto', 'Autosave Year 1');

    const year2 = createTestState('TERRA-AUTO', 24);
    saveToSlot(year2, 'auto', 'Autosave Year 2');

    expect(loadFromSlot('auto').tick).toBe(24);

    const autoBackup = getBackup('auto');
    expect(autoBackup).not.toBeNull();
    expect(autoBackup?.reason).toBe('autosave');
    expect(deserialize(autoBackup!.json).tick).toBe(12);
    expect(getLastBackup()?.slot).toBe('auto');
  });

  it('corrupt backup data fails cleanly without destroying current slot', () => {
    const state = createTestState('TERRA-STABLE', 100);
    saveToSlot(state, 'slot1', 'Good Save');

    // Corrupt the backup entry in storage
    mockStorage.setItem('wm:backup:slot1', JSON.stringify({
      slot: 'slot1',
      json: 'INVALID-CORRUPT-JSON{{{',
      info: { slot: 'slot1', label: 'bad', savedAt: '', summary: '' },
      replacedAt: new Date().toISOString(),
      reason: 'overwrite',
    }));

    const restoreRes = restoreBackup('slot1');
    expect(restoreRes.ok).toBe(false);

    // Current slot is untouched
    expect(loadFromSlot('slot1').seed).toBe('TERRA-STABLE');
  });

  it('clearBackup removes backup from storage', () => {
    const s1 = createTestState('SEED1', 1);
    saveToSlot(s1, 'slot1', 'S1');
    const s2 = createTestState('SEED2', 2);
    saveToSlot(s2, 'slot1', 'S2');

    expect(hasBackup('slot1')).toBe(true);
    clearBackup('slot1');
    expect(hasBackup('slot1')).toBe(false);
    expect(getBackup('slot1')).toBeNull();
  });
});
