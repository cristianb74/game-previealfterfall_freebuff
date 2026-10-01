import { GAME_INFO, SAVE_VERSION } from "./gameConfig";
import { BALANCE, migrationRefundFactor } from "./balance";
import { formatTime } from "./log";
import {
  BUILDINGS,
  BUILDING_BY_KEY,
  CORE_BUILDING_GATE_ZONE,
  THEMATIC_BY_ZONE,
  buildingUpgradeCost,
  floorThematicMap,
  type ThematicDef,
} from "./buildings";
import { getZone, isZoneUnlocked, legacyUnlockFloorV2 } from "./zones";
import { RECIPE_BY_ID } from "./crafting/recipes";
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
// SAVE_VERSION 3: rebalanceo de progresión — umbrales de zona en curva
// expZona (zones.ts), costos con zona+mult_tipo (buildings.ts). Los saves
// anteriores conservan TODO: el floor de zonas desbloqueadas se congela
// con los umbrales v2 (migrateV2ToV3) y la EXP nunca se toca.
// La cadena completa vive en migrateStateToCurrent() (idempotente) y se
// aplica también a los restores de la nube.
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
    unlockedZoneFloor: 1,
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
    nextLogEventId: 0,
    pendingZoneUnlock: null,
    craftingQueue: [],
    craftedInventory: {},
    activeBuffs: [],
    assignments: [],
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

// ---------------- LEGACY v2 COST CURVE (CONGELADA — no rebalancear) ----------------
// Precios EXACTOS que el juego cobraba con la curva v2 (lineal por bandas).
// Solo para migraciones: los refunds devuelven lo que SE PAGÓ, nunca lo que
// valdría hoy. costo_v2(L) = round(base·banda(L−1)) con base MAT 4+3(L−1),
// CMP 1+1.5(L−1); bandas: L1–3 ×1 · L4–6 ×1.3 · L7–8 ×1.6 · L9–10 ×2.
function legacyV2Band(level0: number): number {
  if (level0 <= 2) return 1;
  if (level0 <= 5) return 1.3;
  if (level0 <= 7) return 1.6;
  return 2;
}
export function legacyV2UpgradeCost(targetLevel: number): { materiales: number; componentes: number } {
  const l = Math.max(1, Math.min(BALANCE.buildingMaxLevel, Math.floor(targetLevel) || 1)) - 1;
  const band = legacyV2Band(l);
  return {
    materiales: Math.round((4 + 3 * l) * band),
    componentes: Math.round((1 + 1.5 * l) * band),
  };
}
/** Coste v2 acumulado de llevar un edificio de N0 a Nlevel. */
export function legacyV2CumulativeCost(level: number): { materiales: number; componentes: number } {
  let materiales = 0;
  let componentes = 0;
  for (let l = 1; l <= Math.max(0, Math.floor(level)); l++) {
    const c = legacyV2UpgradeCost(l);
    materiales += c.materiales;
    componentes += c.componentes;
  }
  return { materiales, componentes };
}

/** Compute the refund owed for collapsing the duplicate copies of one
 *  core key into the global base. `maxLevel` = preserved level. The refund
 *  is priced with the LEGACY v2 curve — exactly what the player paid. */
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
      const c = legacyV2CumulativeCost(paid);
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
 *  Internal step of migrateStateToCurrent(). */
function migrateV1ToV2(state: GameState): GameState {
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
  state.unlockedZoneFloor = legacyUnlockFloorV2(state.expTotal);

  // ---- 3. Refund (B) ----
  if (refundTotals.materiales > 0 || refundTotals.componentes > 0) {
    state.resources.materiales += refundTotals.materiales;
    state.resources.componentes += refundTotals.componentes;
    state.log.unshift({
      zona: undefined,
      origen: "manual",
      category: "CONSTR",
      subtype: "completada",
      fields: { acción: "reorganización" },
      mensaje: `Reorganización de la base: los edificios comunes pasan a ser globales · +${refundTotals.materiales} Materiales, +${refundTotals.componentes} Componentes reembolsados`,
      hora: formatTime(Date.now()),
      event_id: state.nextLogEventId++,
    });
  } else {
    state.log.unshift({
      zona: undefined,
      origen: "manual",
      category: "CONSTR",
      subtype: "completada",
      fields: { acción: "reorganización" },
      mensaje: "Reorganización de la base: los edificios comunes pasan a ser globales (Instalaciones por zona aparte)",
      hora: formatTime(Date.now()),
      event_id: state.nextLogEventId++,
    });
  }
  return state;
}

