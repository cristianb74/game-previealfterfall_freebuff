import { BALANCE } from "../balance";
import type { GameState, Recipe, ResourceKey } from "../types";
import { RECIPE_BY_ID } from "./recipes";

// ============================================================
// AFTERFALL — crafted-item effects (the wiring layer).
// Recipes declare intent (effectData); THIS module maps each effect
// to the real system hook. No gameplay formula changes here: each
// function returns a modifier that existing code applies at its
// own calculation point.
//
// ACTIVATION MODEL (no equip-slot system exists in this game):
//  · consumable → used via useCraftedItem (quantity −1, immediate effect)
//  · passive    → active while craftedInventory[id] ≥ 1 (no stacking:
//                 owning 3 linternas is still +10%, applied once)
//  · unlock     → owning one permanently gates a feature (radio event)
// ============================================================

/** Recipe ids that are consumed on use (quantity −1, one-shot effect). */
const CONSUMABLE_IDS = new Set(["kit_provisiones", "botiquin"]);
/** Recipe ids that permanently unlock a feature by being owned. */
export const UNLOCK_IDS = new Set(["radio"]);

export type CraftedItemKind = "consumable" | "passive" | "unlock";

export function craftedItemKind(recipeId: string): CraftedItemKind {
  if (CONSUMABLE_IDS.has(recipeId)) return "consumable";
  if (UNLOCK_IDS.has(recipeId)) return "unlock";
  return "passive";
}

/** Passive bonuses are read as `count > 0` (never stacked by quantity). */
export function hasCrafted(state: Pick<GameState, "craftedInventory">, recipeId: string): boolean {
  return (state.craftedInventory[recipeId] ?? 0) > 0;
}

// ------------------------------------------------------------
// Timed buffs ({effectId, expiresAt}) — minimal active-buffs store
// on GameState.activeBuffs, pruned lazily on read.
// ------------------------------------------------------------

/** Add a buff, refreshing its expiry if the same effectId is running. */
export function addBuff(state: GameState, effectId: string, durationMin: number, now: number): void {
  if (!Array.isArray(state.activeBuffs)) state.activeBuffs = [];
  const expiresAt = now + durationMin * 60_000;
  const existing = state.activeBuffs.find((b) => b.effectId === effectId);
  if (existing) {
    existing.expiresAt = Math.max(existing.expiresAt, expiresAt);
  } else {
    state.activeBuffs.push({ effectId, expiresAt });
  }
}

/** Remove expired buffs in place (safe to call on every read). */
export function pruneBuffs(state: GameState, now: number): void {
  if (!Array.isArray(state.activeBuffs)) {
    state.activeBuffs = [];
    return;
  }
  if (state.activeBuffs.some((b) => b.expiresAt <= now)) {
    state.activeBuffs = state.activeBuffs.filter((b) => b.expiresAt > now);
  }
}

/** Is this timed effect running right now? */
export function buffActive(state: Pick<GameState, "activeBuffs">, effectId: string, now: number): boolean {
  return state.activeBuffs.some((b) => b.effectId === effectId && b.expiresAt > now);
}

/** Remaining ms of a timed effect (0 when not active). */
export function buffRemainingMs(state: Pick<GameState, "activeBuffs">, effectId: string, now: number): number {
  const b = state.activeBuffs.find((x) => x.effectId === effectId);
  if (!b || b.expiresAt <= now) return 0;
  return b.expiresAt - now;
}

// ------------------------------------------------------------
// EFFECT MODIFIERS — one function per system hook. All pure, all
// read the owned-items/buffs from the REAL state.
// ------------------------------------------------------------

/** Kit de provisiones buff: −10% Comida/Agua consumption while active. */
export function consumptionFactor(state: GameState, now: number): number {
  return buffActive(state, "consumo_comida_agua", now) ? 1 - 0.1 : 1;
}

/** +10% effective night exploration time (linterna): exploration runs take
 *  10% longer but the rewards never changed — modelled as a duration
 *  reduction applied at the 3 real call-sites, mirroring agilidad. */
export function explorationDurationFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "linterna") ? 1 - 0.1 : 1;
}

