import { BALANCE } from "../balance";
import type { GameState, Recipe, ResourceKey, StatKey } from "../types";
import { RECIPE_BY_ID } from "./recipes";

// ============================================================
// AFTERFALL — crafted-item effects (the wiring layer).
// Recipes declare intent (effectData); THIS module maps each effect
// to the real system hook. No gameplay formula changes here: each
// function returns a modifier that existing code applies at its
// own calculation point.
//
// ACTIVATION MODEL (asignaciones):
//  · consumable → used via useCraftedItem (quantity −1, immediate effect)
//  · passive    → ASSIGNED to a zone or an NPC from Mochila. Creating the
//                 assignment consumes 1 unit; while it is active (now <
//                 endsAt) the effect applies ONLY to that target. No
//                 stacking: one recipe can sit on one target once.
//  · unlock     → owning one permanently gates a feature (radio event)
//
// All factor helpers below take an optional context ({ zoneId, npcId }):
// the caller passes the zone being explored / the NPC producing, and the
// helper folds in every matching active assignment for that target.
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

// ------------------------------------------------------------
// ASIGNACIONES — active assignments store on GameState.assignments.
// Created by the provider action (quantity −1); expiry uses the same
// catch-up pattern as the crafting queue (on load + dedicated timer),
// so reads never need to mutate state: helpers filter on endsAt.
// ------------------------------------------------------------

/** All ACTIVE (non-expired) assignments, pruned view. Pure. */
export function activeAssignments(
  state: Pick<GameState, "assignments">,
  now: number,
): GameState["assignments"] {
  return (state.assignments ?? []).filter((a) => a.endsAt > now);
}

/** Active assignment of `recipeId` on a specific target (zone id or NPC
 *  id), or null. Enforces the one-recipe-one-target rule at read time. */
export function activeAssignmentFor(
  state: Pick<GameState, "assignments">,
  recipeId: string,
  targetId: string,
  now: number,
): GameState["assignments"][number] | null {
  return (state.assignments ?? []).find(
    (a) => a.recipeId === recipeId && a.targetId === targetId && a.endsAt > now,
  ) ?? null;
}

/** Active zone assignment of `recipeId` on zone `zoneId`, or null. */
export function activeAssignmentForZone(
  state: Pick<GameState, "assignments">,
  recipeId: string,
  zoneId: number,
  now: number,
): GameState["assignments"][number] | null {
  return activeAssignmentFor(state, recipeId, String(zoneId), now);
}

/** Active NPC assignment of `recipeId` on NPC `npcId`, or null. */
export function activeAssignmentForNpc(
  state: Pick<GameState, "assignments">,
  recipeId: string,
  npcId: string,
  now: number,
): GameState["assignments"][number] | null {
  return activeAssignmentFor(state, recipeId, npcId, now);
}

/** Remove expired assignments in place; returns the recipes that expired
 *  (for logs). Called on load (catch-up) and by the expiry timer. */
export function pruneExpiredAssignments(
  state: GameState,
  now = Date.now(),
): string[] {
  if (!Array.isArray(state.assignments)) {
    state.assignments = [];
    return [];
  }
  const expired = state.assignments.filter((a) => a.endsAt <= now);
  if (expired.length > 0) {
    state.assignments = state.assignments.filter((a) => a.endsAt > now);
  }
  return expired.map((a) => RECIPE_BY_ID[a.recipeId]?.name ?? a.recipeId);
}

/** Soonest endsAt among active assignments (null when none) — drives the
 *  dedicated expiry timer, mirroring the crafting-queue next-check. */
export function nextAssignmentExpiry(
  state: Pick<GameState, "assignments">,
  now: number,
): number | null {
  let soonest: number | null = null;
  for (const a of state.assignments ?? []) {
    if (a.endsAt > now && (soonest == null || a.endsAt < soonest)) soonest = a.endsAt;
  }
  return soonest;
}

/** Who is the assigned NPC of `zoneId` (active, non-expired)? */
function assignedNpcIdOfZone(
  state: Pick<GameState, "zones" | "npcs">,
  zoneId: number,
): string | null {
  return state.zones?.[zoneId]?.assignedNpcId ?? null;
}

