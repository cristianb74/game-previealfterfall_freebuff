import type { Profession, StatKey, Stats, Survivor } from "./types";

// ============================================================
// AFTERFALL — survivor generator.
// Six stats, 1–10 each, ~33 total. Max 3 rolls, pick one.
// No rarity. Professions bias tendencies, none is superior.
// ============================================================

export const SURVIVOR_MAX_ROLLS = 3;

const NAMES = [
  "Álvaro","Beatriz","Camila","Daniel","Elvira","Fernando","Gabriela","Héctor","Inés","Joaquín",
  "Karina","Leonardo","Marcela","Nicolás","Ortensia","Patricio","Quintina","Rodrigo","Silvia","Tomás",
  "Ulrika","Valeria","Wenceslao","Xenia","Yolanda","Zacarías","Ainhoa","Bruno","Celia","Dario",
];

const PROFESSIONS: { name: string; bias: StatKey[] }[] = [
  { name: "Rescatista", bias: ["fuerza", "resistencia"] },
  { name: "Explorador urbano", bias: ["agilidad", "percepcion"] },
  { name: "Técnico de redes", bias: ["inteligencia", "percepcion"] },
  { name: "Enfermero de campo", bias: ["percepcion", "voluntad"] },
  { name: "Exmilitar", bias: ["resistencia", "voluntad"] },
  { name: "Mecánico", bias: ["inteligencia", "fuerza"] },
  { name: "Cocinero de refugio", bias: ["voluntad", "agilidad"] },
  { name: "Cazador", bias: ["agilidad", "percepcion"] },
  { name: "Exprofesora", bias: ["inteligencia", "voluntad"] },
  { name: "Portero", bias: ["fuerza", "voluntad"] },
];

const STAT_KEYS: StatKey[] = [
  "fuerza",
  "resistencia",
  "agilidad",
  "percepcion",
  "inteligencia",
  "voluntad",
];

export const TOTAL_STAT_POINTS = 33;

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function generateStats(bias: StatKey[]): Stats {
  const weights: number[] = STAT_KEYS.map((k) => {
    const b = bias.includes(k) ? 1.6 : 0.7 + Math.random() * 0.6;
    return b;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const target = TOTAL_STAT_POINTS;
  const base = weights.map((w) => Math.max(1, Math.min(10, Math.round((w / sum) * target))));
  let total = base.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (total !== target && guard < 200) {
    const idx = randomInt(6);
    if (total > target && base[idx] > 1) {
      base[idx] -= 1;
      total -= 1;
    } else if (total < target && base[idx] < 10) {
      base[idx] += 1;
      total += 1;
    }
    guard += 1;
  }
  const stats = {} as Stats;
  STAT_KEYS.forEach((k, i) => (stats[k] = base[i]));
  return stats;
}

export interface SurvivorRoll {
  survivor: Survivor;
  /** index 0..2 */
  rollIndex: number;
}

/** Generate one random survivor. */
export function rollSurvivor(): Survivor {
  const name = NAMES[randomInt(NAMES.length)];
  const prof = PROFESSIONS[randomInt(PROFESSIONS.length)];
  const portraitIndex = 1 + randomInt(5);
  return {
    name,
    profession: prof.name as Profession,
    portrait: `/assets/survivor/s-${portraitIndex}.svg`,
    stats: generateStats(prof.bias),
  };
}

/** Generate up to 3 rolls (deterministic count, max 3). */
export function generateSurvivorOptions(): Survivor[] {
  const count = SURVIVOR_MAX_ROLLS;
  const options: Survivor[] = [];
  for (let i = 0; i < count; i++) options.push(rollSurvivor());
  return options;
}
