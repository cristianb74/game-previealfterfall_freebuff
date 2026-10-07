// AFTERFALL — shared types. No combat, no crafting, no premium currency.

import type {
  LogCategory,
  LogCommonFields,
  LogEvent,
  LogFieldInput,
  LogFieldObject,
  LogFieldRecord,
  LogFieldValue,
} from "./log";

export {
  LogCategory,
  LogCommonFields,
  LogEvent,
  LogFieldInput,
  LogFieldObject,
  LogFieldRecord,
  LogFieldValue,
};

export type StatKey =
  | "fuerza"
  | "resistencia"
  | "agilidad"
  | "percepcion"
  | "inteligencia"
  | "voluntad";

export type ResourceKey =
  | "materiales"
  | "agua"
  | "comida"
  | "medicamentos"
  | "componentes"
  | "energia"
  | "dinero";

/** Resource metadata (display only — balance lives in gameConfig/balance). */
export type ResourceMeta = {
  key: ResourceKey;
  label: string;
  short: string;
  icon: string;
  kind: "time" | "unit" | "energy" | "money";
};

export type Stats = Record<StatKey, number>;

/** One of the 6 core buildings — GLOBAL since save v2: a single shared
 *  instance per character (GameState.base); its bonus applies in every zone. */
export type BuildingKey =
  | "cocina"
  | "tanque"
  | "almacen"
  | "enfermeria"
  | "taller"
  | "generador";

/** Zone-thematic building id (defs in buildings.ts). Includes the four
 *  former "exclusive" keys (invernadero, laboratorio, perforadora,
 *  hormigonera) unchanged, so old investments carry over untouched. */
export type ThematicBuildingKey = string;

export type NpcTypeCode = "B" | "G" | "A" | "R" | "D";

export type Profession = string;

export interface Survivor {
  name: string;
  profession: Profession;
  portrait: string; // /assets/survivor/s-N.svg
  stats: Stats;
}

export interface NpcSurvivor {
  id: string; // B01…D04
  name: string;
  alias: string;
  profession: Profession;
  portrait: string; // /assets/npc/B01.svg
  type: NpcTypeCode;
  stats: Stats;
  specialization: BuildingKey;
  assignedZoneId: string | null;
  discoveredAt: number;
  productionTotals: Record<ResourceKey, number>;
  /** Recruitment flow: candidates found while exploring must be recruited
   *  from the Equipo tab before they can be assigned to a zone.
   *  Absent in pre-migration saves → treated as "active". */
  status?: "candidate" | "active";
  /** STAND-BY: cuándo entró a la lista de espera (ms, timeline real).
   *  Solo culto en candidates; saves viejos sin foundAt reciben now al
   *  cargar (normalizeState en saveSystem.ts). */
  foundAt?: number;
  /** Momento en que se va del refugio si nadie lo recluta:
   *  foundAt + BALANCE.npcStandbyMs (derivado al crear; se recalcula en
   *  migración si falta). */
  expiresAt?: number;
  /** Multiplicador de consumo propio (default 1.0): comida/h = agua/h =
   *  *_PER_HOUR_PLAYER × NPC_CONSUMPTION_FACTOR × consumptionMultiplier.
   *  Opcional por NPC para balancear «bocas grandes»/«bocas chicas». */
  consumptionMultiplier?: number;
}

export interface BuildingState {
  /** Core key (GameState.base) or thematic id (zones[].thematic). */
  key: BuildingKey | ThematicBuildingKey;
  level: number; // 0–10
  upgradeFinishAt: number | null; // absolute timestamp
}

export type ZoneStatus = "locked" | "unlocked";

export interface ZoneProgressState {
  /** Zone-thematic buildings (1–2 per zone). LOCAL: they only boost finds
   *  in this zone. Old saves migrate here from buildings[] +
   *  exclusiveBuilding (see saveSystem.migrate, SAVE_VERSION 2). */
  thematic: Record<ThematicBuildingKey, BuildingState>;
  assignedNpcId: string | null;
}

