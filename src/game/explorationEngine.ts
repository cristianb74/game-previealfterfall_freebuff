import { BALANCE, RESOURCE_STAT, BUILDING_SPECIALIZATION } from "./balance";
import { getZone, zoneFocusBonus } from "./zones";
import { buildingBonus, thematicBonus, THEMATIC_BY_KEY } from "./buildings";
import { NPC_BY_ID } from "./npcData";
import {
  incidentChanceFactor,
  inteligenciaTechBonus,
  maxUnitsPerFind,
  mitigatedDamage,
  rareFindChance,
} from "./statEffects";
import { survivalEfficiency } from "./survivalSystem";
import type {
  BuildingKey,
  ExplorationFinding,
  ExplorationOutcome,
  GameState,
  ResourceKey,
  SpecialEvent,
  Stats,
} from "./types";

// ============================================================
// AFTERFALL — exploration engine (pure functions).
// Rolls findings for a completed exploration. Given state + zone,
// returns EXP and a list of findings (≥0, several allowed).
// ============================================================

const isTime = (r: ResourceKey) => r === "comida" || r === "agua";

// ============================================================
// MANUAL EXPLORATION SPECIAL EVENTS (auto-farm can NEVER roll them).
// Weighted pool — no single-event tuning needed elsewhere.
// ============================================================
const SPECIAL_EVENTS: { weight: number; make: () => SpecialEvent }[] = [
  {
    weight: 3,
    make: () => ({
      id: "cache",
      text: "Caché escondido bajo un escombro — intacto desde el Estallido.",
      money: BALANCE.moneyFindMin + Math.floor(Math.random() * (BALANCE.moneyFindMax - BALANCE.moneyFindMin + 1)),
    }),
  },
  {
    weight: 2,
    make: () => ({
      id: "botiquin",
      text: "Botiquín de campaña olvidado en una taquilla oxidada.",
      grants: [{ resource: "medicamentos", amount: 1 + Math.floor(Math.random() * 2) }],
    }),
  },
  {
    weight: 2,
    make: () => ({
      id: "refugio",
      text: "Refugio seguro: una noche sin peligros, con agua caliente.",
      heal: 5 + Math.floor(Math.random() * 6),
    }),
  },
  {
    weight: 2,
    make: () => ({
      id: "pantry",
      text: "Despensa saqueada a medias — quedó lo que nadie quiso mover.",
      grants: [
        { resource: "comida", amount: BALANCE.findTimeMin + Math.floor(Math.random() * (BALANCE.findTimeMax - BALANCE.findTimeMin + 1)) },
        { resource: "agua", amount: BALANCE.findTimeMin + Math.floor(Math.random() * (BALANCE.findTimeMax - BALANCE.findTimeMin + 1)) },
      ],
    }),
  },
  {
    weight: 1,
    make: () => ({
      id: "taller-abierto",
      text: "Taller intacto: herramientas finas y componentes a mano.",
      grants: [{ resource: "componentes", amount: 2 + Math.floor(Math.random() * 3) }],
    }),
  },
  {
    weight: 1,
    make: () => ({
      id: "hormigon",
      text: "Bolsas de cemento y chatra seleccionada en un contenedor sellado.",
      grants: [{ resource: "materiales", amount: 3 + Math.floor(Math.random() * 4) }],
    }),
  },
];

const SPECIAL_EVENT_TOTAL_WEIGHT = SPECIAL_EVENTS.reduce((a, e) => a + e.weight, 0);

function rollSpecialEvent(): SpecialEvent {
  let roll = Math.random() * SPECIAL_EVENT_TOTAL_WEIGHT;
  for (const entry of SPECIAL_EVENTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.make();
  }
  return SPECIAL_EVENTS[0].make();
}

export function findChanceForStat(stat: number): number {
  // 1 + stat × k (relative) — e.g. stat 5 → ×1.175 on the base chance
  return 1 + stat * BALANCE.statEffectFactor;
}