/** REBALANCEO v3: los umbrales de desbloqueo pasan de los valores v2
 *  (tope Z20 = 79.000) a la curva expZona 1500×1.28 (Z20 = 739.820).
 *  Reglas de seguridad:
 *  · La EXP TOTAL NUNCA se toca (niveles/EXP conservados).
 *  · NADIE pierde zonas: el floor histórico se congela en
 *    unlockedZoneFloor con los umbrales LEGACY_UNLOCK_EXP_V2 y
 *    unlockedZoneId() respeta max(curvaNueva, floor) para siempre.
 *  · Los niveles de edificios se conservan tal cual (solo se sanea
 *    corruptura: floor 0..10 — nada negativo).
 *  · Edificios EN OBRA al migrar: se reembolsa el exceso si la mejora
 *    ahora cuesta más de lo pagado (nunca se cobra de más).
 *  Idempotente: corre una sola vez (unlockedZoneFloor queda persistido). */
export function migrateV2ToV3(state: GameState): GameState {
  const anyState = state as unknown as Record<string, unknown>;
  // Idempotente: el floor persistido es la huella de la migración. Los
  // saves creados YA en v3 nacen con floor 1 (createInitialState) y no
  // heredan jamás los umbrales v2.
  if (typeof anyState.unlockedZoneFloor === "number") {
    return state;
  }

  // ---- 1. Floor de zonas desbloqueadas (congelado con umbrales v2) ----
  const floor = Math.max(
    1,
    Math.floor(Number(anyState.unlockedZoneFloor) || 0) || legacyUnlockFloorV2(state.expTotal),
  );
  state.unlockedZoneFloor = Math.max(floor, legacyUnlockFloorV2(state.expTotal));

  // ---- 2. Saneo de niveles (conservando lo legítimo) ----
  for (const coreKey of CORE_KEYS) {
    const b = state.base?.[coreKey];
    if (b) {
      const lvl = Math.max(0, Math.min(BALANCE.buildingMaxLevel, Math.floor(b.level) || 0));
      if (lvl !== b.level) b.level = lvl;
    }
  }
  for (const zid of Object.keys(state.zones ?? {}).map(Number)) {
    const z = state.zones[zid];
    if (z?.thematic) floorThematicMap(z.thematic as Record<string, { level: number; upgradeFinishAt: unknown }>);
  }

  // ---- 3. Mejoras EN CURSO al migrar ----
  // La mejora en obra se completará al precio NUEVO (v3). Para que nadie
  // pague de más por una obra YA iniciada, se reembolsa la DIFERENCIA
  // entre el precio nuevo y el precio v2 que ya pagó. Nunca se regala
  // nada (si el precio nuevo fuera menor, la diferencia es 0).
  const refundTotals = { materiales: 0, componentes: 0 };
  const gateOf = (key: BuildingKey) => CORE_BUILDING_GATE_ZONE[key] ?? 1;
  const addExcess = (
    level: number,
    zoneId: number,
    tierKey: string,
    targetLevel: number,
  ) => {
    const newCost = buildingUpgradeCost(level, zoneId, { tier: tierKey });
    const paidV2 = legacyV2UpgradeCost(targetLevel);
    refundTotals.materiales += Math.max(0, newCost.materiales - paidV2.materiales);
    refundTotals.componentes += Math.max(0, newCost.componentes - paidV2.componentes);
  };
  for (const coreKey of CORE_KEYS) {
    const b = state.base?.[coreKey];
    if (!b?.upgradeFinishAt) continue;
    addExcess(b.level, gateOf(coreKey), coreKey, b.level + 1);
  }
  for (const zid of Object.keys(state.zones ?? {}).map(Number)) {
    const z = state.zones[zid];
    if (!z?.thematic) continue;
    for (const key of Object.keys(z.thematic)) {
      const b = z.thematic[key];
      if (!b?.upgradeFinishAt) continue;
      addExcess(b.level, zid, key, b.level + 1);
    }
  }
  if (refundTotals.materiales > 0 || refundTotals.componentes > 0) {
    state.resources.materiales += refundTotals.materiales;
    state.resources.componentes += refundTotals.componentes;
    state.log.unshift({
      zona: undefined,
      origen: "manual",
      category: "CONSTR",
      subtype: "completada",
      fields: { acción: "reembolso" },
      mensaje: `Ajuste de economía: obras en curso reembolsadas por la diferencia de precio (+${refundTotals.materiales} Materiales, +${refundTotals.componentes} Componentes)`,
      hora: formatTime(Date.now()),
      event_id: state.nextLogEventId++,
    });
  }

  state.version = SAVE_VERSION;
  return state;
}

