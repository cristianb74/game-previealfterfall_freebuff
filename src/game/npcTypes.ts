import { BALANCE, BUILDING_SPECIALIZATION } from "./balance";
import { buildingBonus, thematicBonus, THEMATIC_BY_KEY } from "./buildings";
import { activeAssignmentForNpc, activeAssignmentForZone } from "./crafting/craftedEffects";
import type {
  GameState,
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

/** ---------------------------------------------------------
 * ASIGNACIONES — crafted items assigned to a specific NPC raise the
 * stat that NPC actually uses in production (prismáticos → Percepción
 * for medicamentos/dinero, botas → Agilidad for comida). Applied at
 * the ONE place stats feed rolls (npcStatFor via npcCycleChance), so
 * online tick and offline progress can never drift apart.
 * --------------------------------------------------------- */
export function npcStatForRoll(
  npc: NpcSurvivor,
  state: { assignments?: { recipeId: string; targetType: "zone" | "npc"; targetId: string; endsAt: number }[] },
  resource: ResourceKey,
  now: number,
): number {
  const stat = NPC_STAT_RESOURCE[resource];
  let value = npc.stats[stat] ?? 1;
  if (stat === "percepcion" && activeAssignmentForNpc(state as never, "prismaticos", npc.id, now)) value *= 1.08;
  if (stat === "agilidad" && activeAssignmentForNpc(state as never, "botas", npc.id, now)) value *= 1.08;
  return value;
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
 * Targets ~10 % effective resource opportunity, scaled by stats and bonuses.
 * `now` feeds the NPC-assignment overlays (prismáticos/botas). */
export function npcCycleChance(
  npc: NpcSurvivor,
  state: Parameters<typeof npcProductionMultiplier>[1],
  resource: ResourceKey,
  now = Date.now(),
): number {
  const zone = getZone(npc.assignedZoneId ? Number(npc.assignedZoneId) : 1);
  const valid = zone.resources.includes(resource) || resource === "dinero";
  if (!valid) return 0;
  const base = resource === "dinero"
    ? BALANCE.npcMoneyChance
    : BALANCE.npcProductionChance;
  const stat = npcStatForRoll(npc, state as never, resource, now);
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

/** Roll one NPC production cycle. Returns null when nothing found.
 * NPC-assigned items apply here: prismáticos/botas raise the governing
 * stat of the roll and mochila de superviviente boosts the amount. */
export function rollNpcCycle(
  npc: NpcSurvivor,
  state: Parameters<typeof npcCycleChance>[1],
  rnd: () => number,
  now = Date.now(),
): { resource: ResourceKey; amount: number } | null {
  const zone = getZone(npc.assignedZoneId ? Number(npc.assignedZoneId) : 1);
  // Money chance is independent and not affected by production bonuses.
  if (rnd() < BALANCE.npcMoneyChance) {
    const amount = 2 + Math.floor(rnd() * 4);
    return { resource: "dinero", amount: scaledNpcAmount(npc, state, "dinero", amount, now) };
  }
  const candidates = zone.resources.filter((r) => r !== "dinero");
  if (candidates.length === 0) return null;
  const resource = candidates[Math.floor(rnd() * candidates.length)];
  const chance = npcCycleChance(npc, state, resource, now);
  if (rnd() >= chance) return null;
  const isTime = resource === "comida" || resource === "agua";
  const amount = isTime
    ? BALANCE.npcProductionTimeMin + Math.floor(rnd() * (BALANCE.npcProductionTimeMax - BALANCE.npcProductionTimeMin + 1))
    : BALANCE.npcProductionUnitsMin + Math.floor(rnd() * (BALANCE.npcProductionUnitsMax - BALANCE.npcProductionUnitsMin + 1));
  return { resource, amount: scaledNpcAmount(npc, state, resource, amount, now) };
}

/** Mochila de superviviente assigned to this NPC: +15% to its finds
 *  (unit AND minute amounts — the recipe's "capacidad general" line). */
function scaledNpcAmount(
  npc: NpcSurvivor,
  state: Parameters<typeof npcCycleChance>[1],
  resource: ResourceKey,
  amount: number,
  now: number,
): number {
  const boosted =
    activeAssignmentForNpc(state as never, "mochila_superviviente", npc.id, now) != null;
  if (!boosted) return amount;
  return Math.max(1, Math.round(amount * 1.15));
}

// ============================================================
// ZONE BONUS BREAKDOWN — bloque de HUD por zona: bonus del recurso de
// especialización (focus) de la zona, desglosado por fuente. Todas las
// lecturas son estado REAL y usan las MISMAS fórmulas que el juego ya
// aplica (zoneFocusBonus, buildingBonus/thematicBonus vía
// npcProductionMultiplier, asignaciones crafteadas activas).
// ============================================================

export interface ZoneBonusItem {
  recipeId: string;
  /** Share aditivo sobre el bonus del recurso foco (0.05 = +5 %). */
  pct: number;
  /** True cuando el ítem está asignado al NPC de la zona (no a la zona). */
  onNpc?: boolean;
}

export interface ZoneBonusBreakdown {
  focus: ResourceKey;
  /** Especialización de la zona (zoneFocusBonus, por banda de profundidad). */
  focusPct: number;
  /** Construcciones: edificio GLOBAL del recurso foco + temáticas de ESTA
   *  zona que lo especializan (misma suma que npcProductionMultiplier). */
  constructionsPct: number;
  /** NPC asignado a la zona: bonus de producción por rareza (0 si no hay). */
  npcPct: number;
  /** Ítems crafteados activos que afectan al recurso foco. */
  items: ZoneBonusItem[];
  itemsPct: number;
  /** focus + construcciones + npc + ítems. */
  totalPct: number;
}

export function zoneBonusBreakdown(
  state: Pick<GameState, "base" | "zones" | "npcs" | "assignments">,
  zoneId: number,
  now = Date.now(),
): ZoneBonusBreakdown {
  const focus = getZone(zoneId).focus;
  const focusPct = zoneFocusBonus(zoneId);

  // Construcciones: core global del recurso foco (misma búsqueda que
  // npcProductionMultiplier) + temáticas locales de la zona.
  let constructionsPct = 0;
  for (const k of Object.keys(BUILDING_SPECIALIZATION) as (keyof typeof BUILDING_SPECIALIZATION)[]) {
    if (BUILDING_SPECIALIZATION[k] === focus) {
      constructionsPct += buildingBonus(state.base?.[k]?.level ?? 0);
      break;
    }
  }
  const thematic = state.zones?.[zoneId]?.thematic ?? {};
  for (const key of Object.keys(thematic)) {
    if (THEMATIC_BY_KEY[key]?.specializes === focus) {
      constructionsPct += thematicBonus(thematic[key].level);
    }
  }

  // NPC asignado: bonus de producción por rareza (NPC_TYPE_MODIFIERS).
  const npc = state.npcs.find((n) => n.assignedZoneId === String(zoneId));
  const npcPct = npc ? NPC_TYPE_MODIFIERS[npc.type].bonus : 0;

  // Ítems crafteados activos: asignaciones de zona que afectan al recurso
  // foco + la mochila de superviviente puesta al NPC asignado (+15% cantidad).
  const items: ZoneBonusItem[] = [];
  if (activeAssignmentForZone(state, "mapa", zoneId, now)) items.push({ recipeId: "mapa", pct: 0.05 });
  if (focus === "materiales" && activeAssignmentForZone(state, "mochila_recoleccion", zoneId, now)) items.push({ recipeId: "mochila_recoleccion", pct: 0.1 });
  if (focus === "componentes" && activeAssignmentForZone(state, "kit_tecnico", zoneId, now)) items.push({ recipeId: "kit_tecnico", pct: 0.1 });
  if (focus === "componentes" && activeAssignmentForZone(state, "iman", zoneId, now)) items.push({ recipeId: "iman", pct: 0.08 });
  if (focus === "dinero" && activeAssignmentForZone(state, "escaner", zoneId, now)) items.push({ recipeId: "escaner", pct: 0.1 });
  if (npc && activeAssignmentForNpc(state, "mochila_superviviente", npc.id, now)) items.push({ recipeId: "mochila_superviviente", pct: 0.15, onNpc: true });
  const itemsPct = items.reduce((acc, it) => acc + it.pct, 0);

  return {
    focus,
    focusPct,
    constructionsPct,
    npcPct,
    items,
    itemsPct,
    totalPct: focusPct + constructionsPct + npcPct + itemsPct,
  };
}