export interface ExplorationRun {
  zoneId: number;
  startedAt: number;
  finishAt: number;
  /** True if this run was started by the background auto-farm. */
  auto?: boolean;
  /** Global unique exploration ID assigned at start (manual) or completion (auto). */
  expId?: number;
}

/** Represents a single line of the game log, in the format:
   *  [HH:MM:SS] [CATEGORY] subtype | campo=valor | campo=valor | ...
   * Fields zona and origen are required whenever applicable and are carried
   * as top-level properties; the rest of the dynamic pairs live in `fields`.
   * Optional narrative text is preserved for the player-facing summary. */
// LogEvent is re-exported from src/game/log to avoid duplication.

export interface GameState {
  version: number;
  createdAt: number;
  lastTickAt: number;
  /** Última vez que se cobró el consumo de comida/agua (ms, timeline
   *  real). El consumo (jugador + NPC reclutados) se cobra desde este
   *  timestamp con tope BALANCE.npcConsumptionOfflineCapMs (24 hs); al
   *  aplicar el consumo se adelanta a la marca horaria procesada.
   *  Saves previos: normalizeState las gene con lastTickAt. */
  lastConsumptionAt?: number;
  survivor: Survivor;
  exp: number;
  expTotal: number;
  health: number;
  /** Food & water survival time remaining, in minutes. */
  foodMin: number;
  waterMin: number;
  /** Energy is derived from lastEnergyRegenAt — never stored directly. */
  lastEnergyRegenAt: number;
  resources: Record<ResourceKey, number>;
  currentZoneId: number;
  /** Per-zone manual explorations (each zone runs independently). */
  explorationStates: Record<number, ExplorationRun>;
  /** Per-zone background auto-exploration runs (no energy, reduced EXP,
   *  never advances the frontier, never discovers NPCs). */
  autoFarms: Record<number, ExplorationRun | null>;
  /** Per-zone toggle: which zones have the auto-farm enabled. */
  autoExplored: Record<number, boolean>;
  explorationsDone: number;
  /** Manual explorations only (for summary). */
  manualExplorationsDone: number;
  /** Global unique exploration ID (incremented at start, never reused). */
  nextExplorationId: number;
  /** Counter since last NPC discovery (for balanced spawn system). */
  explorationsSinceLastNPC: number;
  /** Manual explorations since the last SCAVENGE event (stepped chance
   *  via BALANCE.scavengeTiers — same pattern as the NPC counter). */
  explorationsSinceLastScavenge: number;
  /** The single active scavenge session (MANUAL runs only: a live search
   *  of the 8 fixed points). Null = inactive. */
  scavengeEvent: ActiveScavengeEvent | null;
  /** GLOBAL core buildings (cocina, tanque, …): one shared instance per
   *  character, bonus applies to every zone (SAVE_VERSION ≥ 2). */
  base: Record<BuildingKey, BuildingState>;
  zones: Record<number, ZoneProgressState>;
  npcs: NpcSurvivor[];
  /** Per-NPC production accumulator timestamps (absolute ms). */
  npcCycles: Record<string, number>;
  /** Global correlative log id — advances by one on every pushed event so
   *  the whole session forms one unambiguous sequence. */
  nextLogEventId: number;
  log: LogEvent[];
  /** Badges de actividad por pantalla del nav inferior: el próximo log
   *  event_id que sigue "sin ver" en esa pantalla. Cualquier evento con
   *  event_id >= activitySeen[pantalla] cuya categoría mapea a esa pantalla
   *  enciende su punto; entrar a la pantalla marca todo como visto
   *  (hasta el id actual). Persiste con el resto del guardado. */
  activitySeen: Partial<Record<Screen, number>>;
  pendingZoneUnlock: number | null;
  /** REBALANCEO v3: floor de zonas desbloqueadas, congelado en migración
   *  con los umbrales v2 (LEGACY_UNLOCK_EXP_V2). unlockedZoneId() devuelve
   *  max(curvaNueva(expTotal), floor) — nadie pierde zonas ya desbloqueadas
   *  aunque la EXP total quede por debajo de los umbrales nuevos. */
  unlockedZoneFloor?: number;
  /** CRAFTING: sequential queue (item 0 is the active craft; timestamps in
   *  Date.now()). Only this queue and craftedInventory are crafting's
   *  persistence footprint — resources always live in the real GameState. */
  craftingQueue: CraftingQueueItem[];
  /** Finished items: recipe id → count. Passive items apply while count ≥ 1
   *  (no equip slots in this game); consumables decrement via useCraftedItem. */
  craftedInventory: Record<string, number>;
  /** Timed buffs from crafted consumables ({effectId, expiresAt}), absolute
   *  Date.now() ms. Empty in pre-buff saves (backfilled on load). */
  activeBuffs: ActiveBuff[];
  /** ASIGNACIONES: active assignments of crafted non-consumables to zones
   *  or NPCs. Expired entries are pruned on load and by the tick (same
   *  catch-up pattern as the crafting queue). Backfilled on load. */
  assignments: CraftedAssignment[];
  /** Aviso de consumo: true mientras falta (min/0) comida/agua y los NPC
   *  reclutados están SIN su bonus de especialidad. Campos opcionales —
   *  saves previos nunca los tuvieron (undefined = false). El flag se
   *  usa SOLO para loguear la transición (se acabó / volvió), la regla
   *  real siempre se recalcula desde foodMin/waterMin. */
  npcBonusLostFood?: boolean;
  npcBonusLostWater?: boolean;
}