/** Total relative building bonus for a find of `resource` in `zoneId`:
 *  GLOBAL base building (core, shared by the whole character) + the zone's
 *  LOCAL thematic buildings of that resource (1–2, they stack).
 *  techBonus: Inteligencia adds extra efficiency to Taller/Generador. */
export function buildingMultiplierFor(
  state: Pick<GameState, "base" | "zones">,
  zoneId: number,
  resource: ResourceKey,
  techBonus = 0,
): number {
  let bonus = 0;
  // Global core building of this resource (bonus applies in every zone).
  for (const k of Object.keys(BUILDING_SPECIALIZATION) as BuildingKey[]) {
    if (BUILDING_SPECIALIZATION[k] === resource) {
      bonus += buildingBonus(state.base?.[k]?.level ?? 0);
      break;
    }
  }
  // Local thematic buildings of this zone specialized in the resource.
  const thematic = state.zones?.[zoneId]?.thematic ?? {};
  for (const key of Object.keys(thematic)) {
    if (THEMATIC_BY_KEY[key]?.specializes === resource) {
      bonus += thematicBonus(thematic[key].level);
    }
  }
  return 1 + bonus + techBonus;
}

/** Pick which resource the exploration targets, weighted by the governing stat:
 * weight = 1 + stat × k, so a high Percepción biases toward Medicamentos, etc. */
