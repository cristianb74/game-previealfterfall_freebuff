import { BALANCE } from "./balance";
import type { GameState } from "./types";

// ============================================================
// AFTERFALL — energy. Max 24, regenerates in real time using
// absolute timestamps (works while the app is closed).
// ============================================================

export function applyEnergyRegen(state: GameState, now = Date.now()): number {
  const elapsedMs = Math.max(0, now - state.lastEnergyRegenAt);
  const gained = (elapsedMs / 60000) / BALANCE.energyRegenMinutesPerPoint;
  const current = state.resources.energia;
  const next = Math.min(BALANCE.maxEnergy, current + gained);
  state.resources.energia = next;
  state.lastEnergyRegenAt = now;
  return next - current;
}

export function currentEnergy(state: GameState, now = Date.now()): number {
  const elapsedMs = Math.max(0, now - state.lastEnergyRegenAt);
  const gained = (elapsedMs / 60000) / BALANCE.energyRegenMinutesPerPoint;
  return Math.min(BALANCE.maxEnergy, state.resources.energia + gained);
}

export function canExplore(state: GameState, now = Date.now()): boolean {
  return currentEnergy(state, now) >= 1;
}

/** Spend 1 energy point (exploration cost). Assumes canExplore was checked. */
export function spendEnergy(state: GameState, amount = 1, now = Date.now()): void {
  // settle regen to `now` first so no regen is lost while spending
  applyEnergyRegen(state, now);
  state.resources.energia = Math.max(0, state.resources.energia - amount);
}
