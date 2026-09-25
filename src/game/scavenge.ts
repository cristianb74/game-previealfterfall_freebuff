import { BALANCE } from "./balance";
import { vnow } from "./virtualClock";
import { SCAVENGE_PINS, SCAVENGE_LOCATIONS, scavengeLocationForZone } from "./scavengeLocations";
import type { ScavengePointDef } from "./scavengeLocations";
import type {
  ActiveScavengeEvent,
  GameState,
  LogEvent,
  ResourceKey,
  ScavengePointId,
  ScavengePointResult,
} from "./types";

// ============================================================
// AFTERFALL — SCAVENGE event (minijuego de recolección).
// Stepped trigger chance by explorations since the last event
// (BALANCE.scavengeTiers — same pattern as npcTiers, independent
// curve). MANUAL: the 8 fixed search points are searched one by
// one (damage hits the REAL survivor health, floored at
// scavengeSessionRealHealthFloor). AUTO: all points resolve in
// chain inside the tick — no UI, same rolls.
// The minigame UI lives in components/game/ScavengeModal.tsx;
// everything here is pure state logic so the tick and offline
// paths can never drift from the online one.
// ============================================================

/** Trigger chance for the CURRENT counter (0–1), from scavengeTiers. */
export function scavengeChanceFor(counter: number): number {
  let chance = 0;
  for (const tier of BALANCE.scavengeTiers) {
    if (counter >= tier.afterExplorations) chance = tier.chance;
  }
  return chance;
}

/** Decide whether this completed exploration fires the event.
 *  Mutates the passed state: resets or increments the counter,
 *  and sets state.scavengeEvent when it fires (MANUAL only — auto
 *  resolves in chain and never opens the modal). */
export function checkScavengeTrigger(state: GameState, zoneId: number, fromAuto: boolean): boolean {
  // One active event at a time; a running one is never interrupted.
  if (state.scavengeEvent) return false;
  // Boot/restore guard: manual runs left over from a previous session are
  // completed by the tick right after boot (offlineProgress never clears
  // them). Firing here would open the modal as a full-screen blocker before
  // the player even reaches /juego — defer instead: the counter already
  // advanced and the next live completion rolls with the higher chance.
  if (typeof window !== "undefined" && window.location.pathname !== "/juego") return false;
  const counter = state.explorationsSinceLastScavenge ?? 0;
  const base = scavengeChanceFor(counter);
  const chance = fromAuto ? base * BALANCE.autoScavengeChanceFactor : base;
  const fired = Math.random() < chance;
  if (!fired) {
    state.explorationsSinceLastScavenge = counter + 1;
    pushLog(
      state,
      `[EXP] SCAVENGE CHECK | contador ${counter} | ${fromAuto ? "AUTO" : "MANUAL"} | probabilidad ${(chance * 100).toFixed(1)}% | resultado NO`,
      "info",
      vnow(),
    );
    return false;
  }
  // Fired: reset the counter and open/resolve the event.
  state.explorationsSinceLastScavenge = 0;
  state.scavengeEvent = {
    zoneId,
    startedAt: vnow(),
    board: SCAVENGE_PINS.map((pin) => ({ id: pin.id, result: null })),
  };
  return true;
}

/** Provider-style log push (kept local to avoid a circular import with
 *  GameProvider; mirrors the 60-entry cap used there). */
function pushLog(state: GameState, msg: string, kind: LogEvent["kind"], t: number): void {
  state.log.unshift({ t, msg, kind });
  if (state.log.length > 60) state.log.length = 60;
}

/** Pick a resource from a weighted loot table. */
function pickLootResource(table: { resource: ResourceKey; weight: number }[]): ResourceKey {
  const total = table.reduce((a, e) => a + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.resource;
  }
  return table[table.length - 1].resource;
}

/** Amount for a loot find: units roll 1–3, dinero 5–20, Comida/Agua
 *  roll simple units converted to survival MINUTES (scavengeFoodWaterMinutes
 *  per unit) so the grant lands in foodMin/waterMin directly. */
function rollLootAmount(resource: ResourceKey): number {
  if (resource === "dinero") {
    return (
      BALANCE.scavengeMoneyMin +
      Math.floor(Math.random() * (BALANCE.scavengeMoneyMax - BALANCE.scavengeMoneyMin + 1))
    );
  }
  const units =
    BALANCE.scavengeLootUnitsMin +
    Math.floor(Math.random() * (BALANCE.scavengeLootUnitsMax - BALANCE.scavengeLootUnitsMin + 1));
  return resource === "comida" || resource === "agua"
    ? units * BALANCE.scavengeFoodWaterMinutes
    : units;
}

