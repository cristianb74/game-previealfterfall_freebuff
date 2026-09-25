// AFTERFALL — shared types. No combat, no crafting, no premium currency.

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

export interface LogEvent {
  t: number; // timestamp
  msg: string;
  kind: "resource" | "exp" | "damage" | "npc" | "zone" | "build" | "info";
  /** Log channel: "tech" (debug, default) or "narr" (player-facing
   *  narrative). Older saves have no channel → treated as "tech". */
  channel?: "tech" | "narr";
}

export interface GameState {
  version: number;
  createdAt: number;
  lastTickAt: number;
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
  log: LogEvent[];
  pendingZoneUnlock: number | null;
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
  | "mercader"
  | "mochila"
  | "perfil"
  | "registro";

export type SaveMeta = {
  version: number;
  savedAt: number;
};
