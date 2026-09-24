import { BALANCE } from "./balance";
import { getZone } from "./zones";
import { vnow } from "./virtualClock";
import type { GameState, ResourceKey, ScavengeCell } from "./types";

// ============================================================
// AFTERFALL — SCAVENGE event (minijuego de recolección).
// Random trigger on MANUAL exploration start with a pity system:
// base 20 %, guaranteed after 5 explorations without the event.
// The minigame UI lives in components/game/ScavengeModal.tsx;
// everything here is pure state logic so the tick and offline
// paths can never drift from the online one.
// ============================================================

export interface ScavengeGrant {
  resource: ResourceKey;
  amount: number;
}

/** Zone bonus to the base scavenge chance (hook point for zone
 *  properties / special constructions: `baseChance + zoneBonus`). */
export function scavengeZoneBonus(zoneId: number): number {
  void zoneId;
  return 0;
}

/** Effective trigger chance for the CURRENT pity counter (0–1):
 *  base 20 % (+ zone bonus) … pity threshold → 100 %. UI-facing. */
export function scavengeChanceFor(counter: number, zoneId: number): number {
  if (counter >= BALANCE.scavengePityThreshold) return 1;
  return Math.min(1, BALANCE.scavengeBaseChance + scavengeZoneBonus(zoneId));
}

/** Decide whether this manual exploration start fires the event.
 *  Mutates the passed state: resets or increments the pity counter,
 *  and sets state.scavengeEvent when it fires. Returns true if fired. */
export function checkScavengeTrigger(state: GameState, zoneId: number): boolean {
  // One active event at a time; a running one is never interrupted.
  if (state.scavengeEvent) return false;
  const counter = state.explorationsSinceLastScavenge ?? 0;
  const chance = scavengeChanceFor(counter, zoneId);
  if (Math.random() >= chance) {
    state.explorationsSinceLastScavenge = counter + 1;
    return false;
  }
  // Fired: reset pity and open the event.
  state.explorationsSinceLastScavenge = 0;
  state.scavengeEvent = generateScavengeEvent(zoneId);
  return true;
}

function generateScavengeEvent(zoneId: number): NonNullable<GameState["scavengeEvent"]> {
  const now = vnow();
  const cells: ScavengeCell[] = [];
  for (let i = 0; i < BALANCE.scavengeCells; i++) {
    cells.push({ loot: rollCellLoot(zoneId) });
  }
  return {
    zoneId,
    startedAt: now,
    expiresAt: now + BALANCE.scavengeEventSeconds * 1000,
    board: cells,
    claimed: [],
  };
}

/** Loot of one board cell: a random resource from the zone's own pool
 *  (keeps the minigame tied to where the player is exploring), a small
 *  money chance, or null (escombros). Amounts from balance.ts. */
function rollCellLoot(zoneId: number): ScavengeCell["loot"] {
  if (Math.random() >= BALANCE.scavengeLootChance) return null;
  const zone = getZone(zoneId);
  const pool = zone.resources.filter((r) => r !== "dinero");
  const resource: ResourceKey =
    Math.random() < 0.15
      ? "dinero"
      : pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : "materiales";
  const isTime = resource === "comida" || resource === "agua";
  const amount = isTime
    ? BALANCE.scavengeLootTimeMin +
      Math.floor(Math.random() * (BALANCE.scavengeLootTimeMax - BALANCE.scavengeLootTimeMin + 1))
    : resource === "dinero"
      ? BALANCE.moneyFindMin + Math.floor(Math.random() * (BALANCE.moneyFindMax - BALANCE.moneyFindMin + 1))
      : BALANCE.scavengeLootUnitsMin +
        Math.floor(Math.random() * (BALANCE.scavengeLootUnitsMax - BALANCE.scavengeLootUnitsMin + 1));
  return { resource, amount };
}

/** Whether the active event has already expired (unclaimed loot is lost). */
export function isScavengeExpired(
  event: NonNullable<GameState["scavengeEvent"]>,
  now: number,
): boolean {
  return now >= event.expiresAt;
}

/** Apply the loot of CLAIMED cells to the game state and clear the event.
 *  Claimed loot is always granted — even if the timer expired afterwards;
 *  only the unclaimed cells are lost on expiry ("escombros" grant nothing).
 *  Returns the granted loot for the summary UI. */
export function completeScavenge(state: GameState): ScavengeGrant[] {
  const event = state.scavengeEvent;
  if (!event) return [];
  const granted: ScavengeGrant[] = [];
  for (const idx of event.claimed) {
    const loot = event.board[idx]?.loot;
    if (!loot) continue;
    if (loot.resource === "comida") state.foodMin += loot.amount;
    else if (loot.resource === "agua") state.waterMin += loot.amount;
    else state.resources[loot.resource] += loot.amount;
    granted.push({ resource: loot.resource, amount: loot.amount });
  }
  state.scavengeEvent = null;
  return granted;
}
