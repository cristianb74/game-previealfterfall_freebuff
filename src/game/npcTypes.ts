import { BALANCE, BUILDING_SPECIALIZATION } from "./balance";
import { buildingBonus, thematicBonus, THEMATIC_BY_KEY } from "./buildings";
import type {
  NpcSurvivor,
  NpcTypeCode,
  ResourceKey,
  StatKey,
} from "./types";
import { getZone, zoneFocusBonus } from "./zones";

// ============================================================
// AFTERFALL — NPC type modifiers and production math.
// Blanco 30 s +2 % · Gris 25 s +4 % · Azul 20 s +8 % ·
// Rojo 15 s +16 % · Dorado 10 s +24 %  (relative bonuses)
// NPC production stays far weaker than active exploration.
// ============================================================

export interface NpcTypeModifier {
  key: NpcTypeCode;
  label: string;
  color: string;
  cycleSeconds: number;
  /** Relative bonus multiplier, e.g. 0.02 = +2 %. */
  bonus: number;
}

export const NPC_TYPE_MODIFIERS: Record<NpcTypeCode, NpcTypeModifier> = {
  B: { key: "B", label: "Blanco", color: "#d4d4d4", cycleSeconds: BALANCE.npcCycleSeconds.B, bonus: BALANCE.npcTypeBonus.B },
  G: { key: "G", label: "Gris", color: "#9ca3af", cycleSeconds: BALANCE.npcCycleSeconds.G, bonus: BALANCE.npcTypeBonus.G },
  A: { key: "A", label: "Azul", color: "#60a5fa", cycleSeconds: BALANCE.npcCycleSeconds.A, bonus: BALANCE.npcTypeBonus.A },
  R: { key: "R", label: "Rojo", color: "#f87171", cycleSeconds: BALANCE.npcCycleSeconds.R, bonus: BALANCE.npcTypeBonus.R },
  D: { key: "D", label: "Dorado", color: "#fbbf24", cycleSeconds: BALANCE.npcCycleSeconds.D, bonus: BALANCE.npcTypeBonus.D },
};

const NPC_STAT_RESOURCE: Record<ResourceKey, StatKey> = {
  materiales: "fuerza",
  agua: "resistencia",
  comida: "agilidad",
  medicamentos: "percepcion",
  componentes: "inteligencia",
  energia: "voluntad",
  dinero: "percepcion",
};

export function npcStatFor(npc: NpcSurvivor, resource: ResourceKey): number {
  return npc.stats[NPC_STAT_RESOURCE[resource]] ?? 1;
}

/** Total relative bonus multiplier for an NPC working a zone on a resource:
 * ×(1 + npcTypeBonus + globalBaseBonus + localThematicBonus + zoneFocusBonus).
 * Accepts the FULL GameState (v2 shape) — buildings live in state.base
 * (global) and zones[id].thematic (local). */
export function npcProductionMultiplier(
  npc: NpcSurvivor,
  state: { base?: Record<string, { level: number }>; zones?: Record<string | number, { thematic?: Record<string, { level: number }> }> },
  resource: ResourceKey,
): number {
  const typeBonus = NPC_TYPE_MODIFIERS[npc.type].bonus;
  // Global core building of this resource (bonus applies in every zone).
  let coreBonus = 0;
  for (const k of Object.keys(BUILDING_SPECIALIZATION) as (keyof typeof BUILDING_SPECIALIZATION)[]) {
    if (BUILDING_SPECIALIZATION[k] === resource) {
      coreBonus = buildingBonus(state.base?.[k]?.level ?? 0);
      break;
    }
  }
  // Local thematic buildings of the NPC's zone specialized in the resource.
  const zoneId = npc.assignedZoneId ? Number(npc.assignedZoneId) : 1;
  const thematic = state.zones?.[zoneId]?.thematic ?? {};
  let thematicBonusTotal = 0;
  for (const key of Object.keys(thematic)) {
    if (THEMATIC_BY_KEY[key]?.specializes === resource) {
      thematicBonusTotal += thematicBonus(thematic[key].level);
    }
  }
  // Zone specialization amplifies the focus resource for NPCs too.
  const focus = getZone(zoneId).focus;
  const focusBonus = focus === resource ? zoneFocusBonus(zoneId) : 0;
  return 1 + typeBonus + coreBonus + thematicBonusTotal + focusBonus;
}

/** Effective per-cycle find probability for an NPC in a zone.
 * Targets ~10 % effective resource opportunity, scaled by stats and bonuses. */
export function npcCycleChance(
  npc: NpcSurvivor,
  state: Parameters<typeof npcProductionMultiplier>[1],
  resource: ResourceKey,
): number {
  const zone = getZone(npc.assignedZoneId ? Number(npc.assignedZoneId) : 1);
  const valid = zone.resources.includes(resource) || resource === "dinero";
  if (!valid) return 0;
  const base = resource === "dinero"
    ? BALANCE.npcMoneyChance
    : BALANCE.npcProductionChance;
  const stat = npcStatFor(npc, resource);
  const statFactor = 1 + stat * BALANCE.statEffectFactor;
  const bonus = npcProductionMultiplier(npc, state, resource);
  return Math.min(0.6, base * statFactor * bonus);
}

/** ---------------------------------------------------------
 * PASSIVE BENEFIT — assigned NPC speeds up their zone's exploration.
 * effective = BALANCE.npcZoneSpeedK × (npcBonus / DoradoBonus)
 * Dorado (24 %) → −6 % duration · Rojo (16 %) → −4 % · Azul (8 %) → −2 %
 * --------------------------------------------------------- */
export function npcZoneSpeedFactor(
  state: { npcs: { id: string; type: NpcTypeCode; assignedZoneId: string | null }[]; },
  zoneId: number,
): number {
  const npc = state.npcs.find((n) => n.assignedZoneId === String(zoneId));
  if (!npc) return 1;
  const rarityRatio = NPC_TYPE_MODIFIERS[npc.type].bonus / NPC_TYPE_MODIFIERS.D.bonus;
  const reduction = BALANCE.npcZoneSpeedK * rarityRatio;
  return Math.max(0.8, 1 - reduction);
}

/** Roll one NPC production cycle. Returns null when nothing found. */
export function rollNpcCycle(
  npc: NpcSurvivor,
  state: Parameters<typeof npcCycleChance>[1],
  rnd: () => number,
): { resource: ResourceKey; amount: number } | null {
  const zone = getZone(npc.assignedZoneId ? Number(npc.assignedZoneId) : 1);
  // Money chance is independent and not affected by production bonuses.
  if (rnd() < BALANCE.npcMoneyChance) {
    return { resource: "dinero", amount: 2 + Math.floor(rnd() * 4) };
  }
  const candidates = zone.resources.filter((r) => r !== "dinero");
  if (candidates.length === 0) return null;
  const resource = candidates[Math.floor(rnd() * candidates.length)];
  const chance = npcCycleChance(npc, state, resource);
  if (rnd() >= chance) return null;
  const isTime = resource === "comida" || resource === "agua";
  const amount = isTime
    ? BALANCE.npcProductionTimeMin + Math.floor(rnd() * (BALANCE.npcProductionTimeMax - BALANCE.npcProductionTimeMin + 1))
    : BALANCE.npcProductionUnitsMin + Math.floor(rnd() * (BALANCE.npcProductionUnitsMax - BALANCE.npcProductionUnitsMin + 1));
  return { resource, amount };
}
