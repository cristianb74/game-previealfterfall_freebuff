import { BALANCE } from "./balance";
import { rollNpcCycle } from "./npcTypes";
import { getZone } from "./zones";
import { npcDisplayName } from "./npcData";
import { applySurvivalDrain, hungerTier, thirstTier, TIER_META } from "./survivalSystem";
import { BUILDING_BY_KEY, THEMATIC_BY_KEY } from "./buildings";
import type { BuildingKey } from "./types";
import { narrNpcFind, narrSurvivalWarn } from "./narrativeLog";
import type { GameState, LogEvent, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — foreground tick. NPC production is computed from
// elapsed time in ONE pass (no interval per NPC). Called ~1/s.
// ============================================================

export interface TickChanges {
  finds: { npcId: string; resource: ResourceKey; amount: number }[];
  buildingsCompleted: string[];
  energyGained: number;
}

function pushLog(log: LogEvent[], ev: LogEvent): void {
  log.unshift(ev);
  if (log.length > 60) log.length = 60;
}

/** Settle building upgrades whose finish timestamps have passed: the
 *  GLOBAL base (core) and every zone's THEMATIC buildings. */
export function settleBuildings(state: GameState, now: number, completed: string[]): void {
  for (const key of Object.keys(state.base ?? {}) as BuildingKey[]) {
    const b = state.base?.[key];
    if (b && b.upgradeFinishAt && now >= b.upgradeFinishAt) {
      b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
      completed.push(`${BUILDING_BY_KEY[key].name} N${b.level}`);
      b.upgradeFinishAt = null;
    }
  }
  for (const zoneIdKey of Object.keys(state.zones)) {
    const z = state.zones[Number(zoneIdKey)];
    for (const key of Object.keys(z.thematic ?? {})) {
      const b = z.thematic[key];
      if (b && b.upgradeFinishAt && now >= b.upgradeFinishAt) {
        b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
        const def = THEMATIC_BY_KEY[key];
        completed.push(`${def?.name ?? key} N${b.level} (Zona ${zoneIdKey})`);
        b.upgradeFinishAt = null;
      }
    }
  }
}

// Module-level tier cache so we only log on transitions, not every tick.
let lastHungerTier: import("./survivalSystem").SurvivalTier | null = null;
let lastThirstTier: import("./survivalSystem").SurvivalTier | null = null;

/**
 * Advance NPC production + consumption from `state.lastTickAt` to `now`.
 * Mutates state and returns what happened (for logs/toasts).
 */
export function tickNpcs(state: GameState, now: number): TickChanges {
  const finds: TickChanges["finds"] = [];
  const buildingsCompleted: string[] = [];
  const dtMs = Math.max(0, now - state.lastTickAt);

  // survival consumption for the player (and NPCs at 25 % factor)
  const hours = dtMs / 3600000;
  if (hours > 0) {
    state.foodMin = Math.max(0, state.foodMin - BALANCE.survivorUpkeepPerHour * hours);
    state.waterMin = Math.max(0, state.waterMin - BALANCE.survivorUpkeepPerHour * hours);
    const npcHours = hours * BALANCE.npcConsumptionFactor;
    if (state.npcs.length > 0) {
      state.foodMin = Math.max(0, state.foodMin - BALANCE.survivorUpkeepPerHour * npcHours * state.npcs.length);
      state.waterMin = Math.max(0, state.waterMin - BALANCE.survivorUpkeepPerHour * npcHours * state.npcs.length);
    }
    // Progressive health drain from hunger/thirst tiers (0 when OK).
    applySurvivalDrain(state, hours);
  }

  const canProduce =
    state.foodMin > BALANCE.npcMinimumFoodWaterMin &&
    state.waterMin > BALANCE.npcMinimumFoodWaterMin;

  for (const npc of state.npcs) {
    if (!npc.assignedZoneId) continue;
    const zoneState = state.zones[Number(npc.assignedZoneId)];
    if (!zoneState) continue;

    // Passive EXP trickle: a full zone.npcExpReward takes ~12 h of work.
    const zone = getZone(Number(npc.assignedZoneId));
    state.exp += (zone.npcExpReward / 43200) * (dtMs / 1000);
    state.expTotal += (zone.npcExpReward / 43200) * (dtMs / 1000);

    if (!canProduce) continue;

    const cycleSec = BALANCE.npcCycleSeconds[npc.type];
    const lastAt = state.npcCycles[npc.id] ?? state.lastTickAt;
    let elapsedSec = (now - lastAt) / 1000;
    let cycles = Math.floor(elapsedSec / cycleSec);
    if (cycles <= 0) continue;
    cycles = Math.min(cycles, 120); // safety cap per tick

    for (let c = 0; c < cycles; c++) {
      const find = rollNpcCycle(npc, state, Math.random);
      if (find) {
        if (find.resource === "comida") state.foodMin += find.amount;
        else if (find.resource === "agua") state.waterMin += find.amount;
        else if (find.resource === "dinero") state.resources.dinero += find.amount;
        else state.resources[find.resource] += find.amount;
        npc.productionTotals[find.resource] += find.amount;
        finds.push({ npcId: npc.id, resource: find.resource, amount: find.amount });
      }
    }
    state.npcCycles[npc.id] = now - ((elapsedSec % cycleSec) * 1000);
  }

  settleBuildings(state, now, buildingsCompleted);

  // logs
  // Log tier transitions (hunger/thirst) so the player notices degradation.
  // First pass only seeds the cache (no log on boot).
  const hTier = hungerTier(state);
  const tTier = thirstTier(state);
  if (lastHungerTier !== null && hTier !== lastHungerTier) {
    pushLog(state.log, { t: now, msg: `[SUPERVIVENCIA] Comida: ${TIER_META[hTier].label}`, kind: hTier === "ok" ? "info" : "damage" });
    if (hTier !== "ok") narrSurvivalWarn(state, "comida");
  }
  if (lastThirstTier !== null && tTier !== lastThirstTier) {
    pushLog(state.log, { t: now, msg: `[SUPERVIVENCIA] Agua: ${TIER_META[tTier].label}`, kind: tTier === "ok" ? "info" : "damage" });
    if (tTier !== "ok") narrSurvivalWarn(state, "agua");
  }
  lastHungerTier = hTier;
  lastThirstTier = tTier;
  for (const f of finds.slice(0, 5)) {
    const isTime = f.resource === "comida" || f.resource === "agua";
    const npc = state.npcs.find((n) => n.id === f.npcId);
    pushLog(state.log, {
      t: now,
      msg: `${npc ? npcDisplayName(npc) : f.npcId} encontró ${isTime ? `+${f.amount} min` : `+${f.amount}`} ${f.resource === "dinero" ? "$" : f.resource}`,
      kind: "npc",
    });
    if (npc) narrNpcFind(state, npc.name, f.resource, f.amount);
  }
  for (const b of buildingsCompleted) {
    pushLog(state.log, { t: now, msg: `Construcción completada: ${b}`, kind: "build" });
  }

  return { finds, buildingsCompleted, energyGained: 0 };
}