/** One timed effect of a crafted consumable. Expired entries are pruned
 *  lazily whenever bonuses are read — no tick needed to expire them. */
export interface ActiveBuff {
  /** Stable effect id, e.g. "consumo_comida_agua" (matches effectData.type). */
  effectId: string;
  /** Absolute expiry timestamp (Date.now() ms). */
  expiresAt: number;
}

/** One active assignment of a crafted NON-CONSUMABLE item to a zone or NPC
 *  (modelo de activación por asignaciones). Created from Mochila's "Asignar":
 *  quantity −1 at creation (no refund on expiry/cancel) and the recipe's
 *  effect only applies to the target while now < endsAt. Timestamps live on
 *  the real Date.now() timeline, like the crafting queue. */
export interface CraftedAssignment {
  /** Unique instance id (`${recipeId}-${startedAtMs}-${rand}`). */
  id: string;
  recipeId: string;
  targetType: "zone" | "npc";
  /** Zone id as a string (matches assignedZoneId) or NPC id (B01…D04). */
  targetId: string;
  /** Frozen recipe effect line at assignment time (UI display). */
  effect: string;
  startedAt: number; // Date.now() ms
  endsAt: number; // Date.now() ms
}

/** One queued craft. endsAt is only meaningful while the item is being
 *  worked on (index 0); waiting items start when the active one finishes. */
export interface CraftingQueueItem {
  /** Unique instance id (`${recipeId}-${startedAtMs}-${rand}`). */
  uid: string;
  recipeId: string;
  /** Frozen recipe data at queue time (recipes may be rebalanced later). */
  name: string;
  icon: string;
  /** Craft duration in seconds (from the recipe at queue time). */
  timeSeconds: number;
  /** Frozen cost snapshot (for exact refunds on cancel). */
  costs: Partial<Record<ResourceKey, number>>;
  /** When the active item started crafting (Date.now()); waiting items keep
   *  the value at 0 until they become active. */
  startedAt: number;
  /** When the active item will finish (Date.now()); waiting items 0. */
  endsAt: number;
}

/** A craftable recipe. Centralized in crafting/recipes.ts — UI and logic
 *  read only from there so rebalancing means editing one file. */
