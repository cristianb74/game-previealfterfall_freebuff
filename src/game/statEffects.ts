// ============================================================
// AFTERFALL — survivor stat effects (balance module).
// All stat-driven formulas live here with their tunable
// constants, so balance can be adjusted in one place without
// touching gameplay logic.
//
// STAT → EFFECT MAP
//   Percepción   → rare-find tier chance (per exploration)
//   Agilidad     → exploration duration reduction
//   Voluntad     → incident chance + severity reduction
//   Fuerza       → carry capacity (max units per find)
//   Resistencia  → damage taken reduction
//   Inteligencia → Taller (Componentes) & Generador (Energía) efficiency
//
// Formula style: relative multiplier m(s) = 1 + (s − 1) · k
// where s = stat value (1–10). At stat 1 → ×1.00 (neutral),
// at stat 10 → ×(1 + 9k). Clamps keep values inside sane bounds.
// ============================================================

import type { StatKey, Stats } from "./types";

/** ---------------------------------------------------------
 * TUNABLE CONSTANTS — edit here, nowhere else.
 * --------------------------------------------------------- */
export const STAT_EFFECT_CONFIG = {
  /** Agilidad: duration reduction per stat point (over the neutral 1). */
  agilidadDurationK: 0.035,
  /** Agilidad: hard clamp — duration never goes below 60 % of base. */
  agilidadMinFactor: 0.6,

  /** Voluntad: incident chance reduction per stat point. */
  voluntadIncidentK: 0.05,
  /** Voluntad: damage severity reduction per stat point. */
  voluntadDamageK: 0.04,

  /** Resistencia: damage taken reduction per stat point. */
  resistenciaDamageK: 0.035,

  /** Percepción: rare-find chance per stat point (absolute, ×100 = %).
   *  Stat 10 → 7.2 % per exploration. Rare finds give ×3 amount. */
  percepcionRareK: 0.008,

  /** Fuerza: extra max units per unit-resource find, per stat point. */
  fuerzaCarryK: 0.5,
  /** Fuerza: hard cap on units per find. */
  fuerzaCarryMaxUnits: 8,
  /** Base max units per find (mirrors BALANCE.findUnitsMax). */
  fuerzaCarryBase: 3,

  /** Inteligencia: extra relative bonus for Taller/Generador per point. */
  inteligenciaTechK: 0.03,
} as const;

const clampStat = (s: number) => Math.max(1, Math.min(10, s));

/** Generic relative factor m(s) = 1 + (s − 1) · k, clamped to [min, max]. */
function factor(stat: number, k: number, min: number, max: number): number {
  const s = clampStat(stat);
  return Math.max(min, Math.min(max, 1 + (s - 1) * k));
}

/** ---------------------------------------------------------
 * AGILIDAD — exploration duration
 * Zone base minutes × [0.6 … 1.0]. Stat 1 → no change,
 * stat 10 → 60 % of the zone's base duration.
 * --------------------------------------------------------- */
export function explorationMinutesWithAgility(baseMinutes: number, agilidad: number): number {
  const m = factor(agilidad, -STAT_EFFECT_CONFIG.agilidadDurationK, STAT_EFFECT_CONFIG.agilidadMinFactor, 1);
  return Math.max(0.25, baseMinutes * m);
}

/** ---------------------------------------------------------
 * VOLUNTAD — incident frequency
 * Multiplies the base incident chance. Stat 10 → 55 % of base.
 * --------------------------------------------------------- */
export function incidentChanceFactor(voluntad: number): number {
  return factor(voluntad, -STAT_EFFECT_CONFIG.voluntadIncidentK, 0.55, 1);
}

/** ---------------------------------------------------------
 * VOLUNTAD + RESISTENCIA — damage mitigation
 * raw × voluntadFactor × resistenciaFactor, minimum 1.
 * Stat 10 both → ~48 % of raw damage.
 * --------------------------------------------------------- */
