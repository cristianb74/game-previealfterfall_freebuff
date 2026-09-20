import { BALANCE } from "./balance";
import { getZone, frontierZoneId, ZONES } from "./zones";
import { rollNpcCycle } from "./npcTypes";
import { applyEnergyRegen } from "./energySystem";
import { npcDisplayName } from "./npcData";
import { explorationMinutesWithAgility } from "./statEffects";
import { applySurvivalDrain } from "./survivalSystem";
import type { GameState, LogEvent, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — offline progression.
// Everything derives from absolute timestamps so closing the app
// never stops production. NPC offline production caps at 4 h.
// ============================================================

export interface OfflineResult {
  state: GameState;
  minutesAway: number;
  npcFinds: { npcId: string; resource: ResourceKey; amount: number }[];
  energyRegen: number;
  explorationsCompleted: number;
  buildingsCompleted: string[];
}

/** Deterministic PRNG so offline rolls are stable per save+time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushLog(log: LogEvent[], ev: LogEvent): void {
  log.unshift(ev);
  if (log.length > 60) log.length = 60;
}

export function applyOfflineProgress(state: GameState, now = Date.now()): OfflineResult {
  const last = state.lastTickAt || now;
  const minutesAway = Math.max(0, (now - last) / 60000);
  const npcFinds: OfflineResult["npcFinds"] = [];
  const buildingsCompleted: string[] = [];
  let explorationsCompleted = 0;
  let energyRegen = 0;

  if (minutesAway < 0.01) return { state, minutesAway: 0, npcFinds, energyRegen, explorationsCompleted, buildingsCompleted };

  const rnd = mulberry32(Math.floor(last / 1000) ^ 0x9e3779b9);

  // ---- Energy regeneration (discrete +1 blocks, up to max) ----
  const energyBefore = state.resources.energia;
  energyRegen = applyEnergyRegen(state, now);
  if (energyRegen >= 1) {
    const hoursAway = Math.floor(minutesAway / 60);
    const minsAway = Math.floor(minutesAway % 60);
    const timeLabel = hoursAway > 0 ? `${hoursAway} horas${minsAway > 0 ? ` ${minsAway} min` : ""}` : `${minsAway} minutos`;
    pushLog(state.log, {
      t: now,
      msg: `[ENERGÍA] Recuperación offline · ${timeLabel} · +${energyRegen}`,
      kind: "info",
    });
  }

  // ---- Per-zone exploration completion while away ----
  // NOTE: runs are NOT cleared here — the GameProvider tick completes them
  // right after boot so the player receives the full EXP/resource rewards.
  // Check each zone's exploration independently.
  for (const zid of Object.keys(state.explorationStates ?? {}).map(Number)) {
    const run = state.explorationStates[zid];
    if (run && now >= run.finishAt) {
      explorationsCompleted += 1;
      // A finished MANUAL frontier run may have reached a new zone while away.
      let maxUnlocked = 1;
      for (const z of ZONES) {
        if (state.expTotal >= z.unlockExp) maxUnlocked = Math.max(maxUnlocked, z.id);
      }
      if (maxUnlocked > frontierZoneId(state)) state.pendingZoneUnlock = maxUnlocked;
    }
  }
  // Offline auto-farm cycles per zone: credit reduced EXP for chained runs
  // while away. Pending runs are completed by the tick after boot.
  for (const zid of Object.keys(state.autoExplored ?? {}).map(Number)) {
    if (!state.autoExplored[zid]) continue;
    const run = state.autoFarms?.[zid];
    if (run && now >= run.finishAt) {
      // Agilidad applies to offline auto-farm cycles too.
      const cycleMin = explorationMinutesWithAgility(getZone(zid).explorationMinutes, state.survivor.stats.agilidad);
      const cycles = Math.max(0, Math.floor(minutesAway / cycleMin) - 1);
      const farmExp = Math.max(1, Math.round(getZone(zid).playerExpReward * BALANCE.autoExploreExpFactor));
      state.exp += farmExp * cycles;
      state.expTotal += farmExp * cycles;
      explorationsCompleted = Math.max(explorationsCompleted, 1);
    }
  }

  // ---- Building completions while away ----
  for (const zoneIdKey of Object.keys(state.zones)) {
    const z = state.zones[Number(zoneIdKey)];
    for (const key of Object.keys(z.buildings)) {
      const b = z.buildings[key as keyof typeof z.buildings];
      if (b && b.upgradeFinishAt && now >= b.upgradeFinishAt) {
        b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
        buildingsCompleted.push(`${key} N${b.level}`);
        b.upgradeFinishAt = null;
      }
    }
  }

  // ---- NPC offline production (capped at 4 h) ----
  const minutesForNpc = Math.min(minutesAway, BALANCE.offlineNpcCapHours * 60);
  const secondsForNpc = minutesForNpc * 60;
  const alive = state.npcs.length > 0;
  const canConsume = state.foodMin > BALANCE.npcMinimumFoodWaterMin && state.waterMin > BALANCE.npcMinimumFoodWaterMin;

  if (alive && secondsForNpc >= 5) {
    const assigned = state.npcs.filter((n) => n.assignedZoneId);
    for (const npc of assigned) {
      const zoneId = Number(npc.assignedZoneId);
      const zoneState = state.zones[zoneId];
      if (!zoneState) continue;
      if (canConsume) {
        const lastAt = state.npcCycles[npc.id] ?? last;
        const elapsed = Math.max(0, secondsForNpc - (lastAt - last) / 1000);
        const cycleSec = BALANCE.npcCycleSeconds[npc.type];
        // cap runaway loops
        const cycles = Math.min(Math.floor(elapsed / cycleSec), 1440);
        for (let c = 0; c < cycles; c++) {
          const find = rollNpcCycle(npc, zoneState, rnd);
          if (find) {
            if (find.resource === "comida") state.foodMin += find.amount;
            else if (find.resource === "agua") state.waterMin += find.amount;
            else if (find.resource === "dinero") state.resources.dinero += find.amount;
            else state.resources[find.resource] += find.amount;
            npc.productionTotals[find.resource] += find.amount;
            npcFinds.push({ npcId: npc.id, resource: find.resource, amount: find.amount });
          }
        }
        state.npcCycles[npc.id] = now;
      }
    }
    // NPC survival consumption (25 % factor of survivor upkeep, per hour),
    // applied to every owned NPC whether producing or not.
    const hours = secondsForNpc / 3600;
    const upkeep = BALANCE.survivorUpkeepPerHour * hours * BALANCE.npcConsumptionFactor * state.npcs.length;
    state.foodMin = Math.max(0, state.foodMin - upkeep);
    state.waterMin = Math.max(0, state.waterMin - upkeep);
    // Progressive hunger/thirst health drain while away (tier-based).
    applySurvivalDrain(state, hours);
  }

  // ---- Player survival consumption while away ----
  const hoursAway = minutesAway / 60;
  state.foodMin = Math.max(0, state.foodMin - BALANCE.survivorUpkeepPerHour * hoursAway);
  state.waterMin = Math.max(0, state.waterMin - BALANCE.survivorUpkeepPerHour * hoursAway);

  // ---- NPC EXP trickle from offline assigned NPCs (small, explorations dominate) ----
  for (const npc of state.npcs) {
    if (npc.assignedZoneId) {
      const zone = getZone(Number(npc.assignedZoneId));
      const trickle = (zone.npcExpReward / 12) * (minutesForNpc / 60);
      state.exp += trickle;
      state.expTotal += trickle;
    }
  }

  // ---- Log ----
  if (explorationsCompleted > 0) {
    pushLog(state.log, {
      t: now,
      msg: "Exploración completada durante tu ausencia",
      kind: "exp",
    });
  }
  const findCount = npcFinds.length;
  if (findCount > 0) {
    for (const f of npcFinds.slice(0, 5)) {
      const npc = state.npcs.find((n) => n.id === f.npcId);
      const isTime = f.resource === "comida" || f.resource === "agua";
      pushLog(state.log, {
        t: now,
        msg: `${npc ? npcDisplayName(npc) : f.npcId} encontró ${isTime ? `+${f.amount} min` : `+${f.amount}`} ${f.resource === "dinero" ? "$" : f.resource}`,
        kind: "npc",
      });
    }
    if (findCount > 5) {
      pushLog(state.log, {
        t: now,
        msg: `Tu equipo produjo ${findCount} hallazgos mientras no estabas`,
        kind: "npc",
      });
    }
  }
  if (buildingsCompleted.length > 0) {
    pushLog(state.log, {
      t: now,
      msg: `Construcción completada: ${buildingsCompleted.join(", ")}`,
      kind: "build",
    });
  }

  state.lastTickAt = now;
  return { state, minutesAway, npcFinds, energyRegen, explorationsCompleted, buildingsCompleted };
}
