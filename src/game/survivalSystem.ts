// ============================================================
// AFTERFALL — survival tiers (balance module).
// Progressive hunger/thirst penalties instead of an abrupt
// cut. Tiers derive from `foodMin` / `waterMin` (minutes of
// survival time remaining), so they react to consumption and
// to finds alike.
//
// TIER TABLE (minutes remaining, derived from foodMin/waterMin)
//   OK        > tierLeveMin          → no penalty
//   LEVE      (leve, moderada]       → small drain + −5 % exploration
//   MODERADA  (moderada, critica]    → medium drain + −15 % exploration + −energy regen
//   CRITICA   (0, critica]           → heavy drain + −35 % exploration + −energy regen
//   COLAPSO   0                      → max drain + −50 % exploration
//
// Both hunger and thirst apply independently; the WORST tier
// drives exploration/energy penalties. Health drain adds up.
// ============================================================

import type { GameState } from "./types";

/** ---------------------------------------------------------
 * TUNABLE CONSTANTS — edit here, nowhere else.
 * --------------------------------------------------------- */
export const SURVIVAL_CONFIG = {
  /** Tier thresholds in MINUTES of remaining food/water. */
  tierLeveMin: 720, // below 12 h
  tierModeradaMin: 240, // below 4 h
  tierCriticaMin: 60, // below 1 h

  /** Health drain per hour while in each tier (adds to existing upkeep). */
  drainLeve: 0.4,
  drainModerada: 1.2,
  drainCritica: 3,
  drainColapso: 6,

  /** Exploration find-chance multiplier while in each tier. */
  efficiencyLeve: 0.95,
  efficiencyModerada: 0.85,
  efficiencyCritica: 0.65,
  efficiencyColapso: 0.5,

  /** Energy regen: extra minutes per +1 point while in MODERADA or worse. */
  regenPenaltyModerada: 5,
  regenPenaltyCritica: 10,
  regenPenaltyColapso: 15,
} as const;

export type SurvivalTier = "ok" | "leve" | "moderada" | "critica" | "colapso";

export const TIER_META: Record<SurvivalTier, { label: string; color: string }> = {
  ok: { label: "OK", color: "#22c55e" },
  leve: { label: "HAMBRE LEVE", color: "#facc15" },
  moderada: { label: "HAMBRE MODERADA", color: "#fb923c" },
  critica: { label: "HAMBRE CRÍTICA", color: "#ef4444" },
  colapso: { label: "COLAPSO", color: "#ef4444" },
};

/** Tier for one survival meter (minutes remaining). */
export function tierFor(minutes: number): SurvivalTier {
  if (minutes <= 0) return "colapso";
  if (minutes < SURVIVAL_CONFIG.tierCriticaMin) return "critica";
  if (minutes < SURVIVAL_CONFIG.tierModeradaMin) return "moderada";
  if (minutes < SURVIVAL_CONFIG.tierLeveMin) return "leve";
  return "ok";
}

/** Health drain per hour for a tier. */
export function drainPerHour(tier: SurvivalTier): number {
  switch (tier) {
    case "leve": return SURVIVAL_CONFIG.drainLeve;
    case "moderada": return SURVIVAL_CONFIG.drainModerada;
    case "critica": return SURVIVAL_CONFIG.drainCritica;
    case "colapso": return SURVIVAL_CONFIG.drainColapso;
    default: return 0;
  }
}

/** Exploration find-chance multiplier for a tier. */
export function efficiencyFactor(tier: SurvivalTier): number {
  switch (tier) {
    case "leve": return SURVIVAL_CONFIG.efficiencyLeve;
    case "moderada": return SURVIVAL_CONFIG.efficiencyModerada;
    case "critica": return SURVIVAL_CONFIG.efficiencyCritica;
    case "colapso": return SURVIVAL_CONFIG.efficiencyColapso;
    default: return 1;
  }
}

/** Extra minutes added to the energy regen cycle for a tier (0 for OK/LEVE). */
export function regenPenaltyMinutes(tier: SurvivalTier): number {
  switch (tier) {
    case "moderada": return SURVIVAL_CONFIG.regenPenaltyModerada;
    case "critica": return SURVIVAL_CONFIG.regenPenaltyCritica;
    case "colapso": return SURVIVAL_CONFIG.regenPenaltyColapso;
    default: return 0;
  }
}

/** ---------------------------------------------------------
 * State helpers
 * --------------------------------------------------------- */
export function hungerTier(state: GameState): SurvivalTier {
  return tierFor(state.foodMin);
}

export function thirstTier(state: GameState): SurvivalTier {
  return tierFor(state.waterMin);
}

const TIER_SEVERITY: Record<SurvivalTier, number> = {
  ok: 0,
  leve: 1,
  moderada: 2,
  critica: 3,
  colapso: 4,
};

/** The WORST of hunger/thirst drives global penalties. */
export function worstTier(state: GameState): SurvivalTier {
  const h = hungerTier(state);
  const t = thirstTier(state);
  return TIER_SEVERITY[h] >= TIER_SEVERITY[t] ? h : t;
}

/** Multiplier applied to exploration find chance (use worst tier). */
export function survivalEfficiency(state: GameState): number {
  return efficiencyFactor(worstTier(state));
}

/** Extra minutes on the energy regen cycle (use worst tier). */
export function survivalRegenPenalty(state: GameState): number {
  return regenPenaltyMinutes(worstTier(state));
}

/** ---------------------------------------------------------
 * TICK APPLICATION — health drain from hunger + thirst.
 * Call once per tick (or offline settlement). `hours` is the
 * elapsed fraction. Returns total HP lost this call.
 * --------------------------------------------------------- */
export function applySurvivalDrain(state: GameState, hours: number): number {
  if (hours <= 0 || state.health <= 0) return 0;
  const drain =
    drainPerHour(hungerTier(state)) * hours +
    drainPerHour(thirstTier(state)) * hours;
  if (drain <= 0) return 0;
  const applied = Math.min(state.health, drain);
  state.health = Math.max(0, state.health - drain);
  return applied;
}
