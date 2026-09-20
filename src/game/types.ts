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

/** One of the 6 core buildings, local to each zone. */
export type BuildingKey =
  | "cocina"
  | "tanque"
  | "almacen"
  | "enfermeria"
  | "taller"
  | "generador";

/** Zone-exclusive buildings (see buildings.ts for their host zones).
 *  Present only in the zones that host them; old saves get them via
 *  the save migration at level 0. */
export type ExclusiveBuildingKey = "invernadero" | "perforadora" | "laboratorio" | "hormigonera";

export type AnyBuildingKey = BuildingKey | ExclusiveBuildingKey;

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
}

export interface BuildingState {
  /** Core or exclusive key (exclusiveBuilding uses an exclusive key). */
  key: AnyBuildingKey;
  level: number; // 0–10
  upgradeFinishAt: number | null; // absolute timestamp
}

export type ZoneStatus = "locked" | "unlocked";

export interface ZoneProgressState {
  buildings: Record<BuildingKey, BuildingState>;
  /** Zone-exclusive building (only for zones that host one). Absent in
   *  zones without an exclusive and in pre-migration saves until upgraded
   *  — treat as level 0 when missing. */
  exclusiveBuilding?: BuildingState;
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
  zones: Record<number, ZoneProgressState>;
  npcs: NpcSurvivor[];
  /** Per-NPC production accumulator timestamps (absolute ms). */
  npcCycles: Record<string, number>;
  log: LogEvent[];
  pendingZoneUnlock: number | null;
}

export interface ExplorationFinding {
  kind: "resource" | "damage" | "npc" | "nothing";
  resource?: ResourceKey;
  amount?: number;
  damage?: number;
  cause?: string;
  npcId?: string;
  /** Rare find (Percepción tier): amount was tripled. */
  rare?: boolean;
}

export interface ExplorationOutcome {
  zoneId: number;
  exp: number;
  findings: ExplorationFinding[];
}

export type Screen =
  | "explorar"
  | "zonas"
  | "equipo"
  | "base"
  | "mercader"
  | "mochila"
  | "perfil"
  | "registro";

export type SaveMeta = {
  version: number;
  savedAt: number;
};