// ------------------------------------------------------------
// ASSIGNMENT MODIFIERS — per-effect lookups over active assignments.
// Each returns the assignment whose effect applies to the given context,
// or null. Zone effects require an assignment on THAT zone; NPC effects
// require an assignment on THAT NPC.
// ------------------------------------------------------------

/** Linterna (zone): −10% exploration duration in that zone. */
export function linternaAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "linterna", zoneId, now);
}

/** Mapa (zone): +5% resource-find probability in that zone. */
export function mapaAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "mapa", zoneId, now);
}

/** Detector (zone): +10% special finds in that zone (manual only). */
export function detectorAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "detector", zoneId, now);
}

/** Guantes (zone): −10% injury risk while searching that zone. */
export function guantesAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "guantes", zoneId, now);
}

/** Protección (zone): −15% damage from minor events in that zone. */
export function proteccionAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "proteccion", zoneId, now);
}

/** Escáner (zone): +10% money finds in that zone. */
export function escanerAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "escaner", zoneId, now);
}

/** Imán (zone): +8% probability of finding Componentes in that zone.
 *  Wired into the resource-weighted pick of the exploration roll. */
export function imanAssignment(state: GameState, zoneId: number, now: number) {
  return activeAssignmentForZone(state, "iman", zoneId, now);
}

/** NPC-targeted: prismáticos (+8% Percepción of THAT NPC). */
export function prismaticosAssignment(state: GameState, npcId: string, now: number) {
  return activeAssignmentForNpc(state, "prismaticos", npcId, now);
}

/** NPC-targeted: botas (+8% Agilidad of THAT NPC). */
export function botasAssignment(state: GameState, npcId: string, now: number) {
  return activeAssignmentForNpc(state, "botas", npcId, now);
}

/** NPC-targeted: mochila de superviviente (+15% production amounts of
 *  THAT NPC, mirroring the overall-capacity line of the recipe). */
export function mochilaSupervivienteAssignment(state: GameState, npcId: string, now: number) {
  return activeAssignmentForNpc(state, "mochila_superviviente", npcId, now);
}

// ------------------------------------------------------------
// FACTOR HELPERS — one per system hook. All pure, all read the REAL
// state (assignments filtered by target + buffs). They accept an
// optional context so every existing call-site keeps its signature.
// ------------------------------------------------------------

/** Zone-targeted factors bundle for one exploration roll (zoneId known).
 *  Everything a zone assignment can modify in that zone, in one pass. */
export interface ZoneAssignmentFactors {
  duration: number; // linterna
  resourceFind: number; // mapa
  moneyFind: number; // escáner (prob + amount)
  amount: (r: ResourceKey) => number; // mochila recolección / kit técnico
  specialFind: number; // detector
  injuryRisk: number; // guantes
  damageTaken: number; // protección
  iman: number; // imán (componentes find probability)
}

/** Collect all zone assignments for one zone (single read of state). */
export function zoneAssignmentFactors(state: GameState, zoneId: number, now: number): ZoneAssignmentFactors {
  return {
    duration: linternaAssignment(state, zoneId, now) ? 1 - 0.1 : 1,
    resourceFind: mapaAssignment(state, zoneId, now) ? 1 + 0.05 : 1,
    moneyFind: escanerAssignment(state, zoneId, now) ? 1 + 0.1 : 1,
    amount: (r: ResourceKey) => {
      let factor = 1;
      if (activeAssignmentForZone(state, "mochila_recoleccion", zoneId, now) && r === "materiales") factor += 0.1;
      if (activeAssignmentForZone(state, "kit_tecnico", zoneId, now) && r === "componentes") factor += 0.1;
      return factor;
    },
    specialFind: detectorAssignment(state, zoneId, now) ? 1 + 0.1 : 1,
    injuryRisk: guantesAssignment(state, zoneId, now) ? 1 - 0.1 : 1,
    damageTaken: proteccionAssignment(state, zoneId, now) ? 1 - 0.15 : 1,
    iman: imanAssignment(state, zoneId, now) ? 1 + 0.08 : 1,
  };
}