export function mitigatedDamage(rawDamage: number, voluntad: number, resistencia: number): number {
  const volFactor = factor(voluntad, -STAT_EFFECT_CONFIG.voluntadDamageK, 0.68, 1);
  const resFactor = factor(resistencia, -STAT_EFFECT_CONFIG.resistenciaDamageK, 0.68, 1);
  return Math.max(1, Math.round(rawDamage * volFactor * resFactor));
}

/** ---------------------------------------------------------
 * PERCEPCIÓN — rare finds
 * Absolute chance for an exploration to upgrade into a rare
 * find (×3 amount). Stat 1 → 0 %, stat 10 → 7.2 %.
 * --------------------------------------------------------- */
export function rareFindChance(percepcion: number): number {
  return STAT_EFFECT_CONFIG.percepcionRareK * (clampStat(percepcion) - 1);
}

/** ---------------------------------------------------------
 * FUERZA — carry capacity
 * Max units obtainable in one find of a unit-type resource.
 * Stat 1 → 3, stat 10 → 8 (capped).
 * --------------------------------------------------------- */
export function maxUnitsPerFind(fuerza: number): number {
  const s = clampStat(fuerza);
  const bonus = (s - 1) * STAT_EFFECT_CONFIG.fuerzaCarryK;
  return Math.min(STAT_EFFECT_CONFIG.fuerzaCarryMaxUnits, Math.round(STAT_EFFECT_CONFIG.fuerzaCarryBase + bonus));
}

/** ---------------------------------------------------------
 * INTELIGENCIA — tech buildings
 * Extra relative bonus added on top of the building's own bonus
 * for Taller (componentes) and Generador (energía).
 * Stat 10 → +27 %.
 * --------------------------------------------------------- */
export function inteligenciaTechBonus(inteligencia: number): number {
  return (clampStat(inteligencia) - 1) * STAT_EFFECT_CONFIG.inteligenciaTechK;
}

/** ---------------------------------------------------------
 * PERCEPCIÓN (existing mechanic, exposed for display)
 * find-chance multiplier for the stat governing a resource.
 * Mirrors BALANCE.statEffectFactor (1 + stat × 0.035).
 * --------------------------------------------------------- */
export function findChanceFactor(stat: number): number {
  return 1 + clampStat(stat) * 0.035;
}

/** ---------------------------------------------------------
 * SUMMARY — for the PerfilTab display
 * --------------------------------------------------------- */
export interface StatEffectRow {
  key: StatKey;
  effect: string;
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

/** Human-readable summary of every stat's current effect. */
export function statEffectRows(stats: Stats): StatEffectRow[] {
  const agiFactor = factor(stats.agilidad, -STAT_EFFECT_CONFIG.agilidadDurationK, STAT_EFFECT_CONFIG.agilidadMinFactor, 1);
  const durReduction = Math.round((1 - agiFactor) * 100);
  const incReduction = Math.round((1 - incidentChanceFactor(stats.voluntad)) * 100);
  const dmg10 = mitigatedDamage(10, stats.voluntad, stats.resistencia);
  const dmgReduction = Math.round((1 - dmg10 / 10) * 100);
  const rare = rareFindChance(stats.percepcion);
  const units = maxUnitsPerFind(stats.fuerza);
  const tech = inteligenciaTechBonus(stats.inteligencia);

  return [
    { key: "percepcion", effect: `Hallazgo raro: ${(rare * 100).toFixed(1)}% por exploración (×3 cantidad)` },
    { key: "agilidad", effect: `Duración de exploración: −${durReduction}%` },
    { key: "voluntad", effect: `Riesgo de incidentes: −${incReduction}% · gravedad −${dmgReduction}%` },
    { key: "fuerza", effect: `Capacidad de carga: hasta ${units} unidades por hallazgo` },
    { key: "resistencia", effect: `Daño recibido: −${dmgReduction}%` },
    { key: "inteligencia", effect: `Taller/Generador: ${pct(tech)} eficiencia` },
  ];
}
