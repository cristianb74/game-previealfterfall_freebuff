// ============================================================
// AFTERFALL — virtual session clock (dev/QA speed multiplier).
//
// The game simulates time via absolute timestamps stored in the
// save (upgradeFinishAt, lastEnergyRegenAt, exploration finishAt,
// foodMin/waterMin drain...). To speed the game up x2/x4 WITHOUT
// corrupting saved timestamps, we introduce a virtual "now":
//
//     vnow() = Date.now() - offset
//
// While the multiplier is >1, `offset` grows by the real elapsed
// time × (mult − 1) at every tick, so virtual time advances `mult`
// real seconds per real second. Saved timestamps stay absolute and
// coherent within the session; on reload the module resets (x1) and
// offline progress sees only the real elapsed time — no exploits,
// no stuck accelerations.
//
// Session-only by design: never persisted, never synced to cloud.
// ============================================================

export type SpeedMultiplier = 1 | 2 | 4;

let offset = 0; // ms of game-time fast-forwarded this session
let mult: SpeedMultiplier = 1;
let lastReal = 0; // last real timestamp seen by step()

/** Virtual game time. Always ≤ real time, never jumps backwards. */
export function vnow(): number {
  return Date.now() - offset;
}

/** Accumulate fast-forward for real time elapsed since the previous step. */
function step(): void {
  const now = Date.now();
  if (lastReal > 0 && mult > 1) {
    offset += (now - lastReal) * (mult - 1);
  }
  lastReal = now;
}

/** Change the session speed multiplier (x1 resets to normal time). */
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
