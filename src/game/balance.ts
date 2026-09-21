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
  energyRegenMinutesPerPoint: 15,

  /** Exploration duration baseline (minutes). Real durations are per-zone
   *  in zones.ts (explorationMinutes), rising with each zone. */
  explorationMinutes: 1,

  /** Chance (0–1) that an exploration rolls a resource find. */
  explorationFindChance: 0.62,
  /** EXP multiplier for AUTOMATIC re-explorations of conquered zones.
   *  Auto runs never advance the frontier — manual exploration must reach
   *  each new zone. Active exploration stays the most valuable action. */
  autoExploreExpFactor: 0.4,
  /** MANUAL advantage: flat +X% added to the resource find chance.
   *  Auto-farm runs never get this bonus. */
  manualFindChanceBonus: 0.15,
  /** MANUAL advantage: chance (0–1) of rolling a special event
   *  (cache, safe shelter, supply stash...). Auto-farm can never
   *  trigger these events. */
  manualSpecialEventChance: 0.08,
  /** Chance (0–1) of a survival incident (only when no resource found). */
  explorationIncidentChance: 0.3,
  /** Resource find: min/max units for unit-type resources. */
  findUnitsMin: 1,
  findUnitsMax: 3,
  /** Resource find: min/max added survival time (minutes) for Comida/Agua. */
  findTimeMin: 10,
  findTimeMax: 30,
  /** NPC discovery: tier thresholds (explorations since last NPC). */
  npcTiers: [
    { afterExplorations: 0, chance: 0 },       // 0–4: 0 %
    { afterExplorations: 5, chance: 0.02 },     // 5–9: 2 %
    { afterExplorations: 10, chance: 0.05 },    // 10–14: 5 %
    { afterExplorations: 15, chance: 0.10 },    // 15–19: 10 %
    { afterExplorations: 20, chance: 0.25 },    // 20–24: 25 %
    { afterExplorations: 25, chance: 1 },       // 25+: guaranteed
  ] as const,
  /** AUTO-farm NPC discovery: the manual chance (npcTiers) is multiplied by
   *  this factor. One roll per auto-run completion, same shared counter. */
  autoNpcChanceFactor: 0.3,

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
  /** Recruitment: cost (Materiales) to recruit a candidate NPC into the shelter.
   *  0 = free recruitment. Tunable. */
  npcRecruitCostMateriales: 5,
  /** Recruitment: cost (Comida, minutes) to recruit a candidate NPC. */
  npcRecruitCostComidaMin: 60,
  /** Passive benefit of an NPC ASSIGNED to a zone: exploration duration of
   *  that zone is reduced by this fraction, scaled by NPC rarity bonus
   *  (relative to the Dorado bonus as the 1.0 reference).
   *  effective = k × (npcBonus / npcTypeBonus.Dorado). */
  npcZoneSpeedK: 0.06, // Dorado (24 %) → −6 % duration; Azul (8 %) → −2 %

  /** Offline NPC production is capped at this many hours. */
  offlineNpcCapHours: 4,
  /** TOTAL offline progression cap (hours): consumption, auto-farm EXP
   *  and survival drain all settle as if the player returned at this
   *  point. Energy regen keeps going up to the real elapsed time (it is
   *  a player-friendly exception) but never beyond maxEnergy. */
  offlineCapHours: 8,

  /** Building system. */
  buildingMaxLevel: 10,
  /** Max simultaneous constructions per zone (core + exclusive share the
   *  same quota). Only gates NEW upgrades; existing runs finish normally. */
  maxConcurrentConstructionsPerZone: 1,
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

/** Sell prices to the merchant (~50% of buy price). */
export const MERCHANT_SELL_PRICES: Partial<Record<ResourceKey, { amount: number; price: number; label: string }>> = {
  materiales: { amount: 1, price: 4, label: "Vender 1 Materiales" },
  medicamentos: { amount: 1, price: 6, label: "Vender 1 Medicamentos" },
  componentes: { amount: 1, price: 8, label: "Vender 1 Componentes" },
  comida: { amount: 30, price: 7, label: "Vender 30 min Comida" },
  agua: { amount: 30, price: 7, label: "Vender 30 min Agua" },
};
