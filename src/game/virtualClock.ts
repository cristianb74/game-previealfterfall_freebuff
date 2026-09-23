// ============================================================
// AFTERFALL — virtual session clock (dev/QA speed multiplier).
//
// The game simulates time via absolute timestamps stored in the
// save (upgradeFinishAt, lastEnergyRegenAt, exploration finishAt,
// foodMin/waterMin drain...). To speed the game up x2/x4 WITHOUT
// corrupting saved timestamps, we introduce a virtual "now":
//
//     vnow() = Date.now() + offset      (offset ≥ 0)
//
// While the multiplier is >1, `offset` grows by the real elapsed
// time × (mult − 1) at every tick, so virtual time advances `mult`
// real seconds per real second. vnow() NEVER moves backwards and
// always advances at least as fast as real time.
//
// Persisted data must stay on the REAL timeline: offline progress,
// cloud conflict resolution and boot checks all compare saved
// timestamps against Date.now(). `rebaseToRealTime(state)` folds
// the accumulated virtual lead into every timestamp of the state
// and resets the clock in the same instant — a uniform shift with
// zero gameplay discontinuity. GameProvider calls it before every
// local save and cloud push (fix b).
//
// Session-only by design: the multiplier is never persisted and
// resets to x1 on reload.
// ============================================================

import type { BuildingKey, GameState, ThematicBuildingKey } from "./types";

export type SpeedMultiplier = 1 | 2 | 4;

let offset = 0; // ms of game-time fast-forwarded this session (≥ 0)
let mult: SpeedMultiplier = 1;
let lastReal = 0; // last real timestamp seen by step()

/** Virtual game time. Advances at `mult` × real speed; never backwards. */
export function vnow(): number {
  return Date.now() + offset;
}

/** Accumulate fast-forward for real time elapsed since the previous step. */
function step(): void {
  const now = Date.now();
  if (lastReal > 0 && mult > 1) {
    offset += (now - lastReal) * (mult - 1);
  }
  lastReal = now;
}

/** Change the session speed multiplier (x1 stops accumulating; the
 *  already-accumulated lead stays until the next rebase). */
export function setSpeedMultiplier(m: SpeedMultiplier): void {
  if (m === mult) return;
  step(); // settle elapsed real time at the OLD multiplier first
  mult = m;
}

export function getSpeedMultiplier(): SpeedMultiplier {
  return mult;
}

/** Realign virtual time to real time (offset = 0). Used on boot,
 *  new game, restore-from-cloud and account reset, so a restored
 *  state (real-timeline timestamps) never desyncs from the clock. */
export function resetVirtualClock(): void {
  offset = 0;
  lastReal = 0;
}

/** Call once per game tick so the offset tracks real time while x>1
 *  (including app backgrounded: the stale lastReal catches up correctly). */
export function tickVirtualClock(): void {
  step();
}

// ---------------- fix b: real-timeline persistence ----------------

/** Current virtual lead over real time (ms). 0 while x1. */
export function virtualLead(): number {
  return offset;
}

/** Shift every absolute timestamp in the state back by `leadMs`. */
function shiftStateTimestamps(state: GameState, leadMs: number): void {
  state.createdAt -= leadMs;
  state.lastTickAt -= leadMs;
  state.lastEnergyRegenAt -= leadMs;
  for (const key of Object.keys(state.explorationStates)) {
    const run = state.explorationStates[Number(key)];
    if (run) {
      run.startedAt -= leadMs;
      run.finishAt -= leadMs;
    }
  }
  for (const key of Object.keys(state.autoFarms)) {
    const run = state.autoFarms[Number(key)];
    if (run) {
      run.startedAt -= leadMs;
      run.finishAt -= leadMs;
    }
  }
  // Global base (core buildings).
  for (const bKey of Object.keys(state.base ?? {}) as BuildingKey[]) {
    const b = state.base?.[bKey];
    if (b?.upgradeFinishAt != null) b.upgradeFinishAt -= leadMs;
  }
  // Per-zone thematic buildings.
  for (const key of Object.keys(state.zones)) {
    const zs = state.zones[Number(key)];
    if (!zs) continue;
    for (const bKey of Object.keys(zs.thematic ?? {}) as ThematicBuildingKey[]) {
      const b = zs.thematic[bKey];
      if (b?.upgradeFinishAt != null) b.upgradeFinishAt -= leadMs;
    }
  }
  for (const npc of state.npcs) {
    npc.discoveredAt -= leadMs;
  }
  for (const npcId of Object.keys(state.npcCycles)) {
    state.npcCycles[npcId] -= leadMs;
  }
  for (const entry of state.log) {
    entry.t -= leadMs;
  }
}

/**
 * Fold the accumulated virtual lead into the given state and re-align
 * the clock with real time (uniform shift — no gameplay discontinuity,
 * remaining countdowns are unchanged). Call with the live state BEFORE
 * persisting it locally or to the cloud, so saved timestamps always
 * live on the real timeline. Returns true when a rebase happened.
 */
export function rebaseToRealTime(state?: GameState): boolean {
  const lead = offset;
  if (!(lead > 0)) return false;
  if (state) shiftStateTimestamps(state, lead);
  offset = 0;
  lastReal = Date.now();
  return true;
}
