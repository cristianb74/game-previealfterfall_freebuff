import { NPC_SEED, type NpcSeed } from "./npcSeed";
import { BALANCE } from "./balance";
import type { BuildingKey, NpcSurvivor, NpcTypeCode, ResourceKey, Stats } from "./types";

// ============================================================
// AFTERFALL — the 104 NPC survivors.
// B01–B40 (40) · G01–G30 (30) · A01–A20 (20) · R01–R10 (10) · D01–D04 (4)
// Portraits: /assets/npc/<ID>.svg  (supports spritesheet mapping later)
// ============================================================

export const NPC_TYPE_INFO: Record<
  NpcTypeCode,
  { label: string; color: string; cycleSeconds: number; bonus: number }
> = {
  B: { label: "Blanco", color: "#d4d4d4", cycleSeconds: BALANCE.npcCycleSeconds.B, bonus: BALANCE.npcTypeBonus.B },
  G: { label: "Gris", color: "#9ca3af", cycleSeconds: BALANCE.npcCycleSeconds.G, bonus: BALANCE.npcTypeBonus.G },
  A: { label: "Azul", color: "#60a5fa", cycleSeconds: BALANCE.npcCycleSeconds.A, bonus: BALANCE.npcTypeBonus.A },
  R: { label: "Rojo", color: "#f87171", cycleSeconds: BALANCE.npcCycleSeconds.R, bonus: BALANCE.npcTypeBonus.R },
  D: { label: "Dorado", color: "#fbbf24", cycleSeconds: BALANCE.npcCycleSeconds.D, bonus: BALANCE.npcTypeBonus.D },
};

const STAT_KEYS: (keyof Stats)[] = [
  "fuerza",
  "resistencia",
  "agilidad",
  "percepcion",
  "inteligencia",
  "voluntad",
];

/** Deterministic stats (~33 total) from the NPC slot. */
function npcStats(slot: number): Stats {
  let seed = (slot * 2654435761) >>> 0;
  const rnd = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  // 6 stats summing to 33, each 1–10
  const weights = STAT_KEYS.map(() => 0.6 + rnd());
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * 33);
  const base = raw.map((v) => Math.max(1, Math.min(10, Math.round(v))));
  let total = base.reduce((a, b) => a + b, 0);
  // nudge to exactly 33
  let i = 0;
  while (total !== 33 && i < 100) {
    const idx = Math.floor(rnd() * 6);
    if (total > 33 && base[idx] > 1) {
      base[idx] -= 1;
      total -= 1;
    } else if (total < 33 && base[idx] < 10) {
      base[idx] += 1;
      total += 1;
    }
    i += 1;
  }
  const stats = {} as Stats;
  STAT_KEYS.forEach((k, idx) => {
    stats[k] = base[idx];
  });
  return stats;
}

/** Specialization: deterministic building per NPC, biased to its best stat. */
function npcSpecialization(seed: NpcSeed, stats: Stats): BuildingKey {
  const STAT_BUILDING: Record<keyof Stats, BuildingKey> = {
    fuerza: "almacen",
    resistencia: "tanque",
    agilidad: "cocina",
    percepcion: "enfermeria",
    inteligencia: "taller",
    voluntad: "generador",
  };
  const best = STAT_KEYS.reduce((a, b) => (stats[b] > stats[a] ? b : a));
  const hash = (seed.id.charCodeAt(0) + seed.id.charCodeAt(1) * 7) % 3;
  const candidates: BuildingKey[] = [STAT_BUILDING[best]];
  const others = (Object.keys(STAT_BUILDING) as (keyof Stats)[])
    .filter((k) => k !== best)
    .map((k) => STAT_BUILDING[k]);
  candidates.push(others[hash % others.length], others[(hash + 1) % others.length]);
  return candidates[seed.id.charCodeAt(2) % candidates.length];
}

export const NPC_ROSTER: NpcSurvivor[] = NPC_SEED.map((seed, i) => {
  const slot = i + 1;
  const stats = npcStats(slot);
  return {
    id: seed.id,
    name: seed.name,
    alias: seed.alias,
    profession: seed.profession,
    portrait: `/assets/npc/${seed.id}.svg`,
    type: seed.type,
    stats,
    specialization: npcSpecialization(seed, stats),
    assignedZoneId: null,
    discoveredAt: 0,
    productionTotals: {
      materiales: 0,
      agua: 0,
      comida: 0,
      medicamentos: 0,
      componentes: 0,
      energia: 0,
      dinero: 0,
    },
  };
});

export const NPC_BY_ID: Record<string, NpcSurvivor> = NPC_ROSTER.reduce(
  (acc, n) => {
    acc[n.id] = n;
    return acc;
  },
  {} as Record<string, NpcSurvivor>,
);

export function npcPortrait(id: string): string {
  return `/assets/npc/${id}.svg`;
}

/** Human-readable label for logs/UI: Name «Alias» (ID). */
export function npcDisplayName(npc: Pick<NpcSurvivor, "id" | "name" | "alias">): string {
  return `${npc.name} «${npc.alias}» (${npc.id})`;
}