/** Migration chain entry point: brings ANY legacy state to the CURRENT
 *  SAVE_VERSION. Exported — cloud restores bypass loadGame() and need
 *  this too. Migrations must be idempotent. */
export function migrateStateToCurrent(state: GameState): GameState {
  let s = migrateV1ToV2(state);
  s = migrateV2ToV3(s);
  return s;
}

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
  // Cadena completa de migraciones (idempotente): forma v1→v2 y rebalanceo
  // v3 (floor de zonas + saneo de niveles). Corre en CADA carga para que
  // cualquier documento legado (local o nube) aterrice en la versión
  // actual; migrateV2ToV3 es no-op cuando el floor ya está persistido.
  s = migrateStateToCurrent(s);
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
      continue;
    }
    // Backfill: saves predating the 4-buildings-per-zone expansion get the
    // missing keys at N0. Existing buildings keep their levels untouched;
    // THEMATIC_BY_ZONE is the authoritative definition per zone.
    for (const def of THEMATIC_BY_ZONE[id] ?? []) {
      if (!z.thematic[def.key]) {
        z.thematic[def.key] = { key: def.key, level: 0, upgradeFinishAt: null };
      }
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
  // A persisted scavenge session whose shape predates the 8-fixed-point
  // redesign (old: {expiresAt, claimed, loot board}) is simply dropped on
  // load — the counter survives, only the in-flight session is lost.
  if (s.scavengeEvent) {
    const ev = s.scavengeEvent as unknown as { board?: unknown; claimed?: unknown; expiresAt?: unknown };
    const boardOk =
      Array.isArray(ev.board) &&
      ev.board.length === 8 &&
      ev.board.every((c) => c && typeof c === "object" && "id" in c && "result" in c);
    if (!boardOk || ev.claimed !== undefined || ev.expiresAt !== undefined) {
      s.scavengeEvent = null;
    }
  } else {
    s.scavengeEvent = null;
  }
  if (typeof s.nextExplorationId !== "number") s.nextExplorationId = (s.explorationsDone ?? 0) + 1;
  // CRAFTING backfill (queue + inventory live in the same save envelope):
  // corrupt/missing fields are reset safely and unknown recipe ids dropped.
  if (!Array.isArray(s.craftingQueue)) s.craftingQueue = [];
  s.craftingQueue = s.craftingQueue.filter(
    (q) =>
      q &&
      typeof q.uid === "string" &&
      typeof q.recipeId === "string" &&
      RECIPE_BY_ID[q.recipeId] != null &&
      typeof q.timeSeconds === "number",
  );
  if (s.craftedInventory == null || typeof s.craftedInventory !== "object") {
    s.craftedInventory = {};
  }
  for (const id of Object.keys(s.craftedInventory)) {
    if (RECIPE_BY_ID[id] == null) delete s.craftedInventory[id];
  }
  // Timed-buff backfill ({effectId, expiresAt}): pre-buff saves start with
  // an empty list — old saves never had buffs, nothing to preserve.
  if (!Array.isArray(s.activeBuffs)) s.activeBuffs = [];
  s.activeBuffs = s.activeBuffs.filter(
    (b) => b && typeof b.effectId === "string" && typeof b.expiresAt === "number",
  );
  // ASIGNACIONES backfill: pre-assignment saves never had them. Drop
  // malformed entries; unknown recipe ids and wrong-kind recipes are
  // removed (assignments only exist for non-consumables).
  if (!Array.isArray(s.assignments)) s.assignments = [];
  s.assignments = s.assignments.filter(
    (a) =>
      a &&
      typeof a.id === "string" &&
      typeof a.recipeId === "string" &&
      RECIPE_BY_ID[a.recipeId] != null &&
      (a.targetType === "zone" || a.targetType === "npc") &&
      typeof a.targetId === "string" &&
      typeof a.startedAt === "number" &&
      typeof a.endsAt === "number",
  );
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
  return gate != null && isZoneUnlocked(state, gate);
}
export { BUILDING_BY_KEY };
export type { ThematicDef };
