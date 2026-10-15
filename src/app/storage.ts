import { SaveError, deserialize, serialize } from '../sim/save';
import { formatDate, type WorldState } from '../sim/types';
import type { Quality } from '../render/PlanetView';

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

const PREFIX = 'wm:save:';
const META = 'wm:savemeta:';

export function storageAvailable(): boolean {
  try {
    const k = 'wm:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function saveToSlot(state: WorldState, slot: Slot, label: string): { ok: boolean; message: string } {
  const json = serialize(state, label);
  try {
    localStorage.setItem(PREFIX + slot, json);
    const info: SlotInfo = { slot, label, savedAt: new Date().toISOString(), summary: summarize(state) };
    localStorage.setItem(META + slot, JSON.stringify(info));
    return { ok: true, message: `Saved to ${slotName(slot)} (${Math.round(json.length / 1024)} KB).` };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, message: quota ? 'Browser storage is full. Export the save as a file instead, or delete an old slot.' : 'Browser storage is unavailable (private mode or blocked). Use Export to keep a save file.' };
  }
}

export function loadFromSlot(slot: Slot): WorldState {
  let json: string | null;
  try {
    json = localStorage.getItem(PREFIX + slot);
  } catch {
    throw new SaveError('Browser storage is unavailable.');
  }
  if (!json) throw new SaveError(`${slotName(slot)} is empty.`);
  return deserialize(json);
}

export function deleteSlot(slot: Slot): void {
  try {
    localStorage.removeItem(PREFIX + slot);
    localStorage.removeItem(META + slot);
  } catch { /* ignore */ }
}

export function listSlots(): (SlotInfo | null)[] {
  return SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(META + slot);
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
}

const SETTINGS_KEY = 'wm:settings';

export function defaultSettings(): Settings {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    quality: coarse ? 'medium' : 'high', reducedMotion: reduce, reducedEffects: false, showBorders: true,
    showLabels: true, autosave: true, seenHelp: false, bookmarks: [null, null, null, null],
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...d, ...JSON.parse(raw) } : d;
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
