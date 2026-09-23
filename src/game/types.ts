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
