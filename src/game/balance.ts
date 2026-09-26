import type {
  BuildingKey,
  GameState,
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
  /** Minutes of real time per +1 energy point (with the app open or closed). */
  energyRegenMinutesPerPoint: 5,

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
  /** Max zones with the background auto-farm active at the same time.
   *  Only gates NEW activations — farms already active in old saves above
   *  the cap keep running (never force-disabled); from then on the player
   *  must free a slot (turn one off) before activating another zone. */
  maxConcurrentAutoFarms: 6,
  /** AUTO-farm diminishing returns per SIMULTANEOUS active zones.
   *  Zones with auto ON are ranked by zone id ASCENDING (earliest/dominated
   *  zones keep the full rate; the last-unlocked zones absorb the cut) and
   *  each rank's farm EXP is multiplied by its tier factor. Applied
   *  identically online (completeAutoRun) and offline (offlineProgress)
   *  via autoFarmConcurrentFactorFor — never hardcode these factors.
   *  fromIndex is the 0-based rank where the factor starts applying. */
  autoFarmConcurrentTiers: [
    { fromIndex: 0, factor: 1.0 },  // 1st–3rd active zone → 100 %
    { fromIndex: 3, factor: 0.8 },  // 4th–6th → 80 %
    { fromIndex: 6, factor: 0.6 },  // 7th–10th → 60 %
    { fromIndex: 10, factor: 0.4 }, // 11th+ → 40 %
  ] as const,

  /** Money find base chance per exploration, and amount range. */
  moneyFindChance: 0.03,
  moneyFindMin: 5,
  moneyFindMax: 25,

  /** SCAVENGE minigame (8 fixed search points): stepped trigger chance by
   *  explorations since the last event (same pattern as npcTiers but its own
   *  independent curve — rarer than an NPC, bigger one-shot payoff).
   *  One roll per MANUAL exploration completion; AUTO runs roll the same
   *  counter at autoScavengeChanceFactor and resolve all points in chain. */
  scavengeTiers: [
    { afterExplorations: 0, chance: 0 },      // 0–4:    0 %
    { afterExplorations: 5, chance: 0.08 },   // 5–9:    8 %
    { afterExplorations: 10, chance: 0.12 },  // 10–14: 12 %
    { afterExplorations: 15, chance: 0.2 },   // 15–19: 20 %
    { afterExplorations: 20, chance: 0.3 },   // 20–24: 30 %
    { afterExplorations: 30, chance: 0.5 },   // 30–39: 50 %
    { afterExplorations: 40, chance: 1 },     // 40+:    garantizado
  ] as const,
  /** AUTO-farm SCAVENGE: the manual chance (scavengeTiers) is multiplied by
   *  this factor. One roll per auto-run completion, same shared counter. */
  autoScavengeChanceFactor: 0.25,
  /** Minigame: the player's health for the session (REAL health, floored
   *  at scavengeSessionRealHealthFloor during the event so a bad streak can
   *  never knock the player to 0 inside it). Each damage hit rolls
   *  scavengeDamageMin–Max. Reaching 0 ends the session (unbanked pending
   *  loot is lost — quit anytime instead to keep what's banked). */
  scavengeSessionRealHealthFloor: 1,
  scavengeDamageMin: 1,
  scavengeDamageMax: 4,
  /** Loot per search point: unit resources roll 1–3 units, money is flat
   *  5–20, and Comida/Agua roll simple units converted to survival MINUTES
   *  with scavengeFoodWaterMinutes (1 unit = 20 min) on grant. */
  scavengeLootUnitsMin: 1,
  scavengeLootUnitsMax: 3,
  scavengeMoneyMin: 5,
  scavengeMoneyMax: 20,
  scavengeFoodWaterMinutes: 20,

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
  /** Opción B — escalado de costos por tramos de nivel (multiplicador sobre
   *  la curva lineal base+porNivel). Niveles 1–3 quedan EXACTOS a la curva
   *  original (arranque intacto); 4+ encarece por bandas. Ajustable aquí. */
  buildingCostBands: [
    { minLevel: 0, multiplier: 1 },
    { minLevel: 4, multiplier: 1.3 },
    { minLevel: 7, multiplier: 1.6 },
    { minLevel: 9, multiplier: 2 },
  ] as { minLevel: number; multiplier: number }[],
  /** Zone-thematic buildings: bonus per level (LOCAL to their zone).
   *  Same curve as core buildings — their extra power comes from stacking
   *  with the global base bonus on the zone's focus resource. */
  thematicBonusPerLevel: 0.05,
  /** Max simultaneous constructions in the GLOBAL base (core buildings).
   *  Separate quota from the per-zone thematic one. Only gates NEW
   *  upgrades; existing runs finish normally. */
  maxConcurrentConstructionsInBase: 1,

  /** Unlock thresholds are derived from zone definitions (see zones.ts). */
  zoneUnlockToastLabel: "NUEVA ZONA DESBLOQUEADA",
} as const;

/** AUTO-farm diminishing-returns helpers. Shared by the online tick
 *  (completeAutoRun) and the offline simulation (offlineProgress) so the
 *  two paths can never drift apart. */

/** Factor for a 0-based active-zone rank (ascending zone id order). */
export function autoFarmFactorForActiveIndex(rank: number): number {
  let factor = 1;
  for (const tier of BALANCE.autoFarmConcurrentTiers) {
    if (rank >= tier.fromIndex) factor = tier.factor;
  }
  return factor;
}

/** Diminishing-returns factor for ONE zone's auto-farm, given how many
 *  zones currently have auto ON. Inactive zones always return 1 (this
 *  must never touch manual exploration rewards). */
export function autoFarmConcurrentFactorFor(
  state: Pick<GameState, "autoExplored">,
  zoneId: number,
): number {
  if (!state.autoExplored[zoneId]) return 1;
  const activeZoneIds = Object.keys(state.autoExplored)
    .map(Number)
    .filter((id) => state.autoExplored[id])
    .sort((a, b) => a - b);
  const rank = activeZoneIds.indexOf(zoneId);
  if (rank < 0) return 1;
  return autoFarmFactorForActiveIndex(rank);
}

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

/** Save migration (v1→v2): duplicate core-building levels collapsed into
 *  the global base are refunded at this factor of their cumulative cost
 *  (1 = full refund, nothing the player paid is lost). */
export const migrationRefundFactor = 1.0;

/** Merchant battery: +energy on purchase. Not a ResourceKey — goes through
 *  gainEnergy() to respect the regen system invariants (see energySystem.ts).
 *  Blocked when energy + amount would exceed maxEnergy (no partial waste). */
export const MERCHANT_BATTERY_OFFER = { label: "Batería", price: 100, energy: 10 } as const;
