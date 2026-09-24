import { GAME_INFO, SAVE_VERSION } from "./gameConfig";
import { BALANCE, migrationRefundFactor } from "./balance";
import {
  BUILDINGS,
  BUILDING_BY_KEY,
  CORE_BUILDING_GATE_ZONE,
  THEMATIC_BY_ZONE,
  cumulativeUpgradeCost,
  type ThematicDef,
} from "./buildings";
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
// SAVE_VERSION 2: buildings redesign — GameState.base (global core)
// + zones[].thematic (local thematic). v1 shapes are migrated by
// migrateV1ToV2 (also applied to cloud restores).
// ============================================================

const DB_NAME = "afterfall-db";
const DB_STORE = "saves";
const DB_VERSION = 1;
const LS_KEY = GAME_INFO.saveKey;

const CORE_KEYS: BuildingKey[] = BUILDINGS.map((b) => b.key);

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

/** GLOBAL base: the 6 core buildings, one shared instance, all N0. */
export function createInitialBase(): Record<BuildingKey, BuildingState> {
  const base = {} as Record<BuildingKey, BuildingState>;
  for (const key of CORE_KEYS) {
    base[key] = { key, level: 0, upgradeFinishAt: null };
  }
  return base;
}

/** A zone's THEMATIC buildings at N0 (host zones only — 1–2 per zone). */
function createThematicForZone(zoneId: number): Record<string, BuildingState> {
  const thematic: Record<string, BuildingState> = {};
  for (const def of THEMATIC_BY_ZONE[zoneId] ?? []) {
    thematic[def.key] = { key: def.key, level: 0, upgradeFinishAt: null };
  }
  return thematic;
}

export function createInitialZones(): Record<number, ZoneProgressState> {
  const zones: Record<number, ZoneProgressState> = {};
  for (let id = 1; id <= 20; id++) {
    zones[id] = {
      thematic: createThematicForZone(id),
      assignedNpcId: null,
    };
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
    explorationStates: {},
    autoFarms: {},
    autoExplored: {},
    explorationsDone: 0,
    manualExplorationsDone: 0,
    nextExplorationId: 1,
    explorationsSinceLastNPC: 0,
    explorationsSinceLastScavenge: 0,
    scavengeEvent: null,
    base: createInitialBase(),
    zones: createInitialZones(),
    npcs: [],
    npcCycles: {},
    log: [],
    pendingZoneUnlock: null,
  };
}

// ============================================================
// MIGRATION v1 → v2 (Estrategia B: máximo + reembolso de duplicados)
//
// 1. CORE buildings: for each of the 6 keys, the GLOBAL base level is the
//    MAX "effective level" across all zone copies (an in-flight upgrade
//    counts as level+1 — the run is completed instantly on migration).
//    The copy that reaches the max is PRESERVED (lowest zone id wins
//    ties); every other copy with level > 0 is REFUNDED at its
//    cumulative upgrade cost × migrationRefundFactor (BALANCE-adjacent
//    tunable) — nothing the player paid is lost twice or lost at all.
// 2. THEMATIC: each old exclusiveBuilding migrates to zones[id].thematic
//    under its SAME key with its EXACT level and running timer — old
//    investments are never reset.
// 3. Old gates are respected: a core building whose gate zone
//    (CORE_BUILDING_GATE_ZONE) was never reached cannot be above N0
//    in a v1 save anyway (ZONE_BUILDINGS gate), so max() keeps it 0.
// Idempotent: runs once (v1 keys disappear from the new shape).
// ============================================================

/** Effective level of a v1 copy: finished levels + an in-flight upgrade. */
function v1EffectiveLevel(b: BuildingState | undefined): number {
  if (!b) return 0;
  const done = Math.max(0, Math.min(BALANCE.buildingMaxLevel, b.level));
  return b.upgradeFinishAt != null ? Math.min(BALANCE.buildingMaxLevel, done + 1) : done;
}

/** Compute the refund owed for collapsing the duplicate copies of one
 *  core key into the global base. `maxLevel` = preserved level. */
