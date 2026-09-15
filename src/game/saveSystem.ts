import { GAME_INFO, SAVE_VERSION } from "./gameConfig";
import { BALANCE } from "./balance";
import { BUILDINGS } from "./buildings";
import { getZone } from "./zones";
import type {
  BuildingKey,
  BuildingState,
  GameState,
  NpcSurvivor,
  ResourceKey,
  ZoneProgressState,
} from "./types";

// ============================================================
// AFTERFALL — persistent save system.
// IndexedDB preferred; falls back to localStorage.
// Versioned; migrations keep old saves alive after updates.
// ============================================================

const DB_NAME = "afterfall-db";
const DB_STORE = "saves";
const DB_VERSION = 1;
const LS_KEY = GAME_INFO.saveKey;

function emptyResources(): Record<ResourceKey, number> {
  return {
    materiales: 0,
    agua: 0,
    comida: 0,
    medicamentos: 0,
    componentes: 0,
    energia: 0,
    dinero: 0,
  };
}

export function createInitialZones(): Record<number, ZoneProgressState> {
  const zones: Record<number, ZoneProgressState> = {};
  for (let id = 1; id <= 20; id++) {
    const buildings = {} as Record<BuildingKey, BuildingState>;
    for (const b of BUILDINGS) {
      buildings[b.key] = { key: b.key, level: 0, upgradeFinishAt: null };
    }
    zones[id] = { buildings, assignedNpcId: null };
  }
  return zones;
}

/** Create the initial game state. `now` is injected for testability. */
export function createInitialState(survivor: GameState["survivor"], now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTickAt: now,
    survivor,
    exp: 0,
    expTotal: 0,
    health: BALANCE.maxHealth,
    foodMin: BALANCE.startingFoodMin,
    waterMin: BALANCE.startingWaterMin,
    lastEnergyRegenAt: now,
    resources: { ...emptyResources(), energia: BALANCE.maxEnergy },
    currentZoneId: 1,
    exploration: null,
    autoFarms: {},
    autoExplored: {},
    explorationsDone: 0,
    zones: createInitialZones(),
    npcs: [],
    npcCycles: {},
    log: [],
    pendingZoneUnlock: null,
  };
}

// ---------------- IndexedDB ----------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as T) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

// ---------------- localStorage fallback ----------------

function lsSet(value: unknown): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    // storage full or blocked; ignore
  }
}

function lsGet<T>(): T | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function lsHasSave(): boolean {
  try {
    return localStorage.getItem(LS_KEY) != null;
  } catch {
    return false;
  }
}

export function lsClearSave(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

// ---------------- public API ----------------

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

export async function saveGame(state: GameState): Promise<void> {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state,
  };
  try {
    await idbSet("current", envelope);
  } catch {
    lsSet(envelope);
  }
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  try {
    const fromIdb = await idbGet<SaveEnvelope>("current");
    if (fromIdb) return migrate(fromIdb);
  } catch {
    // fall through to localStorage
  }
  const fromLs = lsGet<SaveEnvelope>();
  if (fromLs) return migrate(fromLs);
  return null;
}

export async function hasSave(): Promise<boolean> {
  try {
    const s = await loadGame();
    return s != null;
  } catch {
    return lsHasSave();
  }
}

export async function deleteSave(): Promise<void> {
  try {
    await idbSet("current", null);
  } catch {
    // ignore
  }
  lsClearSave();
}

/** Migrations between save versions. Never drop a save if avoidable. */
function migrate(envelope: SaveEnvelope): SaveEnvelope {
  let state = envelope.state;
  let v = envelope.version ?? 1;

  // Example migration pattern:
  // if (v === 1 && state.npcs) { ... v = 2; }

  if (state && typeof state === "object") {
    state.version = v;
    // repair missing fields defensively
    if (!state.resources) state.resources = emptyResources();
    if (!state.npcs) state.npcs = [];
    if (!state.zones) state.zones = createInitialZones();
    if (!state.npcCycles) state.npcCycles = {};
    if (!state.log) state.log = [];
    if (typeof state.foodMin !== "number") state.foodMin = BALANCE.startingFoodMin;
    if (typeof state.waterMin !== "number") state.waterMin = BALANCE.startingWaterMin;
    // Migrate old global autoExplore/autoRun to per-zone format
    if (!state.autoExplored || typeof state.autoExplored !== "object") {
      const oldAuto = (state as unknown as Record<string, unknown>).autoExplore;
      const oldRun = (state as unknown as Record<string, unknown>).autoRun;
      state.autoExplored = {};
      state.autoFarms = {};
      if (oldAuto === true && oldRun && typeof oldRun === "object") {
        const r = oldRun as { zoneId?: number };
        if (r.zoneId) {
          state.autoExplored[r.zoneId] = true;
          state.autoFarms[r.zoneId] = r as unknown as import("./types").ExplorationRun;
        }
      }
    }
    if (!state.autoFarms || typeof state.autoFarms !== "object") state.autoFarms = {};
  }

  return { version: v, savedAt: envelope.savedAt, state };
}

/** Convenience helpers used by UI to format NPC production totals. */
export function npcTotalsLabel(npc: NpcSurvivor): string {
  const entries = Object.entries(npc.productionTotals).filter(([, v]) => v > 0);
  if (entries.length === 0) return "Sin producción aún";
  return entries
    .map(([k, v]) => {
      const key = k as ResourceKey;
      const isTime = key === "comida" || key === "agua";
      return `+${v}${isTime ? " min" : ""} ${key}`;
    })
    .join(", ");
}
