import { SaveError, deserialize, serialize } from '../sim/save';
import { formatDate, type WorldState } from '../sim/types';
import type { Lighting, Quality } from '../render/PlanetView';

/**
 * Local persistence. Every access is guarded: private browsing, disabled
 * storage or a full quota produce a clear error instead of a crash.
 */
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SlotInfo {
  slot: Slot;
  label: string;
  savedAt: string;
  summary: string;
}

export const PREFIX = 'wm:save:';
export const META = 'wm:savemeta:';
export const BACKUP_PREFIX = 'wm:backup:';

export interface BackupRecord {
  slot: Slot;
  json: string;
  info: SlotInfo;
  replacedAt: string;
  reason: 'overwrite' | 'delete' | 'autosave';
}

function getStorage(): Storage | null {
  try {
    const g = typeof globalThis !== 'undefined' ? (globalThis as unknown as { localStorage?: Storage }) : null;
    if (g && g.localStorage) return g.localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  const st = getStorage();
  if (!st) return false;
  try {
    const k = 'wm:probe';
    st.setItem(k, '1');
    st.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic save with rollback and displacement backup.
 * If saving to an occupied slot succeeds, the displaced save is backed up.
 * If saving fails for any reason (e.g. quota exceeded), the earlier save
 * in this slot is preserved and never corrupted or truncated.
 */
export function saveToSlot(state: WorldState, slot: Slot, label: string): { ok: boolean; message: string } {
  const st = getStorage();
  if (!st) {
    return { ok: false, message: 'Browser storage is unavailable (private mode or blocked). Use Export to keep a save file.' };
  }

  const json = serialize(state, label);
  let oldJson: string | null = null;
  let oldMeta: string | null = null;
  try {
    oldJson = st.getItem(PREFIX + slot);
    oldMeta = st.getItem(META + slot);
  } catch { /* ignore read failure */ }

  try {
    st.setItem(PREFIX + slot, json);
    const info: SlotInfo = { slot, label, savedAt: new Date().toISOString(), summary: summarize(state) };
    st.setItem(META + slot, JSON.stringify(info));

    // If an existing save was replaced, preserve it in the backup recovery store
    if (oldJson && oldMeta) {
      try {
        const oldInfo = JSON.parse(oldMeta) as SlotInfo;
        const backup: BackupRecord = {
          slot,
          json: oldJson,
          info: oldInfo,
          replacedAt: new Date().toISOString(),
          reason: slot === 'auto' ? 'autosave' : 'overwrite',
        };
        st.setItem(BACKUP_PREFIX + slot, JSON.stringify(backup));
        st.setItem(BACKUP_PREFIX + 'last', JSON.stringify(backup));
      } catch { /* backup storage quota or failure shouldn't abort a successful save */ }
    }
    return { ok: true, message: `Saved to ${slotName(slot)} (${Math.round(json.length / 1024)} KB).` };
  } catch (e) {
    // ATOMIC ROLLBACK: Failed write MUST NOT destroy earlier data!
    try {
      if (oldJson !== null) st.setItem(PREFIX + slot, oldJson);
      else st.removeItem(PREFIX + slot);
      if (oldMeta !== null) st.setItem(META + slot, oldMeta);
      else st.removeItem(META + slot);
    } catch { /* ignore rollback failure */ }

    const quota = typeof DOMException !== 'undefined' && e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return {
      ok: false,
      message: quota
        ? 'Browser storage is full. Export the save as a file instead, or delete an old slot.'
        : 'Browser storage is unavailable (private mode or blocked). Use Export to keep a save file.',
    };
  }
}

export function loadFromSlot(slot: Slot): WorldState {
  const st = getStorage();
  if (!st) throw new SaveError('Browser storage is unavailable.');
  let json: string | null;
  try {
    json = st.getItem(PREFIX + slot);
  } catch {
    throw new SaveError('Browser storage is unavailable.');
  }
  if (!json) throw new SaveError(`${slotName(slot)} is empty.`);
  return deserialize(json);
}

/**
 * Deletes a slot while archiving the removed save into the recovery backup store.
 */
export function deleteSlot(slot: Slot): boolean {
  const st = getStorage();
  if (!st) return false;
  try {
    const oldJson = st.getItem(PREFIX + slot);
    const oldMeta = st.getItem(META + slot);
    if (oldJson && oldMeta) {
      try {
        const oldInfo = JSON.parse(oldMeta) as SlotInfo;
        const backup: BackupRecord = {
          slot,
          json: oldJson,
          info: oldInfo,
          replacedAt: new Date().toISOString(),
          reason: 'delete',
        };
        st.setItem(BACKUP_PREFIX + slot, JSON.stringify(backup));
        st.setItem(BACKUP_PREFIX + 'last', JSON.stringify(backup));
      } catch { /* ignore backup storage failures */ }
    }
    st.removeItem(PREFIX + slot);
    st.removeItem(META + slot);
    return true;
  } catch {
    return false;
  }
}

export function getBackup(slot: Slot): BackupRecord | null {
  const st = getStorage();
  if (!st) return null;
  try {
    const raw = st.getItem(BACKUP_PREFIX + slot);
    return raw ? (JSON.parse(raw) as BackupRecord) : null;
  } catch {
    return null;
  }
}

export function getLastBackup(): BackupRecord | null {
  const st = getStorage();
  if (!st) return null;
  try {
    const raw = st.getItem(BACKUP_PREFIX + 'last');
    return raw ? (JSON.parse(raw) as BackupRecord) : null;
  } catch {
    return null;
  }
}

export function hasBackup(slot: Slot): boolean {
  return getBackup(slot) !== null;
}

export function clearBackup(slot: Slot): void {
  const st = getStorage();
  if (!st) return;
  try {
    st.removeItem(BACKUP_PREFIX + slot);
  } catch { /* ignore */ }
}

/**
 * Restores a backed up save into the target slot with atomic swapping.
 */
export function restoreBackup(slot: Slot): { ok: boolean; message: string } {
  const st = getStorage();
  if (!st) return { ok: false, message: 'Browser storage is unavailable.' };
  try {
    const raw = st.getItem(BACKUP_PREFIX + slot);
    if (!raw) return { ok: false, message: `No backup available for ${slotName(slot)}.` };
    const backup = JSON.parse(raw) as BackupRecord;

    // Validate that the backup json is well-formed
    deserialize(backup.json);

    const curJson = st.getItem(PREFIX + slot);
    const curMeta = st.getItem(META + slot);

    st.setItem(PREFIX + slot, backup.json);
    st.setItem(META + slot, JSON.stringify(backup.info));

    // If slot had an existing save, swap it into backup so restore can also be undone
    if (curJson && curMeta) {
      const curInfo = JSON.parse(curMeta) as SlotInfo;
      const displaced: BackupRecord = {
        slot,
        json: curJson,
        info: curInfo,
        replacedAt: new Date().toISOString(),
        reason: 'overwrite',
      };
      st.setItem(BACKUP_PREFIX + slot, JSON.stringify(displaced));
      st.setItem(BACKUP_PREFIX + 'last', JSON.stringify(displaced));
    } else {
      st.removeItem(BACKUP_PREFIX + slot);
    }
    return { ok: true, message: `Restored backup to ${slotName(slot)}.` };
  } catch (e) {
    return { ok: false, message: `Could not restore backup: ${(e as Error).message}` };
  }
}

export function listSlots(): (SlotInfo | null)[] {
  const st = getStorage();
  if (!st) return SLOTS.map(() => null);
  return SLOTS.map((slot) => {
    try {
      const raw = st.getItem(META + slot);
      return raw ? (JSON.parse(raw) as SlotInfo) : null;
    } catch {
      return null;
    }
  });
}

export function slotName(slot: Slot): string {
  return slot === 'auto' ? 'Autosave' : `Slot ${slot.slice(4)}`;
}

function summarize(state: WorldState): string {
  const live = state.settlements.filter((s) => s.alive);
  const pop = live.reduce((a, s) => a + s.population, 0);
  const mode = state.scenario ? `${state.mode} · ${state.scenario.id.replace(/_/g, ' ')}` : state.mode;
  return `${mode} · “${state.seed}” · ${formatDate(state.tick)} · ${live.length} settlements · ${Math.round(pop).toLocaleString()} people`;
}

export interface Settings {
  quality: Quality;
  reducedMotion: boolean;
  reducedEffects: boolean;
  showBorders: boolean;
  showLabels: boolean;
  autosave: boolean;
  seenHelp: boolean;
  bookmarks: ([number, number, number] | null)[];
  /** 'studio': key light follows the camera for readability; 'orbital': real day/night cycle. */
  lighting: Lighting;
}

const SETTINGS_KEY = 'wm:settings';

export function defaultSettings(): Settings {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    quality: coarse ? 'medium' : 'high', reducedMotion: reduce, reducedEffects: false, showBorders: true,
    showLabels: true, autosave: true, seenHelp: false, bookmarks: [null, null, null, null], lighting: 'studio',
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  const st = getStorage();
  if (!st) return d;
  try {
    const raw = st.getItem(SETTINGS_KEY);
    return raw ? { ...d, ...JSON.parse(raw) } : d;
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  const st = getStorage();
  if (!st) return;
  try { st.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
