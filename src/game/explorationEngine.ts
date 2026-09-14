import { BALANCE, RESOURCE_STAT } from "./balance";
import { getZone } from "./zones";
import { buildingBonus } from "./buildings";
import { NPC_BY_ID } from "./npcData";
import type {
  BuildingKey,
  ExplorationFinding,
  ExplorationOutcome,
  GameState,
  ResourceKey,
  Stats,
  ZoneProgressState,
} from "./types";

// ============================================================
// AFTERFALL — exploration engine (pure functions).
// Rolls findings for a completed exploration. Given state + zone,
// returns EXP and a list of findings (≥0, several allowed).
// ============================================================

const isTime = (r: ResourceKey) => r === "comida" || r === "agua";

export function findChanceForStat(stat: number): number {
  // 1 + stat × k (relative) — e.g. stat 5 → ×1.175 on the base chance
  return 1 + stat * BALANCE.statEffectFactor;
}

export function buildingMultiplierFor(
  zoneState: ZoneProgressState | undefined,
  resource: ResourceKey,
): number {
  if (!zoneState) return 1;
  const keys = Object.keys(zoneState.buildings) as BuildingKey[];
  for (const k of keys) {
    const b = zoneState.buildings[k];
    if (b && BUILDING_SPECIALIZATION_MAP[k] === resource) {
      return 1 + buildingBonus(b.level);
    }
  }
  return 1;
}

const BUILDING_SPECIALIZATION_MAP: Record<BuildingKey, ResourceKey> = {
  cocina: "comida",
  tanque: "agua",
  almacen: "materiales",
  enfermeria: "medicamentos",
  taller: "componentes",
  generador: "energia",
};

function zoneStateOf(state: GameState, zoneId: number): ZoneProgressState | undefined {
  return state.zones[zoneId];
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

/** Roll the findings of one completed exploration. Pure. */
export function rollExploration(state: GameState, zoneId: number): ExplorationOutcome {
  const zone = getZone(zoneId);
  const zoneState = zoneStateOf(state, zoneId);
  const findings: ExplorationFinding[] = [];
  let exp = zone.playerExpReward;

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
      const buildingMult = buildingMultiplierFor(zoneState, picked);
      const finalChance = Math.min(
        0.95,
        BALANCE.explorationFindChance * statMult * buildingMult,
      );
      if (Math.random() < finalChance) {
        const amount = isTime(picked)
          ? BALANCE.findTimeMin + Math.floor(Math.random() * (BALANCE.findTimeMax - BALANCE.findTimeMin + 1))
          : BALANCE.findUnitsMin + Math.floor(Math.random() * (BALANCE.findUnitsMax - BALANCE.findUnitsMin + 1));
        findings.push({ kind: "resource", resource: picked, amount });
      }
    }
  }

  // Survival incident (no battle) — only when no resource was found
  const hasResource = findings.some((f) => f.kind === "resource");
  if (!hasResource && Math.random() < BALANCE.explorationIncidentChance) {
    const incident = randomIncident();
    findings.push({
      kind: "damage",
      damage: incident.damage,
      cause: incident.cause,
    });
  }

  // NPC discovery
  const npcId = rollNpcDiscovery(state);
  if (npcId) {
    findings.push({ kind: "npc", npcId });
  }

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

/** Which NPC could be discovered next (not yet owned). */
function discoverableNpcIds(state: GameState): string[] {
  const owned = new Set(state.npcs.map((n) => n.id));
  return Object.keys(NPC_BY_ID).filter((id) => !owned.has(id));
}

/** Guarantee the first NPC within the first ~10 explorations. */
function rollNpcDiscovery(state: GameState): string | null {
  const pool = discoverableNpcIds(state);
  if (pool.length === 0) return null;
  if (state.explorationsDone < BALANCE.npcFirstGuarantee) {
    // within the guarantee window: remaining explorations until guarantee
    const remaining = BALANCE.npcFirstGuarantee - state.explorationsDone;
    const chance = Math.max(BALANCE.npcDiscoverChance, 1 / remaining);
    return Math.random() < chance ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  return Math.random() < BALANCE.npcDiscoverChance
    ? pool[Math.floor(Math.random() * pool.length)]
    : null;
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
