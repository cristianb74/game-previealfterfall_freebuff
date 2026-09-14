import type {
  BuildingKey,
  ResourceKey,
  StatKey,
} from "./types";

// ============================================================
// AFTERFALL — single source of truth for tunable balance values.
// Keep this file as the ONLY place where these numbers live.
// ============================================================

export const BALANCE = {
  /** Initial resource package: 2 different types, 1–5 units (or minutes for time resources). */
  startingPackage: { count: 2, min: 1, max: 5 },
  /** Starting survival timers (minutes). ~24 h each. */
  startingFoodMin: 24 * 60,
  startingWaterMin: 24 * 60,

  maxHealth: 100,
  /** 1 Medicamento restores this much Salud. */
  medicineHealthPerUnit: 1,

  /** Maximum energía and real-time regeneration. */
  maxEnergy: 24,
  energyRegenMinutesPerPoint: 60,

  /** Exploration duration (minutes) — main active action. */
  explorationMinutes: 15,

  /** Chance (0–1) that an exploration rolls a resource find. */
  explorationFindChance: 0.62,
  /** Chance (0–1) of a survival incident (only when no resource found). */
  explorationIncidentChance: 0.3,
  /** Resource find: min/max units for unit-type resources. */
  findUnitsMin: 1,
  findUnitsMax: 3,
  /** Resource find: min/max added survival time (minutes) for Comida/Agua. */
  findTimeMin: 10,
  findTimeMax: 30,
  /** Base probability of discovering an NPC per exploration. */
  npcDiscoverChance: 0.05,
  /** First NPC guaranteed within roughly this many explorations. */
  npcFirstGuarantee: 10,

  /** Money find base chance per exploration, and amount range. */
  moneyFindChance: 0.03,
  moneyFindMin: 5,
  moneyFindMax: 25,

  /** Stat effectiveness factor: p = base * (1 + stat * k). */
  statEffectFactor: 0.035,

  /** NPC passive production cycle, in seconds, per type. */
  npcCycleSeconds: { B: 30, G: 25, A: 20, R: 15, D: 10 },
  /** Relative bonus multiplier added per NPC type (e.g. 0.02 → +2 %). */
  npcTypeBonus: { B: 0.02, G: 0.04, A: 0.08, R: 0.16, D: 0.24 },

  /** NPC production is much weaker than active exploration. */
  npcProductionChance: 0.1, // ~10 % effective resource opportunity per cycle
  npcMoneyChance: 0.03, // ~3 % money per cycle
  npcProductionUnitsMin: 1,
  npcProductionUnitsMax: 2,
  npcProductionTimeMin: 4, // minutes of Comida/Agua per find
  npcProductionTimeMax: 10,

  /** NPC survival cost: consume food/water each cycle at this factor… */
  npcConsumptionFactor: 0.25,
  /** …of a full survivor's upkeep (minutes of food/water per hour). */
  survivorUpkeepPerHour: 20, // ≈ 24 h of food from start fades in ~3 days
  /** Minimum food/water (minutes) to run NPC cycles; below this, NPCs pause. */
  npcMinimumFoodWaterMin: 20,

  /** Offline NPC production is capped at this many hours. */
  offlineNpcCapHours: 4,

  /** Building system. */
  buildingMaxLevel: 10,
  /** Relative bonus per level: N1 = +5 % … N10 = +50 %. */
  buildingBonusPerLevel: 0.05,
  /** Upgrade duration scaling, in minutes (level → minutes). */
  buildingBaseMinutes: 3, // 0→1
  buildingMinutesPerLevel: 2.5, // +2.5 min per level ⇒ 10 is 27 min (< 30 min)
  buildingCostMaterialBase: 4,
  buildingCostMaterialPerLevel: 3,
  buildingCostComponentBase: 1,
  buildingCostComponentPerLevel: 1.5,

  /** Unlock thresholds are derived from zone definitions (see zones.ts). */
  zoneUnlockToastLabel: "NUEVA ZONA DESBLOQUEADA",
} as const;

/** Which building boosts which resource. */
export const BUILDING_SPECIALIZATION: Record<BuildingKey, ResourceKey> = {
  cocina: "comida",
  tanque: "agua",
  almacen: "materiales",
  enfermeria: "medicamentos",
  taller: "componentes",
  generador: "energia",
};

/** Stat → resource mapping from the design document. */
export const STAT_RESOURCE: Record<StatKey, ResourceKey> = {
  fuerza: "materiales",
  resistencia: "agua",
  agilidad: "comida",
  percepcion: "medicamentos",
  inteligencia: "componentes",
  voluntad: "energia",
};

/** Inverse: resource → the stat that governs its discovery. */
export const RESOURCE_STAT: Record<ResourceKey, StatKey> = {
  materiales: "fuerza",
  agua: "resistencia",
  comida: "agilidad",
  medicamentos: "percepcion",
  componentes: "inteligencia",
  energia: "voluntad",
  dinero: "percepcion",
};

/** Zone order → building made available when the zone unlocks. */
export const ZONE_BUILDING: Record<number, BuildingKey> = {
  1: "cocina",
  2: "tanque",
  3: "almacen",
  5: "enfermeria",
  7: "taller",
  10: "generador",
};

/** Resource unit prices for the merchant (money sink). */
export const RESOURCE_PRICES: Partial<Record<ResourceKey, number>> = {
  materiales: 8,
  medicamentos: 12,
  componentes: 16,
  comida: 6, // per 10 min of food
  agua: 6, // per 10 min of water
};