/** +8% effective Perception during exploration (prismáticos). */
export function perceptionFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "prismaticos") ? 1.08 : 1;
}

/** +8% effective Agility during exploration (botas). */
export function agilityFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "botas") ? 1.08 : 1;
}

/** +5% resource-find probability (mapa). */
export function resourceFindFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "mapa") ? 1.05 : 1;
}

/** +8% probability of finding Componentes (imán). */
export function componentesFindFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "iman") ? 1.08 : 1;
}

/** Per-resource amount multiplier for a find (mochila recolección +10%
 *  materiales, kit técnico +10% componentes, mochila superviviente +15%
 *  overall capacity, escáner +10% money). Applied where the find AMOUNT
 *  is finalized (rollExploration / tickNpcs / scavenge / offline NPC). */
export function findAmountFactor(state: Pick<GameState, "craftedInventory">, resource: ResourceKey): number {
  let factor = 1;
  if (hasCrafted(state, "mochila_recoleccion") && resource === "materiales") factor += 0.1;
  if (hasCrafted(state, "kit_tecnico") && resource === "componentes") factor += 0.1;
  if (hasCrafted(state, "mochila_superviviente")) factor += 0.15;
  if (hasCrafted(state, "escaner") && resource === "dinero") factor += 0.1;
  return factor;
}

/** +10% special finds (detector): multiplies manualSpecialEventChance. */
export function specialFindFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "detector") ? 1.1 : 1;
}

/** Injury risk from searching (guantes −10%, botas −8%): multiplicative on
 *  the damage roll probability. Clamped to never go below 0. */
export function injuryRiskFactor(state: Pick<GameState, "craftedInventory">): number {
  let factor = 1;
  if (hasCrafted(state, "guantes")) factor -= 0.1;
  if (hasCrafted(state, "botas")) factor -= 0.08;
  return Math.max(0, factor);
}

/** −15% damage from minor events (protección): multiplies applied damage. */
export function damageTakenFactor(state: Pick<GameState, "craftedInventory">): number {
  return hasCrafted(state, "proteccion") ? 1 - 0.15 : 1;
}

/** Radio portátil: permanently unlocks the weekly radio event. */
export function radioEventUnlocked(state: Pick<GameState, "craftedInventory">): boolean {
  return hasCrafted(state, "radio");
}

// ------------------------------------------------------------
// CONSUMABLES — real consumption via provider action.
// ------------------------------------------------------------

/** Apply a consumable's effect to the state (already validated: count ≥ 1).
 *  Returns a short log line for the notice. Mutates the passed state. */
export function applyConsumable(
  state: GameState,
  recipe: Recipe,
  now: number,
): string {
  switch (recipe.id) {
    case "botiquin": {
      const heal = typeof recipe.effectData?.value === "number" ? recipe.effectData.value : 20;
      const before = state.health;
      state.health = Math.min(BALANCE.maxHealth, state.health + heal);
      return `+${Math.round(state.health - before)} Salud`;
    }
    case "kit_provisiones": {
      const dur =
        typeof recipe.effectData?.duracionMin === "number" ? recipe.effectData.duracionMin : 30;
      addBuff(state, "consumo_comida_agua", dur, now);
      return `−10% consumo de Comida y Agua · ${dur} min`;
    }
    default:
      return recipe.effect;
  }
}

/** Use one crafted item: validates ownership, applies the effect and
 *  decrements the count (consumables only). Returns a result string for
 *  toasts/logs, or null when the use is invalid. Pure state mutation. */
export function useCraftedItem(
  state: GameState,
  recipeId: string,
  now = Date.now(),
): string | null {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return null;
  if (craftedItemKind(recipeId) !== "consumable") return null;
  const count = state.craftedInventory[recipeId] ?? 0;
  if (count < 1) return null;
  const result = applyConsumable(state, recipe, now);
  state.craftedInventory[recipeId] = count - 1;
  if (state.craftedInventory[recipeId] <= 0) delete state.craftedInventory[recipeId];
  return `${recipe.name}: ${result}`;
}
