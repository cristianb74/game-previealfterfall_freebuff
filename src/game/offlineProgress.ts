import { BALANCE, autoFarmConcurrentFactorFor, farmExpForZone, teamFoodUpkeepPerHour, teamWaterUpkeepPerHour } from "./balance";
import { settleConsumption } from "./npcConsumption";
import { getZone, frontierZoneId, ZONES, nextZoneExpRequirement } from "./zones";
import { rollNpcCycle, npcZoneSpeedFactor } from "./npcTypes";
import { applyEnergyRegen } from "./energySystem";
import { npcDisplayName } from "./npcData";
import { explorationMinutesWithAgility } from "./statEffects";
import { explorationDurationFactor, agilityFactor } from "./crafting/craftedEffects";
import { applySurvivalDrain } from "./survivalSystem";
import {
  buffRemainingMs,
  consumptionFactor,
  pruneBuffs,
} from "./crafting/craftedEffects";
import { BUILDING_BY_KEY, THEMATIC_BY_KEY } from "./buildings";
import { RESOURCE_META } from "./resources";
import { pushLog } from "./log";
import type { BuildingKey, GameState, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — offline progression.
// Everything derives from absolute timestamps so closing the app
// never stops production.
//
// OFFLINE CAP (BALANCE.offlineCapHours = 8 h): consumption, auto-farm
// EXP and survival drain settle as if the player returned at
// lastTickAt + 8 h. Energy regen intentionally keeps running over the
// real elapsed time (player-friendly, still clamped to maxEnergy).
// NPC production keeps its own tighter cap (4 h).
// ============================================================

export interface OfflineResourceDelta {
  resource: ResourceKey;
  /** Units, or minutes for Comida/Agua. */
  amount: number;
}

export interface OfflineSummary {
  minutesAway: number;
  /** Minutes actually credited (≤ minutesAway when capped). */
  minutesCredited: boolean;
  capped: boolean;
  /** Exploration EXP earned offline (manual frontier completions are
   *  re-rolled by the tick on boot — only farm EXP is pre-credited). */
  expEarned: number;
  explorationsCompleted: number;
  energyGained: number;
  buildingsCompleted: string[];
  /** Net resource deltas (finds − consumption) for the summary modal. */
  resourceDeltas: OfflineResourceDelta[];
  foodSpent: number;
  waterSpent: number;
  /** Health lost to hunger/thirst tiers while away. */
  healthLost: number;
  hungerStruck: boolean;
  thirstStruck: boolean;
  npcFindsCount: number;
}

export interface OfflineResult {
  state: GameState;
  minutesAway: number;
  summary: OfflineSummary;
}

/** NPC production find (internal accumulation). */
interface NpcFind {
  npcId: string;
  resource: ResourceKey;
  amount: number;
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

/** Snapshot the meters we need to compute net deltas. */
interface Snapshot {
  resources: Record<ResourceKey, number>;
  foodMin: number;
  waterMin: number;
  health: number;
  expTotal: number;
}

export function applyOfflineProgress(state: GameState, now = Date.now()): OfflineResult {
  const last = state.lastTickAt || now;
  const rawMinutes = Math.max(0, (now - last) / 60000);
  const capMin = BALANCE.offlineCapHours * 60;
  const capped = rawMinutes > capMin;
  // The "effective return": everything except energy regen settles here.
  const settleMs = last + Math.min(rawMinutes, capMin) * 60000;
  const minutesAway = rawMinutes;

  // Snapshot before settling (for the summary deltas).
  const before: Snapshot = {
    resources: { ...state.resources },
    foodMin: state.foodMin,
    waterMin: state.waterMin,
    health: state.health,
    expTotal: state.expTotal,
  };

  // Timed buffs (Kit de provisiones) prune against the return time: the
  // buff keeps protecting consumption until it expires, even offline.
  pruneBuffs(state, now);

  const npcFinds: NpcFind[] = [];
  const buildingsCompleted: string[] = [];
  let explorationsCompleted = 0;
  let healthLost = 0;

  const summary: OfflineSummary = {
    minutesAway,
    minutesCredited: false,
    capped,
    expEarned: 0,
    explorationsCompleted: 0,
    energyGained: 0,
    buildingsCompleted: [],
    resourceDeltas: [],
    foodSpent: 0,
    waterSpent: 0,
    healthLost: 0,
    hungerStruck: false,
    thirstStruck: false,
    npcFindsCount: 0,
  };

  if (minutesAway < 0.01) {
    summary.minutesCredited = false;
    return { state, minutesAway: 0, summary };
  }

  const rnd = mulberry32(Math.floor(last / 1000) ^ 0x9e3779b9);

  // ---- Energy regeneration (discrete +1 blocks, up to max) ----
  // Player-friendly: computed over the REAL elapsed time, not the cap.
  const energyRegen = applyEnergyRegen(state, now);
  summary.energyGained = energyRegen;
  if (energyRegen >= 1) {
    const hoursAway = Math.floor(minutesAway / 60);
    const minsAway = Math.floor(minutesAway % 60);
    const timeLabel = hoursAway > 0 ? `${hoursAway} horas${minsAway > 0 ? ` ${minsAway} min` : ""}` : `${minsAway} minutos`;
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "ENERGÍA",
      subtype: "regeneración",
      fields: { recovery: timeLabel, gained: energyRegen },
      mensaje: `[ENERGÍA] Recuperación offline · ${timeLabel} · +${energyRegen}`,
    });
  }

  // ---- Per-zone exploration completion while away (at settle time) ----
  // NOTE: runs are NOT cleared here — the GameProvider tick completes them
  // right after boot so the player receives the full EXP/resource rewards.
  for (const zid of Object.keys(state.explorationStates ?? {}).map(Number)) {
    const run = state.explorationStates[zid];
    if (run && settleMs >= run.finishAt) {
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
  // while away (at settle time). Pending runs are completed by the tick.
  // The concurrent-zone diminishing-returns factor is applied identically
  // to the online tick (both paths share autoFarmConcurrentFactorFor).
  for (const zid of Object.keys(state.autoExplored ?? {}).map(Number)) {
    if (!state.autoExplored[zid]) continue;
    const run = state.autoFarms?.[zid];
    if (run && settleMs >= run.finishAt) {
      // Agilidad + passive NPC benefit apply to offline auto-farm cycles too.
      // ASIGNACIONES: linterna/botas per zone apply identically to offline.
      const cycleMin =
        explorationMinutesWithAgility(getZone(zid).explorationMinutes, state.survivor.stats.agilidad) *
        explorationDurationFactor(state, zid) *
        agilityFactor(state, zid) *
        npcZoneSpeedFactor(state, zid);
      const settleMin = Math.min(rawMinutes, capMin);
      const cycles = Math.max(0, Math.floor(settleMin / cycleMin) - 1);
      // REBALANCEO v3: el valor del ciclo ya NO sale de playerExpReward ×
      // autoExploreExpFactor (escalaba mal en zonas lentas) — sale de la
      // curva dedicada farmExpForZone (balance.ts · offlineFarming), que
      // sigue a expZona para que 8 h ≈ 3–5 % de la siguiente zona.
      const farmExp = farmExpForZone(zid) * autoFarmConcurrentFactorFor(state, zid);
      state.exp += farmExp * cycles;
      state.expTotal += farmExp * cycles;
      summary.expEarned += farmExp * cycles;
      explorationsCompleted = Math.max(explorationsCompleted, 1);
    }
  }

  // ---- Building completions while away ----
  // GLOBAL base (core buildings).
  for (const key of Object.keys(state.base ?? {}) as BuildingKey[]) {
    const b = state.base?.[key];
    if (b && b.upgradeFinishAt && settleMs >= b.upgradeFinishAt) {
      b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
      buildingsCompleted.push(`${BUILDING_BY_KEY[key].name} N${b.level}`);
      b.upgradeFinishAt = null;
    }
  }
  // Per-zone THEMATIC buildings.
  for (const zoneIdKey of Object.keys(state.zones)) {
    const z = state.zones[Number(zoneIdKey)];
    for (const key of Object.keys(z.thematic ?? {})) {
      const b = z.thematic[key];
      if (b && b.upgradeFinishAt && settleMs >= b.upgradeFinishAt) {
        b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
        const def = THEMATIC_BY_KEY[key];
        buildingsCompleted.push(`${def?.name ?? key} N${b.level}`);
        b.upgradeFinishAt = null;
      }
    }
  }

  // ---- NPC offline production (capped at 4 h, settled at settle time) ----
  const settleMinutes = Math.min(rawMinutes, capMin);
  const minutesForNpc = Math.min(settleMinutes, BALANCE.offlineNpcCapHours * 60);
  const secondsForNpc = minutesForNpc * 60;
  const alive = state.npcs.length > 0;
  const canConsume = state.foodMin > BALANCE.npcMinimumFoodWaterMin && state.waterMin > BALANCE.npcMinimumFoodWaterMin;

  if (alive && secondsForNpc >= 5) {
    const assigned = state.npcs.filter((n) => n.assignedZoneId && (n.status ?? "active") === "active");
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
          // NPC-assigned items (prismáticos/botas/mochila superviviente)
          // apply INSIDE rollNpcCycle for this specific NPC at `now`.
          const find = rollNpcCycle(npc, state, rnd, now);
          if (find) {
            const amount = find.amount;
            if (find.resource === "comida") state.foodMin += amount;
            else if (find.resource === "agua") state.waterMin += amount;
            else if (find.resource === "dinero") state.resources.dinero += amount;
            else state.resources[find.resource] += amount;
            npc.productionTotals[find.resource] += amount;
            npcFinds.push({ npcId: npc.id, resource: find.resource, amount });
          }
        }
        state.npcCycles[npc.id] = now;
      }
    }
    // NPC survival consumption (NPC_CONSUMPTION_FACTOR of the player
    // rates, per NPC with its own consumptionMultiplier), applied to every
    // RECLUTADO NPC whether producing or not. The provision buff only
    // protects the minutes before it expires (prorated) — same math as
    // before, but now through the shared settleConsumption ledger
    // (lastConsumptionAt + tope de 24 hs del jugador fuera de la ventana).
    const hours = secondsForNpc / 3600;
    const consumption = consumptionFactor(state, now);
    const buffMs = buffRemainingMs(state, "consumo_comida_agua", now);
    const buffedNpcHours = Math.min(hours, buffMs / 60000 / 60);
    const rawTeamFoodH = teamFoodUpkeepPerHour(state.npcs);
    const rawTeamWaterH = teamWaterUpkeepPerHour(state.npcs);
    settleConsumption(state, now, {
      playerFoodPerHour: 0,
      playerWaterPerHour: 0,
      teamFoodPerHour:
        rawTeamFoodH * (consumption * (buffedNpcHours / hours) + (hours - buffedNpcHours) / hours),
      teamWaterPerHour:
        rawTeamWaterH * (consumption * (buffedNpcHours / hours) + (hours - buffedNpcHours) / hours),
      maxChargeMs: secondsForNpc * 1000,
      ledgerTo: now,
    });
    // Progressive hunger/thirst health drain while away (tier-based).
    healthLost += applySurvivalDrain(state, hours);
  }

  // ---- Player survival consumption while away (at settle time) ----
  // Kit de provisiones: the buff continues offline until it expires — only
  // the minutes covered by the buff get the reduced rate, the rest is full.
  const hoursAway = settleMinutes / 60;
  const playerConsumption = consumptionFactor(state, now);
  const buffedHours = Math.min(hoursAway, buffRemainingMs(state, "consumo_comida_agua", now) / 60000 / 60);
  const playerUpkeep =
    BALANCE.survivorUpkeepPerHour * (buffedHours * playerConsumption + (hoursAway - buffedHours));
  state.foodMin = Math.max(0, state.foodMin - playerUpkeep);
  state.waterMin = Math.max(0, state.waterMin - playerUpkeep);
  if (state.foodMin <= 0) summary.hungerStruck = before.foodMin > 0;
  if (state.waterMin <= 0) summary.thirstStruck = before.waterMin > 0;
  // LEDGER de consumo: salta a `now` SIEMPRE al cerrar el settle offline —
  // el excedente fuera de la ventana (cap 8 hs) queda perdonado, exacto
  // a lo que ya hacía el cap (lastTickAt = now al volver). Sin esto, el
  // tick online volvería a cobrar la ventana offline (doble cobro) en
  // los casos donde el bloque NPC no corrió (sin NPC o ausencia < 5 s).
  state.lastConsumptionAt = now;
  // Additional drain for the remaining (uncapped) hours does NOT apply —
  // the cap exists so the player isn't punished for long absences.

  // ---- NPC EXP trickle from offline assigned NPCs ----
  // REBALANCEO v3: el goteo de NPC nunca puede superar el 5 % de la EXP
  // que exige la siguiente zona (el farmeo real es el auto-farm, no esto).
  {
    const trickleCap = BALANCE.offlineNpcTrickleShareOfNextZone * nextZoneExpRequirement(state);
    let trickle = 0;
    for (const npc of state.npcs) {
      if (npc.assignedZoneId) {
        const zone = getZone(Number(npc.assignedZoneId));
        trickle += (zone.npcExpReward / 12) * (minutesForNpc / 60);
      }
    }
    if (trickle > 0) {
      const granted = Math.min(trickle, trickleCap);
      state.exp += granted;
      state.expTotal += granted;
      summary.expEarned += granted;
    }
  }

  // ---- Summary deltas ----
  summary.explorationsCompleted = explorationsCompleted;
  summary.buildingsCompleted = buildingsCompleted;
  summary.npcFindsCount = npcFinds.length;
  summary.healthLost = Math.max(0, before.health - state.health);
  summary.foodSpent = Math.max(0, before.foodMin - state.foodMin);
  summary.waterSpent = Math.max(0, before.waterMin - state.waterMin);
  const deltaKeys: ResourceKey[] = ["materiales", "medicamentos", "componentes", "energia", "dinero"];
  summary.resourceDeltas = deltaKeys
    .map((r) => ({ resource: r, amount: state.resources[r] - before.resources[r] }))
    .filter((d) => Math.abs(d.amount) > 0.01);
  // Comida/Agua net deltas (finds − consumption) as minutes.
  const foodNet = state.foodMin - before.foodMin;
  const waterNet = state.waterMin - before.waterMin;
  if (Math.abs(foodNet) > 0.01) summary.resourceDeltas.push({ resource: "comida", amount: foodNet });
  if (Math.abs(waterNet) > 0.01) summary.resourceDeltas.push({ resource: "agua", amount: waterNet });
  summary.minutesCredited = true;

  // ---- Log ----
  if (explorationsCompleted > 0) {
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "EXP",
      subtype: "fin_offline",
      fields: { exploraciones: explorationsCompleted, desc: "Exploración completada durante tu ausencia" },
      mensaje: "Exploración completada durante tu ausencia",
    });
  }
  const findCount = npcFinds.length;
  if (findCount > 0) {
    for (const f of npcFinds.slice(0, 5)) {
      const npc = state.npcs.find((n) => n.id === f.npcId);
      const isTime = f.resource === "comida" || f.resource === "agua";
      // NPC ya asignado produciendo offline → NPC_ACTION/hallazgo con npc=.
      pushLog(state, {
        zona: npc?.assignedZoneId ?? "global",
        origen: "auto",
        category: "NPC_ACTION",
        subtype: "hallazgo",
        fields: {
          // Campo obligatorio: npc=<id>·<nombre> (hallazgo de NPC asignado).
          npc: `${npc ? npc.id : f.npcId}·${npc?.name ?? f.npcId}`,
          resource: f.resource,
          cantidad: f.amount,
          unidad: isTime ? "min" : "unidad",
          periodo: "offline",
        },
        mensaje: `${npc ? npcDisplayName(npc) : f.npcId} encontró ${isTime ? `+${f.amount} min` : `+${f.amount}`} ${f.resource === "dinero" ? "$" : f.resource}`,
      });
    }
    if (findCount > 5) {
      pushLog(state, {
        zona: "global",
        origen: "auto",
        category: "NPC_ACTION",
        subtype: "hallazgo",
        fields: { npc: "equipo", hallazgos: findCount, truncado: findCount - 5, periodo: "offline" },
        mensaje: `Tu equipo produjo ${findCount} hallazgos mientras no estabas`,
      });
    }
  }
  if (buildingsCompleted.length > 0) {
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "CONSTR",
      subtype: "completada",
      fields: { edificios: buildingsCompleted.join(", ") },
      mensaje: `Construcción completada: ${buildingsCompleted.join(", ")}`,
    });
  }
  if (capped) {
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "ENERGÍA",
      subtype: "regeneración",
      fields: { desc: `Progreso limitado a ${BALANCE.offlineCapHours} h` },
      mensaje: `[OFFLINE] Progreso limitado a ${BALANCE.offlineCapHours} h — el resto del tiempo no se contabilizó`,
    });
  }

  state.lastTickAt = now;
  return { state, minutesAway, summary };
}

/** Format helper shared with the summary modal. */
export function offlineDeltaLabel(d: OfflineResourceDelta): string {
  const isTime = d.resource === "comida" || d.resource === "agua";
  const sign = d.amount >= 0 ? "+" : "−";
  const val = Math.abs(Math.round(d.amount));
  return `${sign}${val}${isTime ? " min" : ""} ${RESOURCE_META[d.resource].label}`;
}
