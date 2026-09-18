import { BALANCE } from "./balance";
import type { GameState } from "./types";

// ============================================================
// AFTERFALL — energy. Max 24, regenerates in discrete +1 blocks
// every 15 minutes using a persistent reference timestamp.
// lastEnergyRegenAt only advances when a full point is earned,
// so the UI countdown (nextRegenAt - Date.now()) ticks down
// correctly and survives tab switches / backgrounding.
// ============================================================

/** Returns the timestamp of the next energy regeneration. */
export function nextEnergyRegenAt(state: GameState): number {
  return state.lastEnergyRegenAt + BALANCE.energyRegenMinutesPerPoint * 60000;
}

/**
 * Advance energy by discrete +1 blocks. Returns the number of
 * whole points gained. Only mutates state when points are earned;
 * lastEnergyRegenAt advances in fixed 15-min steps (never to `now`
 * mid-cycle), so the UI countdown stays accurate.
 */
export function applyEnergyRegen(state: GameState, now = Date.now()): number {
  const msPerPoint = BALANCE.energyRegenMinutesPerPoint * 60000;
  let elapsed = Math.max(0, now - state.lastEnergyRegenAt);
  let gained = 0;

  // Award one point per complete 15-min block
  while (elapsed >= msPerPoint && state.resources.energia < BALANCE.maxEnergy) {
    state.resources.energia += 1;
    state.lastEnergyRegenAt += msPerPoint;
    elapsed -= msPerPoint;
    gained += 1;
  }

  // Clamp in case the stored value somehow exceeded max
  if (state.resources.energia > BALANCE.maxEnergy) {
    state.resources.energia = BALANCE.maxEnergy;
  }

  return gained;
}

/**
 * Read the current energy without mutating state.
 * Counts discrete blocks from the reference timestamp.
 */
export function currentEnergy(state: GameState, now = Date.now()): number {
  const msPerPoint = BALANCE.energyRegenMinutesPerPoint * 60000;
  const elapsed = Math.max(0, now - state.lastEnergyRegenAt);
  const pending = Math.floor(elapsed / msPerPoint);
  return Math.min(BALANCE.maxEnergy, state.resources.energia + pending);
}

export function canExplore(state: GameState, now = Date.now()): boolean {
  return currentEnergy(state, now) >= 1;
}

/**
 * Spend 1 energy point. Settles pending regen first (so no earned
 * point is lost), then deducts. Advances lastEnergyRegenAt to `now`
 * only when energy is spent, anchoring the next 15-min cycle to
 * the moment of the last spend (or the last earned point).
 */
export function spendEnergy(state: GameState, amount = 1, now = Date.now()): void {
  applyEnergyRegen(state, now);
  state.resources.energia = Math.max(0, state.resources.energia - amount);
  // Anchor next cycle: if energy is now depleted, the countdown starts fresh from now
  // If energy remains, the reference stays where it was (countdown continues naturally).
}
