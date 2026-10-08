import { gainEnergy, spendEnergy } from "../energySystem";
import type { GameState, Recipe, ResourceKey } from "../types";

// ============================================================
// AFTERFALL — CRAFTING logic (pure state functions).
// Resources are the REAL GameState pools — crafting only deducts
// from / refunds to them, atomically, inside the caller's single
// setAndSave-style update. No second resource store exists.
// The queue is sequential with REAL timestamps (Date.now()); the
// catch-up below resolves everything that finished while the app
// was closed, in order, idempotently (double runs never duplicate
// inventory grants).
// ============================================================

/** The app's REAL resource keys. comida/agua map to the survival-minute
 *  pools (foodMin/waterMin); energia is the 0–24 point scale. */
export const CRAFT_RESOURCE_KEYS: ResourceKey[] = [
  "materiales",
  "agua",
  "comida",
  "medicamentos",
  "componentes",
  "energia",
];

/** Real current amount of a resource (floor to units). */
function realAmount(s: GameState, key: ResourceKey): number {
  if (key === "comida") return Math.floor(s.foodMin);
  if (key === "agua") return Math.floor(s.waterMin);
  return Math.floor(s.resources[key]);
}

/** Can the REAL state afford this cost right now? */
export function canAfford(s: GameState, costs: Partial<Record<ResourceKey, number>>): boolean {
  return (Object.keys(costs) as ResourceKey[]).every(
    (k) => realAmount(s, k) >= (costs[k] ?? 0),
  );
}

/** Missing resources for the detail panel (0 = covered). */
export function missingCosts(
  s: GameState,
  costs: Partial<Record<ResourceKey, number>>,
): Partial<Record<ResourceKey, number>> {
  const missing: Partial<Record<ResourceKey, number>> = {};
  for (const k of Object.keys(costs) as ResourceKey[]) {
    const need = costs[k] ?? 0;
    const have = realAmount(s, k);
    if (have < need) missing[k] = need - have;
  }
  return missing;
}

/** Deduct a cost from the REAL pools (comida/agua → minutes pools). */
function deduct(s: GameState, costs: Partial<Record<ResourceKey, number>>): void {
  for (const k of Object.keys(costs) as ResourceKey[]) {
    const amount = costs[k] ?? 0;
    if (amount <= 0) continue;
    if (k === "comida") {
      s.foodMin = Math.max(0, s.foodMin - amount);
    } else if (k === "agua") {
      s.waterMin = Math.max(0, s.waterMin - amount);
    } else if (k === "energia") {
      spendEnergy(s, amount);
    } else {
      s.resources[k] = Math.max(0, s.resources[k] - amount);
    }
  }
}

/** Refund a cost to the REAL pools (cancel path / migration compensation). */
export function refundCost(s: GameState, costs: Partial<Record<ResourceKey, number>>): void {
  for (const k of Object.keys(costs) as ResourceKey[]) {
    const amount = costs[k] ?? 0;
    if (amount <= 0) continue;
    if (k === "comida") {
      s.foodMin += amount;
    } else if (k === "agua") {
      s.waterMin += amount;
    } else if (k === "energia") {
      gainEnergy(s, amount);
    } else {
      s.resources[k] += amount;
    }
  }
}

/** Start crafting `recipe` NOW: validates affordability, deducts the cost
 *  atomically and appends the queue item. `startedAt` is only set when the
 *  queue was empty (this becomes the active item); otherwise the item waits
 *  and starts when it reaches the front (see advanceQueue). */
export function startCraft(s: GameState, recipe: Recipe, now = Date.now()): void {
  if (!canAfford(s, recipe.costs)) return;
  deduct(s, recipe.costs);
  const startsNow = s.craftingQueue.length === 0;
  s.craftingQueue.push({
    uid: `${recipe.id}-${now}-${Math.floor(Math.random() * 1e6)}`,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    timeSeconds: recipe.timeSeconds,
    costs: { ...recipe.costs },
    startedAt: startsNow ? now : 0,
    endsAt: startsNow ? now + recipe.timeSeconds * 1000 : 0,
  });
}

/** Cancel a queued item by uid: full refund from the FROZEN cost snapshot
 *  and removal. The currently crafting item's progress is untouched unless
 *  it is the one being cancelled — and when it is, the next item starts
 *  from "now" (waiting items just shift forward). */
export function cancelCraft(s: GameState, uid: string, now = Date.now()): void {
  const idx = s.craftingQueue.findIndex((q) => q.uid === uid);
  if (idx === -1) return;
  const [item] = s.craftingQueue.splice(idx, 1);
  refundCost(s, item.costs);
  // The cancelled item was the ACTIVE one: start the new front from now.
  if (idx === 0 && s.craftingQueue.length > 0) {
    startNextItem(s, now);
  }
}

/** Make the queue's front item the active craft starting at `now`. */
function startNextItem(s: GameState, now: number): void {
  const front = s.craftingQueue[0];
  if (!front || front.startedAt !== 0) return;
  front.startedAt = now;
  front.endsAt = now + front.timeSeconds * 1000;
}

/** Resolve finished crafts IN ORDER (the queue is sequential, so items
 *  finish one by one) and hand waiting items their start timestamps.
 *  Idempotent: each completion requires the item to actually exist with a
 *  valid startedAt — double calls (timer + load) can never double-grant.
 *  Returns the names of items completed by THIS call (for the notice). */
export function resolveFinishedCrafts(s: GameState, now = Date.now()): string[] {
  const completed: string[] = [];
  let guard = 0; // paranoid loop guard
  while (s.craftingQueue.length > 0 && guard++ < 100) {
    const front = s.craftingQueue[0];
    if (front.startedAt === 0 || now < front.endsAt) break;
    s.craftingQueue.shift();
    s.craftedInventory[front.recipeId] = (s.craftedInventory[front.recipeId] ?? 0) + 1;
    completed.push(front.name);
    if (s.craftingQueue.length > 0) startNextItem(s, front.endsAt);
  }
  return completed;
}

/** Idempotent load-side catch-up: fix waiting items that hold stale
 *  zero/missing timestamps, then resolve everything that finished while
 *  the app was closed. Safe to call on every boot. */
export function catchUpCrafting(s: GameState, now = Date.now()): void {
  for (const item of s.craftingQueue) {
    if (typeof item.startedAt !== "number") item.startedAt = 0;
    if (typeof item.endsAt !== "number") item.endsAt = 0;
    if (typeof item.costs !== "object" || item.costs == null) item.costs = {};
  }
  if (s.craftingQueue[0] && s.craftingQueue[0].startedAt === 0) {
    startNextItem(s, now);
  }
  resolveFinishedCrafts(s, now);
}

/** Selector for future effect wiring: how many of a crafted item are held. */
export function getCraftedCount(s: GameState, recipeId: string): number {
  return s.craftedInventory[recipeId] ?? 0;
}

/** Recipe ids affordable right now (cards' DISPONIBLE badge). */
export function craftableRecipeIds(s: GameState, recipes: Recipe[]): Set<string> {
  const set = new Set<string>();
  for (const r of recipes) {
    if (canAfford(s, r.costs)) set.add(r.id);
  }
  return set;
}