function refundForCoreKey(
  copies: { zid: number; effective: number; raw: BuildingState | undefined }[],
  maxLevel: number,
): { materiales: number; componentes: number } {
  let materiales = 0;
  let componentes = 0;
  let preserved = false;
  for (const copy of copies) {
    if (copy.effective === maxLevel && !preserved) {
      preserved = true; // lowest zone id reaches the max first → keep it
      continue;
    }
    // Every non-preserved copy refunds the levels it PAID for (its raw
    // finished levels), including an in-flight run (already paid).
    const paid = Math.max(0, Math.min(BALANCE.buildingMaxLevel, copy.raw?.level ?? 0));
    if (paid > 0 && paid <= maxLevel) {
      const c = cumulativeUpgradeCost(paid);
      materiales += c.materiales;
      componentes += c.componentes;
    }
  }
  return {
    materiales: Math.round(materiales * migrationRefundFactor),
    componentes: Math.round(componentes * migrationRefundFactor),
  };
}

/** Migrate a v1 GameState (or any state missing the v2 shape) to v2.
 *  Exported: cloud restores bypass loadGame() and need this too. */
export function migrateV1ToV2(state: GameState): GameState {
  const anyState = state as unknown as Record<string, unknown>;
  if (anyState.base && typeof anyState.base === "object") {
    // Already v2 — nothing to do (migrations must be idempotent).
    return state;
  }

  const refundTotals = { materiales: 0, componentes: 0 };
  const base = createInitialBase();

  // ---- 1. Core buildings: max across zones + refund duplicates ----
  for (const coreKey of CORE_KEYS) {
    const copies: { zid: number; effective: number; raw: BuildingState | undefined }[] = [];
    for (const zid of Object.keys(state.zones ?? {}).map(Number)) {
      const zs = state.zones[zid] as unknown as {
        buildings?: Record<string, BuildingState>;
        exclusiveBuilding?: BuildingState;
      };
      copies.push({ zid, effective: v1EffectiveLevel(zs?.buildings?.[coreKey]), raw: zs?.buildings?.[coreKey] });
    }
    const maxLevel = Math.min(BALANCE.buildingMaxLevel, Math.max(0, ...copies.map((c) => c.effective)));
    base[coreKey] = { key: coreKey, level: maxLevel, upgradeFinishAt: null };
    const refund = refundForCoreKey(copies, maxLevel);
    refundTotals.materiales += refund.materiales;
    refundTotals.componentes += refund.componentes;
  }

  // ---- 2. Zones: thematic only (exclusive → thematic, exact level) ----
  for (const zid of Object.keys(state.zones ?? {}).map(Number)) {
    const oldZ = state.zones[zid] as unknown as {
      exclusiveBuilding?: BuildingState;
      assignedNpcId: string | null;
    };
    const thematic: Record<string, BuildingState> = {};
    const excl = oldZ?.exclusiveBuilding;
    if (excl && excl.level > 0) {
      // Preserve the exact level and any running construction timer.
      thematic[excl.key] = { key: excl.key, level: excl.level, upgradeFinishAt: excl.upgradeFinishAt ?? null };
    } else {
      // Host zone without progress: ensure defs exist at N0 (unless the
      // zone's thematic building was already carried above).
      for (const def of THEMATIC_BY_ZONE[zid] ?? []) {
        thematic[def.key] = { key: def.key, level: 0, upgradeFinishAt: null };
      }
    }
    state.zones[zid] = { thematic, assignedNpcId: oldZ?.assignedNpcId ?? null };
  }

  state.base = base;

  // ---- 3. Refund (B) ----
  if (refundTotals.materiales > 0 || refundTotals.componentes > 0) {
    state.resources.materiales += refundTotals.materiales;
    state.resources.componentes += refundTotals.componentes;
    state.log.unshift({
      t: Date.now(),
      msg: `Reorganización de la base: los edificios comunes pasan a ser globales · +${refundTotals.materiales} Materiales, +${refundTotals.componentes} Componentes reembolsados`,
      kind: "build",
    });
  } else {
    state.log.unshift({
      t: Date.now(),
      msg: "Reorganización de la base: los edificios comunes pasan a ser globales (Instalaciones por zona aparte)",
      kind: "build",
    });
  }
  return state;
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

/** Ensure a loaded state is fully valid for the CURRENT SAVE_VERSION
 *  (version bumps via migrate, then defensive repairs). */
function normalizeState(state: GameState): GameState {
  let s = state;
  if (!s.base || typeof s.base !== "object") {
    // v1 state (no base field) → full v2 migration.
    s = migrateV1ToV2(s);
  }
  s.version = SAVE_VERSION;
  // repair missing fields defensively
  if (!s.resources) s.resources = emptyResources();
  if (!s.npcs) s.npcs = [];
  if (!s.base) s.base = createInitialBase();
  for (const coreKey of CORE_KEYS) {
    if (!s.base[coreKey]) s.base[coreKey] = { key: coreKey, level: 0, upgradeFinishAt: null };
  }
  if (!s.zones) s.zones = createInitialZones();
  for (let id = 1; id <= 20; id++) {
    const z = s.zones[id];
    if (!z) {
      s.zones[id] = { thematic: createThematicForZone(id), assignedNpcId: null };
      continue;
    }
    if (!z.thematic || typeof z.thematic !== "object") {
      const carried = z.assignedNpcId;
      s.zones[id] = { thematic: createThematicForZone(id), assignedNpcId: carried ?? null };
    }
  }
  if (!s.npcCycles) s.npcCycles = {};
  if (!s.log) s.log = [];
  if (typeof s.foodMin !== "number") s.foodMin = BALANCE.startingFoodMin;
  if (typeof s.waterMin !== "number") s.waterMin = BALANCE.startingWaterMin;
  if (!s.autoFarms || typeof s.autoFarms !== "object") s.autoFarms = {};
  if (!s.autoExplored || typeof s.autoExplored !== "object") s.autoExplored = {};
  if (!s.explorationStates || typeof s.explorationStates !== "object") s.explorationStates = {};
  if (typeof s.explorationsSinceLastNPC !== "number") s.explorationsSinceLastNPC = 0;
  if (typeof s.explorationsSinceLastScavenge !== "number") s.explorationsSinceLastScavenge = 0;
  // A persisted active event whose board already expired while away is
  // simply closed on load (unclaimed loot is lost by design).
  if (s.scavengeEvent) {
    if (Date.now() >= s.scavengeEvent.expiresAt) s.scavengeEvent = null;
    else if (!Array.isArray(s.scavengeEvent.board) || !Array.isArray(s.scavengeEvent.claimed)) {
      s.scavengeEvent = null;
    }
  } else {
    s.scavengeEvent = null;
  }
  if (typeof s.nextExplorationId !== "number") s.nextExplorationId = (s.explorationsDone ?? 0) + 1;
  if (typeof s.manualExplorationsDone !== "number") s.manualExplorationsDone = s.explorationsDone ?? 0;
  // NPC recruitment migration: NPCs owned before the recruitment system
  // existed are grandfathered as "active" (already part of the shelter).
  for (const npc of s.npcs ?? []) {
    if (!npc.status) npc.status = "active";
  }
  return s;
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  let envelope: SaveEnvelope | null = null;
  try {
    const fromIdb = await idbGet<SaveEnvelope>("current");
    if (fromIdb) envelope = fromIdb;
  } catch {
    // fall through to localStorage
  }
  if (!envelope) envelope = lsGet<SaveEnvelope>();
  if (!envelope) return null;
  envelope.state = normalizeState(envelope.state);
  return envelope;
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

// ---- kept for external gating checks (core building availability) ----
export { CORE_BUILDING_GATE_ZONE as CORE_BUILDING_GATES };
export function coreBuildingUnlocked(state: GameState, key: BuildingKey): boolean {
  const gate = CORE_BUILDING_GATE_ZONE[key];
  return gate != null && state.expTotal >= getZone(gate).unlockExp;
}
export { BUILDING_BY_KEY };
export type { ThematicDef };