export interface Recipe {
  id: string;
  name: string;
  category: "exploracion" | "recoleccion" | "supervivencia" | "tecnico" | "proteccion";
  icon: string;
  description: string;
  effect: string;
  timeSeconds: number;
  /** Costs over the REAL resource keys; comida/agua are survival MINUTES
   *  in this game (foodMin/waterMin), energia is 0–24 points. */
  costs: Partial<Record<ResourceKey, number>>;
  /** Structured effect payload for future wiring (not consumed by any
   *  system yet). */
  effectData?: Record<string, number | string>;
  /** ASIGNACIONES (modelo de activación): los no-consumibles NO son
   *  pasivos por posesión — se asignan a un destino y su efecto solo
   *  aplica ahí mientras dure la asignación. Target fijado por receta
   *  ('zone' = una zona concreta, 'npc' = un superviviente concreto)
   *  y duración por receta (7200 s = 2 h por defecto). Consumibles y
   *  unlock (radio) no lo definen. */
  assignTarget?: "zone" | "npc";
  assignDurationSeconds?: number;
}

export interface ExplorationFinding {
  kind: "resource" | "damage" | "npc" | "nothing" | "event";
  resource?: ResourceKey;
  amount?: number;
  damage?: number;
  cause?: string;
  npcId?: string;
  /** Rare find (Percepción tier): amount was tripled. */
  rare?: boolean;
  /** Manual-only special event payload. */
  event?: SpecialEvent;
}

/** Manual-exploration special events. Auto-farm can never roll these. */
export interface SpecialEvent {
  id: string;
  /** Player-facing narrative line (logged and shown in the toast). */
  text: string;
  /** Flat money reward. */
  money?: number;
  /** Health restored (found supplies, safe shelter...). */
  heal?: number;
  /** Resource grants (unit resources or minutes for Comida/Agua). */
  grants?: { resource: ResourceKey; amount: number }[];
}

export interface ExplorationOutcome {
  zoneId: number;
  exp: number;
  findings: ExplorationFinding[];
}

// ============================================================
// SCAVENGE EVENT — exploration minigame (8 fixed search points, no combat).
// Landed on MANUAL (real interactive session; quit anytime keeping
// everything already found) or AUTO (all points resolved in chain, no
// UI). Stored in the GameState so the session survives reloads. Damage
// hits the REAL survivor health, floored mid-session so a bad streak can
// never knock the player to 0 inside the event.
// ============================================================

/** The 8 fixed search points of the SCAVENGE location, in board order.
 *  Generic ids — each location (mapa por focus) labels them with the
 *  object that actually sits at that spot (scavengeLocations.ts). */
export type ScavengePointId = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7" | "p8";

/** Loot of one search point, already mapped to Afterfall keys: unit
 *  resources go to `resources[resource]`, `comida`/`agua` carry MINUTES
 *  (converted with scavengeFoodWaterMinutes) and go to foodMin/waterMin. */
export interface ScavengeLoot {
  resource: ResourceKey;
  amount: number;
}

/** Result of searching one point (already rolled at tap time). */
export interface ScavengePointResult {
  /** "loot" = gained something; "nada" = nothing; "dano" = damage. */
  kind: "loot" | "nada" | "dano";
  loot?: ScavengeLoot;
  /** Session damage rolled for this point ("dano" results). */
  damage?: number;
  /** Flavor line for the log / summary. */
  text: string;
}

/** The single active scavenge session. Only MANUAL starts open a session:
 *  auto runs resolve their points in chain inside the same tick and never
 *  create this state. Damage goes straight to the REAL survivor health;
 *  loot is granted at search time (quitting keeps everything found). */
export interface ActiveScavengeEvent {
  zoneId: number;
  startedAt: number; // absolute timestamp (session opened)
  /** Fixed search-point order and rolled outcomes for already searched
   *  points (index-aligned with the 8-point list). */
  board: ScavengeCell[];
}

/** One search point of the board: fixed position, outcome rolled at
 *  search time (null = not searched yet). */
export interface ScavengeCell {
  id: ScavengePointId;
  result: ScavengePointResult | null;
}

export type Screen =
  | "zonas"
  | "equipo"
  | "base"
  | "instalaciones"
  | "crafteo"
  | "mercader"
  | "mochila"
  | "perfil"
  | "registro";

export type SaveMeta = {
  version: number;
  savedAt: number;
};