/** Kit de provisiones buff: −10% Comida/Agua consumption while active. */
export function consumptionFactor(state: GameState, now: number): number {
  return buffActive(state, "consumo_comida_agua", now) ? 1 - 0.1 : 1;
}

/** Linterna asignada: −10% exploration duration ONLY in its assigned zone
 *  (manual and auto runs read the same factor, online and offline). */
export function explorationDurationFactor(state: GameState, zoneId?: number, now = Date.now()): number {
  return zoneId != null && linternaAssignment(state, zoneId, now) ? 1 - 0.1 : 1;
}

/** +8% effective Percepción during exploration (prismáticos) —
 *  assignment model: applies only if prismáticos are assigned to the
 *  NPC assigned to the zone being explored. NPCs don't explore, so a
 *  prismáticos assignment lifts the rare-find tier of that zone. */
export function perceptionFactor(state: GameState, zoneId?: number, now = Date.now()): number {
  const npcId = zoneId != null ? assignedNpcIdOfZone(state, zoneId) : null;
  return npcId && prismaticosAssignment(state, npcId, now) ? 1.08 : 1;
}

/** +8% effective Agility during exploration (botas) — same pattern. */
export function agilityFactor(state: GameState, zoneId?: number, now = Date.now()): number {
  const npcId = zoneId != null ? assignedNpcIdOfZone(state, zoneId) : null;
  return npcId && botasAssignment(state, npcId, now) ? 1.08 : 1;
}

/** Zone-targeted gathering: +10% Materiales (mochila de recolección) and
 *  +10% Componentes (kit técnico) while assigned to the zone. NPC items
 *  apply to NPC production (npcTypes), not to the survivor's exploration. */
export function findAmountFactor(
  state: GameState,
  resource: ResourceKey,
  zoneId?: number,
  now = Date.now(),
): number {
  if (zoneId == null) return 1;
  let factor = 1;
  if (activeAssignmentForZone(state, "mochila_recoleccion", zoneId, now) && resource === "materiales") factor += 0.1;
  if (activeAssignmentForZone(state, "kit_tecnico", zoneId, now) && resource === "componentes") factor += 0.1;
  return factor;
}

/** Mapa asignado: +5% resource-find probability in that zone (kept as a
 *  named helper for readability at the rollExploration call-site). */
export function resourceFindFactor(state: GameState, zoneId: number, now = Date.now()): number {
  return mapaAssignment(state, zoneId, now) ? 1.05 : 1;
}

/** Detector asignado: +10% special finds in that zone (manual only). */
export function specialFindFactor(state: GameState, zoneId: number, now = Date.now()): number {
  return detectorAssignment(state, zoneId, now) ? 1.1 : 1;
}

/** Guantes asignados: −10% injury risk while searching that zone. */
export function injuryRiskFactor(state: GameState, zoneId?: number, now = Date.now()): number {
  return zoneId != null && guantesAssignment(state, zoneId, now) ? 0.9 : 1;
}

/** Protección asignada: −15% damage from minor events in that zone. */
export function damageTakenFactor(state: GameState, zoneId?: number, now = Date.now()): number {
  return zoneId != null && proteccionAssignment(state, zoneId, now) ? 0.85 : 1;
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

/** Radio portátil: permanently unlocks the weekly radio event (owned once,
 *  no target, no duration). */
export function radioEventUnlocked(state: Pick<GameState, "craftedInventory">): boolean {
  return (state.craftedInventory["radio"] ?? 0) > 0;
}

/** Assignment effect → stat overlay descriptor (for npcTypes hooks and UI). */
export function assignmentStatOverlay(
  state: GameState,
  npcId: string,
  now: number,
): Partial<Record<StatKey, number>> {
  const overlay: Partial<Record<StatKey, number>> = {};
  if (prismaticosAssignment(state, npcId, now)) overlay.percepcion = 0.08;
  if (botasAssignment(state, npcId, now)) overlay.agilidad = 0.08;
  return overlay;
}