function pickWeightedResource(stats: Stats, candidates: ResourceKey[]): ResourceKey {
  const weights = candidates.map((r) => {
    const stat = stats[RESOURCE_STAT[r]] ?? 1;
    return 1 + stat * BALANCE.statEffectFactor;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Roll the findings of one completed exploration. Pure.
 *  `opts.auto`: background farm run — reduced EXP (applied by caller),
 *  no rare tier, no special events, and no manual find bonus. */
export function rollExploration(
  state: GameState,
  zoneId: number,
  opts: { auto?: boolean } = {},
): ExplorationOutcome {
  const zone = getZone(zoneId);
  const findings: ExplorationFinding[] = [];
  let exp = zone.playerExpReward;
  // Zone specialization: the focus resource is amplified in this zone.
  const focusBonus = zone.focus ? 1 + zoneFocusBonus(zoneId) : 1;
  // Manual advantage: +X% find chance (auto runs use the plain chance).
  const manualFindBonus = opts.auto ? 0 : BALANCE.manualFindChanceBonus;

  // Money find (independent chance)
  if (Math.random() < BALANCE.moneyFindChance) {
    findings.push({
      kind: "resource",
      resource: "dinero",
      amount: BALANCE.moneyFindMin + Math.floor(Math.random() * (BALANCE.moneyFindMax - BALANCE.moneyFindMin + 1)),
    });
  }

  // Main resource find — each candidate rolls with its own chance:
  // base × stat multiplier × building multiplier (relative bonuses).
  {
    const candidates = zone.resources.filter((r) => r !== "dinero");
    if (candidates.length > 0) {
      // A (stat-governed) pick of which resource the exploration targets.
      const picked = pickWeightedResource(state.survivor.stats, candidates);
      const stat = state.survivor.stats[RESOURCE_STAT[picked]] ?? 1;
      const statMult = findChanceForStat(stat);
      // Inteligencia boosts Taller (componentes) & Generador (energía).
      const techBonus =
        picked === "componentes" || picked === "energia"
          ? inteligenciaTechBonus(state.survivor.stats.inteligencia)
          : 0;
      const buildingMult = buildingMultiplierFor(state, zoneId, picked, techBonus);
      // Zone focus amplifies finds of its specialty resource.
      const focusMult = picked === zone.focus ? focusBonus : 1;
      // Hunger/thirst tier of the WORST meter reduces find efficiency.
      const finalChance = Math.min(
        0.95,
        BALANCE.explorationFindChance * statMult * buildingMult * focusMult * survivalEfficiency(state) + manualFindBonus,
      );
      if (Math.random() < finalChance) {
        // Rare find tier (Percepción): ×3 amount. MANUAL ONLY.
        const rare = !opts.auto && Math.random() < rareFindChance(state.survivor.stats.percepcion);
        let amount = isTime(picked)
          ? BALANCE.findTimeMin + Math.floor(Math.random() * (BALANCE.findTimeMax - BALANCE.findTimeMin + 1))
          : BALANCE.findUnitsMin + Math.floor(Math.random() * (maxUnitsPerFind(state.survivor.stats.fuerza) - BALANCE.findUnitsMin + 1));
        if (rare) amount *= 3;
        findings.push({ kind: "resource", resource: picked, amount, rare });
      }
    }
  }

  // Survival incident (no battle) — only when no resource was found.
  // Chance scaled DOWN by Voluntad; severity reduced by Voluntad + Resistencia.
  const hasResource = findings.some((f) => f.kind === "resource");
  if (!hasResource && Math.random() < BALANCE.explorationIncidentChance * incidentChanceFactor(state.survivor.stats.voluntad)) {
    const incident = randomIncident();
    findings.push({
      kind: "damage",
      damage: mitigatedDamage(incident.damage, state.survivor.stats.voluntad, state.survivor.stats.resistencia),
      cause: incident.cause,
    });
  }
  // MANUAL-ONLY special events: a concrete advantage of active exploration.
  // Rolls regardless of findings (its own small chance), never on auto runs.
  if (!opts.auto && Math.random() < BALANCE.manualSpecialEventChance) {
    findings.push({ kind: "event", event: rollSpecialEvent() });
  }

  // NPC discovery is now handled externally by the GameProvider
  // using a counter-based system (explorationsSinceLastNPC).

  return { zoneId, exp, findings };
}

const INCIDENTS: { cause: string; damage: [number, number] }[] = [
  { cause: "Vidrio roto", damage: [2, 6] },
  { cause: "Escombro caído", damage: [3, 8] },
  { cause: "Estructura colapsada", damage: [5, 12] },
  { cause: "Corte con metal oxidado", damage: [2, 5] },
  { cause: "Infección", damage: [3, 7] },
  { cause: "Animal herido", damage: [2, 6] },
  { cause: "Caída de altura", damage: [4, 10] },
  { cause: "Suelo inestable", damage: [3, 8] },
];

function randomIncident(): { cause: string; damage: number } {
  const inc = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
  const [min, max] = inc.damage;
  return { cause: inc.cause, damage: min + Math.floor(Math.random() * (max - min + 1)) };
}

/** NPC discovery probability from BALANCE.npcTiers (read from config, never hardcoded). */
export function npcChanceForCounter(counter: number): number {
  const tiers = BALANCE.npcTiers;
  let chance = 0;
  for (const t of tiers) {
    if (counter >= t.afterExplorations) chance = t.chance;
  }
  return chance;
}

export function discoverableNpcIds(state: GameState): string[] {
  const owned = new Set(state.npcs.map((n) => n.id));
  return Object.keys(NPC_BY_ID).filter((id) => !owned.has(id));
}

/** Formatted label of a finding for the log/results UI. */
export function findingLabel(f: ExplorationFinding): string {
  switch (f.kind) {
    case "resource":
      return `+${f.amount} ${resourceShort(f.resource as ResourceKey)}`;
    case "damage":
      return `${f.cause} · -${f.damage} Salud`;
    case "npc":
      return `Superviviente ${f.npcId} encontrado`;
    default:
      return "Sin hallazgos";
  }
}

function resourceShort(r: ResourceKey): string {
  switch (r) {
    case "materiales": return "Materiales";
    case "agua": return `min Agua`;
    case "comida": return `min Comida`;
    case "medicamentos": return "Medicamentos";
    case "componentes": return "Componentes";
    case "energia": return "Energía";
    case "dinero": return "$";
  }
}