function fillText(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** Roll the outcome of ONE search point. Pure aside from Math.random. */
function rollPoint(
  state: GameState,
  zoneId: number,
  pointId: ScavengePointId,
): ScavengePointResult {
  const loc = scavengeLocationForZone(zoneId);
  const def: ScavengePointDef | undefined = loc.points[pointId as keyof typeof loc.points];
  if (!def) {
    return { kind: "nada", text: "No hay nada aquí." };
  }
  const { loot, nada, dano } = def.weights;
  const total = loot + nada + dano;
  let roll = Math.random() * total;

  const pick = <T,>(variants: string[], vars: Record<string, string | number>): string =>
    fillText(variants[Math.floor(Math.random() * variants.length)] ?? variants[0], vars);

  // Daño
  roll -= dano;
  if (roll <= 0) {
    const damage =
      BALANCE.scavengeDamageMin +
      Math.floor(Math.random() * (BALANCE.scavengeDamageMax - BALANCE.scavengeDamageMin + 1));
    // Damage hits the REAL health, floored so a bad streak can never
    // knock the player to 0 inside the event (they leave it alive to
    // decide to keep searching or quit — real risk, never death here).
    const floor = BALANCE.scavengeSessionRealHealthFloor;
    const before = state.health;
    state.health = Math.max(floor, state.health - damage);
    const applied = Math.max(0, before - state.health);
    return { kind: "dano", damage: applied, text: pick(def.texts.dano, { damage: applied }) };
  }
  // Nada
  roll -= nada;
  if (roll <= 0) {
    return { kind: "nada", text: pick(def.texts.nada, {}) };
  }
  // Loot
  const resource = pickLootResource(def.loot);
  const amount = rollLootAmount(resource);
  applyGrant(state, resource, amount);
  const isTime = resource === "comida" || resource === "agua";
  return {
    kind: "loot",
    loot: { resource, amount },
    text: fillText(
      def.texts.loot[Math.floor(Math.random() * def.texts.loot.length)] ?? def.texts.loot[0],
      { amount: `${amount}${isTime ? " min" : ""}`, res: resourceLabel(resource) },
    ),
  };
}

function resourceLabel(r: ResourceKey): string {
  switch (r) {
    case "materiales": return "Materiales";
    case "agua": return "Agua";
    case "comida": return "Comida";
    case "medicamentos": return "Medicamentos";
    case "componentes": return "Componentes";
    case "energia": return "Energía";
    case "dinero": return "$";
  }
}

/** Credit a loot grant to the state (Comida/Agua arrive in MINUTES). */
export function applyGrant(state: GameState, resource: ResourceKey, amount: number): void {
  if (resource === "comida") state.foodMin += amount;
  else if (resource === "agua") state.waterMin += amount;
  else state.resources[resource] += amount;
}

/** Search one point of the ACTIVE event (rolls and stores the result).
 *  Returns the result, or null if the point was already searched. */
export function searchScavengePoint(state: GameState, index: number): ScavengePointResult | null {
  const event = state.scavengeEvent;
  if (!event) return null;
  const cell = event.board[index];
  if (!cell || cell.result) return null;
  cell.result = rollPoint(state, event.zoneId, cell.id);
  return cell.result;
}

/** Resolve ALL points in chain (AUTO runs — no UI). Every roll, log and
 *  grant happens here; the results go straight into the board so the
 *  backend log can narrate them exactly like a real session would. */
export function resolveScavengeAuto(state: GameState, zoneId: number): ScavengePointResult[] {
  const results: ScavengePointResult[] = [];
  const event = state.scavengeEvent;
  if (!event) return results;
  for (let i = 0; i < event.board.length; i++) {
    const result = searchScavengePoint(state, i);
    if (result) results.push(result);
  }
  void zoneId;
  return results;
}

/** Remaining search points (null results) in the active event. */
export function pendingScavengePoints(event: NonNullable<GameState["scavengeEvent"]>): number[] {
  const pending: number[] = [];
  for (let i = 0; i < event.board.length; i++) {
    if (!event.board[i].result) pending.push(i);
  }
  return pending;
}

/** Close the event: settle any unsearched points as "nada" and clear it.
 *  Loot/damage already applied at search time — quitting keeps everything
 *  found so far (per design). Returns the results of the session for the
 *  summary/log. */
export function finishScavenge(state: GameState): ScavengePointResult[] {
  const event = state.scavengeEvent;
  if (!event) return [];
  const results: ScavengePointResult[] = [];
  for (let i = 0; i < event.board.length; i++) {
    const cell = event.board[i];
    if (cell.result) {
      results.push(cell.result);
    } else {
      const result: ScavengePointResult = { kind: "nada", text: "Sin revisar." };
      cell.result = result;
      results.push(result);
    }
  }
  state.scavengeEvent = null;
  return results;
}

/** Boot-time restore: a persisted scavenge session would re-open the
 *  modal as a blocker before the player reaches /juego. Resolve it here
 *  instead — searched points keep their already-applied loot/damage,
 *  unsearched ones settle as "nada" — and narrate the closure in the log. */
export function settleScavengeOnBoot(state: GameState): void {
  const event = state.scavengeEvent;
  if (!event) return;
  const loc = scavengeLocationForZone(event.zoneId);
  const results = finishScavenge(state);
  const lootLines = results.filter((r) => r.kind === "loot" && r.loot);
  const damage = results.reduce((acc, r) => acc + (r.kind === "dano" ? r.damage ?? 0 : 0), 0);
  pushLog(
    state,
    `EVENTO | SCAVENGE cerrado al reabrir · ${loc.name} · hallazgos: ${lootLines.length}, daño: ${damage}`,
    "resource",
    vnow(),
  );
}

/** Re-exported so the modal can build the board UI without importing
 *  the location data through another path. */
export { SCAVENGE_PINS, SCAVENGE_LOCATIONS };
