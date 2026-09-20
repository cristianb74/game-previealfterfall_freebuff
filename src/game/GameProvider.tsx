import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { toast } from "sonner";
import { BALANCE, STAT_RESOURCE, MERCHANT_SELL_PRICES } from "@/game/balance";
import { getZone, frontierZoneId, ZONES } from "@/game/zones";
import { NPC_BY_ID, npcDisplayName } from "@/game/npcData";
import { NPC_TYPE_MODIFIERS, npcProductionMultiplier } from "@/game/npcTypes";
import { createInitialState, loadGame, saveGame, deleteSave } from "@/game/saveSystem";
import {
  setConvexClient,
  pullCloudSave,
  pushCloudSave,
  wipeAllSaves,
} from "@/game/cloudSave";
import { applyOfflineProgress } from "@/game/offlineProgress";
import { tickNpcs } from "@/game/onlineTick";
import { applyEnergyRegen, currentEnergy, spendEnergy, nextEnergyRegenAt } from "@/game/energySystem";
import { explorationMinutesWithAgility } from "@/game/statEffects";
import { rollExploration, npcChanceForCounter, discoverableNpcIds } from "@/game/explorationEngine";
import {
  buildingUpgradeCost,
  buildingUpgradeMinutes,
  BUILDING_BY_KEY,
  EXCLUSIVE_BUILDING_BY_ZONE,
} from "@/game/buildings";
import { SURVIVOR_MAX_ROLLS, generateSurvivorOptions, rollSurvivor } from "@/game/survivorGenerator";
import { RESOURCE_META } from "@/game/resources";
import type {
  BuildingKey,
  ExplorationOutcome,
  ExplorationRun,
  GameState,
  NpcSurvivor,
  ResourceKey,
  Screen,
  Survivor,
} from "@/game/types";

// ============================================================
// AFTERFALL — game provider. Owns the authoritative GameState,
// runs the 1 s tick, autosaves on important changes, applies
// offline progression at boot.
//
// Exploration model:
// - state.exploration: MANUAL run in the player's current zone.
//   Costs 1 energy, full EXP, can unlock the next zone.
// - state.autoRun: BACKGROUND farm in the last conquered zone
//   (frontier − 1). Costs no energy, reduced EXP, never unlocks
//   zones and never discovers NPCs. Runs while autoExplore is on.
// ============================================================

export interface GameContextValue {
  state: GameState | null;
  booted: boolean;
  hasSaveFile: boolean;
  screen: Screen;
  setScreen: (s: Screen) => void;
  setNavigator: (fn: ((path: string) => void) | null) => void;
  startNewGame: (survivor: Survivor) => Promise<void>;
  continueGame: () => Promise<void>;
  eraseSave: () => Promise<void>;
  /** Cloud save status (Convex auth + last sync). */
  cloud: { connected: boolean; syncing: boolean; lastSyncAt: number | null };
  /** Manual full sync: merge with cloud (newest wins) and push local state. */
  syncNow: () => Promise<void>;
  /** Force-restore the cloud save over this device's copy. */
  restoreFromCloud: () => Promise<void>;
  startExploration: (zoneId: number) => void;
  /** Toggle the background auto-exploration farm for a specific zone. */
  toggleAutoExplore: (zoneId: number) => void;
  /** Highest zone id reachable with the player's total EXP. */
  maxUnlockedZoneId: number;
  setCurrentZone: (zoneId: number) => void;
  assignNpc: (npcId: string, zoneId: number | null) => void;
  upgradeBuilding: (zoneId: number, key: BuildingKey) => void;
  /** Upgrade the zone-exclusive building of a host zone. */
  upgradeExclusiveBuilding: (zoneId: number) => void;
  useMedicine: () => void;
  buyResource: (key: ResourceKey) => void;
  sellResource: (key: ResourceKey, qty: number) => void;
  expelNpc: (npcId: string) => void;
  rollOptions: Survivor[];
  rerollSurvivors: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

function pushLog(state: GameState, msg: string, kind: GameState["log"][number]["kind"], t = Date.now()) {
  state.log.unshift({ t, msg, kind });
  if (state.log.length > 60) state.log.length = 60;
}

/** Merchant offers (money sink). Money is earned in-game only. */
const MERCHANT_OFFERS: Partial<Record<ResourceKey, { amount: number; price: number; label: string }>> = {
  materiales: { amount: 1, price: 8, label: "+1 Materiales" },
  medicamentos: { amount: 1, price: 12, label: "+1 Medicamentos" },
  componentes: { amount: 1, price: 16, label: "+1 Componentes" },
  comida: { amount: 30, price: 15, label: "+30 min Comida" },
  agua: { amount: 30, price: 15, label: "+30 min Agua" },
};
export { MERCHANT_OFFERS };

function unlockedZoneId(state: GameState): number {
  let unlocked = 1;
  for (const z of ZONES) {
    if (state.expTotal >= z.unlockExp) unlocked = Math.max(unlocked, z.id);
  }
  return unlocked;
}

function computeZoneUnlocks(state: GameState): number {
  // Highest zone id currently reachable with the player's total EXP.
  return unlockedZoneId(state);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [booted, setBooted] = useState(false);
  const [hasSaveFile, setHasSaveFile] = useState(false);
  const [screen, setScreen] = useState<Screen>("explorar");
  const [rollOptions, setRollOptions] = useState<Survivor[]>(() => [rollSurvivor()]);
  const stateRef = useRef<GameState | null>(null);
  const saveTimer = useRef<number | null>(null);
  const bootOnceRef = useRef(false);
  const navigateRef = useRef<((path: string) => void) | null>(null);
  const wasEnergyZeroRef = useRef(false);

  // ---- cloud sync wiring ----
  const convex = useConvex();
  const { isAuthenticated: cloudConnected } = useConvexAuth();
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const cloudPushTimer = useRef<number | null>(null);
  const lastPushedAt = useRef<number>(0);
  const didInitialPull = useRef(false);

  const setAndSave = useCallback((updater: (s: GameState) => void) => {
    // NOTE: intentionally NOT a React updater function — StrictMode double-invokes
    // updaters, which would apply resource mutations twice. We compute from the ref.
    const cur = stateRef.current;
    if (!cur) return;
    const next = { ...cur } as GameState;
    updater(next);
    stateRef.current = next;
    setState(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveGame(next);
      scheduleCloudPush();
    }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- cloud sync helpers ----
  /** Debounced cloud push after any meaningful local change. */
  const scheduleCloudPush = useCallback(() => {
    if (cloudPushTimer.current) window.clearTimeout(cloudPushTimer.current);
    cloudPushTimer.current = window.setTimeout(() => {
      const s = stateRef.current;
      if (!s || !cloudConnected) return;
      // Skip if nothing changed since the last push.
      if (s.lastTickAt <= lastPushedAt.current) return;
      lastPushedAt.current = s.lastTickAt;
      void pushCloudSave(s).then(() => setLastSyncAt(Date.now()));
    }, 2000);
  }, [cloudConnected]);

  // Hand the Convex client to the cloud-save module + initial pull/merge once signed in.
  useEffect(() => {
    setConvexClient(convex);
  }, [convex]);

  useEffect(() => {
    if (!cloudConnected || didInitialPull.current) return;
    didInitialPull.current = true;
    (async () => {
      setCloudSyncing(true);
      try {
        const result = await pullCloudSave();
        if (result.kind === "restored") {
          // Adopt the cloud state (offline progression is applied by the boot
          // flow on the next mount; here we simply take the newer copy).
          const s = result.state;
          const offline = applyOfflineProgress(s, Date.now());
          const next = offline.state;
          next.lastTickAt = Date.now();
          stateRef.current = next;
          setState(next);
          setHasSaveFile(true);
          toast.success("PROGRESO RESTAURADO", {
            description: "Tu partida se ha sincronizado desde la nube.",
          });
        } else if (result.kind === "pushed") {
          setLastSyncAt(Date.now());
        }
      } finally {
        setCloudSyncing(false);
      }
    })();
  }, [cloudConnected]);

  // Push local state to the cloud as soon as the user signs in (first upload).
  useEffect(() => {
    if (!cloudConnected) return;
    const s = stateRef.current;
    if (!s) return;
    if (lastPushedAt.current === 0) {
      lastPushedAt.current = s.lastTickAt;
      void pushCloudSave(s).then(() => setLastSyncAt(Date.now()));
    }
  }, [cloudConnected]);

  const syncNow = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    if (!cloudConnected) {
      toast.error("Sesión no iniciada", {
        description: "Inicia sesión para guardar tu progreso en la nube.",
      });
      return;
    }
    setCloudSyncing(true);
    try {
      if (cloudPushTimer.current) window.clearTimeout(cloudPushTimer.current);
      await saveGame(s);
      const result = await pullCloudSave();
      if (result.kind === "restored") {
        const next = result.state;
        next.lastTickAt = Date.now();
        stateRef.current = next;
        setState(next);
        toast.success("PROGRESO RESTAURADO", {
          description: "La copia de la nube era más reciente.",
        });
      } else {
        await pushCloudSave(s);
        setLastSyncAt(Date.now());
        toast.success("SINCRONIZADO", { description: "Partida guardada en la nube." });
      }
    } finally {
      setCloudSyncing(false);
    }
  }, [cloudConnected]);

  const restoreFromCloud = useCallback(async () => {
    if (!cloudConnected) {
      toast.error("Sesión no iniciada");
      return;
    }
    setCloudSyncing(true);
    try {
      const result = await pullCloudSave();
      if (result.kind === "restored") {
        const next = result.state;
        next.lastTickAt = Date.now();
        stateRef.current = next;
        setState(next);
        setHasSaveFile(true);
        toast.success("PROGRESO RESTAURADO", {
          description: "Se ha cargado la copia de la nube.",
        });
      } else {
        toast.info("La copia local es la más reciente");
      }
    } finally {
      setCloudSyncing(false);
    }
  }, [cloudConnected]);

  // ---- boot: load save, apply offline progression ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const envelope = await loadGame();
      if (cancelled) return;
      if (envelope?.state) {
        // StrictMode double-boot guard: skip if we already loaded a state.
        if (stateRef.current) {
          setHasSaveFile(true);
          setBooted(true);
          return;
        }
        const result = applyOfflineProgress(envelope.state, Date.now());
        const s = result.state;
        s.lastTickAt = Date.now();
        setState(s);
        stateRef.current = s;
        setHasSaveFile(true);
        if (result.minutesAway >= 1) {
          const mins = Math.floor(result.minutesAway);
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const away = h > 0 ? `${h} h ${m} min` : `${m} min`;
          toast.info("BIENVENIDO DE VUELTA", {
            description: `Estuviste fuera ${away}. ${result.npcFinds.length > 0 ? `Tu equipo produjo ${result.npcFinds.length} hallazgos.` : ""}${result.buildingsCompleted.length > 0 ? ` Construcciones completadas: ${result.buildingsCompleted.length}.` : ""}`,
            duration: 6000,
          });
        }
      } else {
        setHasSaveFile(false);
      }
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cloud-push inside the periodic save path (tab hidden, exploration done).
  useEffect(() => {
    if (!cloudConnected) return;
    const s = stateRef.current;
    if (!s) return;
    if (s.lastTickAt > lastPushedAt.current) {
      lastPushedAt.current = s.lastTickAt;
      void pushCloudSave(s).then(() => setLastSyncAt(Date.now()));
    }
  });

  // ---- 1 s tick ----
  useEffect(() => {
    if (!booted) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      const now = Date.now();
      const energyBefore = Math.floor(s.resources.energia);
      const gained = applyEnergyRegen(s, now);
      const energyAfter = Math.floor(s.resources.energia);
      if (gained >= 1) {
        pushLog(s, `[ENERGÍA] +${gained} regeneración · ${energyBefore}/${BALANCE.maxEnergy} → ${energyAfter}/${BALANCE.maxEnergy}`, "info");
        // Log next cycle start if still below max
        if (energyAfter < BALANCE.maxEnergy) {
          const nextAt = nextEnergyRegenAt(s);
          const remainMs = Math.max(0, nextAt - now);
          const mm = String(Math.floor(remainMs / 60000)).padStart(2, "0");
          const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, "0");
          pushLog(s, `[ENERGÍA] Ciclo iniciado · próxima regeneración ${mm}:${ss}`, "info");
        }
      }
      // Auto-farm pause/resume on energy state transitions
      const isZeroNow = energyAfter <= 0;
      const wasZero = wasEnergyZeroRef.current;
      if (isZeroNow && !wasZero) {
        // Energy just hit 0: pause all active auto-farms
        for (const zid of Object.keys(s.autoExplored).map(Number)) {
          if (s.autoExplored[zid]) {
            pushLog(s, `[AUTO] Z${String(zid).padStart(2, "0")} pausado por falta de Energía`, "info");
          }
        }
      } else if (!isZeroNow && wasZero) {
        // Energy just recovered from 0: resume auto-farms
        for (const zid of Object.keys(s.autoExplored).map(Number)) {
          if (s.autoExplored[zid]) {
            pushLog(s, `[AUTO] Z${String(zid).padStart(2, "0")} reanudado · Energía disponible`, "info");
          }
        }
      }
      wasEnergyZeroRef.current = isZeroNow;
      tickNpcs(s, now);
      s.lastTickAt = now;
      let dirty = false;

      // PER-ZONE exploration completion (each zone independent).
      for (const zid of Object.keys(s.explorationStates).map(Number)) {
        const run = s.explorationStates[zid];
        if (run && now >= run.finishAt) {
          completeExploration(s, zid, run.startedAt);
          dirty = true;
          void saveGame(s);
        }
      }

      // BACKGROUND auto-farm completion (reduced rewards, no unlocks) — per zone.
      for (const zid of Object.keys(s.autoFarms).map(Number)) {
        const run = s.autoFarms[zid];
        if (run && now >= run.finishAt) {
          completeAutoRun(s, zid, run.startedAt);
          dirty = true;
        }
      }

      // Keep the farm chain alive for every zone with auto enabled.
      // But only schedule new runs if energy > 0.
      if (energyAfter > 0) {
        for (const zid of Object.keys(s.autoExplored).map(Number)) {
          if (s.autoExplored[zid] && !s.autoFarms[zid]) {
            scheduleAutoFarm(s, zid);
            dirty = true;
          }
        }
      }

      // BUILDING COMPLETION: check every zone's buildings for finished upgrades.
      for (const zid of Object.keys(s.zones).map(Number)) {
        const zb = s.zones[zid].buildings;
        for (const key of Object.keys(zb) as BuildingKey[]) {
          const b = zb[key];
          if (b.upgradeFinishAt && now >= b.upgradeFinishAt) {
            b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
            b.upgradeFinishAt = null;
            pushLog(s, `Construcción completada: ${BUILDING_BY_KEY[key].name} → N${b.level} (Z${String(zid).padStart(2, "0")})`, "build");
            dirty = true;
          }
        }
        // Exclusive building completion (host zones only).
        const excl = s.zones[zid].exclusiveBuilding;
        if (excl && excl.upgradeFinishAt && now >= excl.upgradeFinishAt) {
          excl.level = Math.min(BALANCE.buildingMaxLevel, excl.level + 1);
          excl.upgradeFinishAt = null;
          const def = EXCLUSIVE_BUILDING_BY_ZONE[zid];
          pushLog(s, `Construcción completada: ${def?.name ?? excl.key} → N${excl.level} (Z${String(zid).padStart(2, "0")})`, "build");
          dirty = true;
        }
      }

      if (dirty) void saveGame(s);
      setState({ ...s });
      // periodic save (every 15 s) to keep timestamps fresh
      if (now % 15000 < 1000) void saveGame(s);
    }, 1000);
    return () => window.clearInterval(id);
  }, [booted]);

  // save on tab hide (mobile backgrounding)
  useEffect(() => {
    const onHide = () => {
      const s = stateRef.current;
      if (s) void saveGame(s);
    };
    const onVis = () => {
      if (document.hidden) onHide();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  function applyOutcome(
    s: GameState,
    outcome: ExplorationOutcome,
    startedAt: number,
    opts: { auto?: boolean; expId?: number } = {},
  ) {
    const zone = getZone(outcome.zoneId);
    const expTag = opts.expId != null ? `[EXP #${opts.expId}] ` : "";
    s.exp += outcome.exp;
    s.expTotal += outcome.exp;
    for (const f of outcome.findings) {
      if (f.kind === "resource" && f.resource) {
        const amount = f.amount ?? 0;
        if (f.resource === "comida") s.foodMin += amount;
        else if (f.resource === "agua") s.waterMin += amount;
        else s.resources[f.resource] += amount;
        const isTime = f.resource === "comida" || f.resource === "agua";
        pushLog(s, `${expTag}RECURSO | ${isTime ? `+${amount} min ${f.resource}` : `+${amount} ${f.resource === "dinero" ? "$" : f.resource}`}`, "resource", startedAt);
      } else if (f.kind === "damage") {
        s.health = Math.max(0, s.health - (f.damage ?? 0));
        pushLog(s, `${expTag}DAÑO | ${f.cause} · -${f.damage} Salud`, "damage", startedAt);
      } else if (f.kind === "event" && f.event) {
        // Manual-only special event: apply its real rewards.
        const ev = f.event;
        if (ev.money) s.resources.dinero += ev.money;
        if (ev.heal) s.health = Math.min(BALANCE.maxHealth, s.health + ev.heal);
        for (const g of ev.grants ?? []) {
          if (g.resource === "comida") s.foodMin += g.amount;
          else if (g.resource === "agua") s.waterMin += g.amount;
          else s.resources[g.resource] += g.amount;
        }
        const parts: string[] = [];
        if (ev.money) parts.push(`+$${ev.money}`);
        if (ev.heal) parts.push(`+${ev.heal} Salud`);
        for (const g of ev.grants ?? []) {
          const isTimeG = g.resource === "comida" || g.resource === "agua";
          parts.push(`+${g.amount}${isTimeG ? " min" : ""} ${g.resource === "dinero" ? "$" : g.resource}`);
        }
        pushLog(s, `${expTag}EVENTO | ${ev.text}${parts.length > 0 ? ` (${parts.join(" · ")})` : ""}`, "exp", startedAt);
      }
    }
    if (outcome.findings.length === 0) {
      pushLog(s, `${expTag}Sin hallazgos`, "info", startedAt);
    }
    pushLog(
      s,
      `${expTag}${opts.auto ? "Auto" : "FIN"} | Z${String(outcome.zoneId).padStart(2, "0")} · ${zone.name} completada · +${outcome.exp} EXP`,
      "exp",
      startedAt,
    );

    // Only MANUAL explorations advance the frontier. Auto farm runs in
    // conquered zones can never unlock anything (zone < frontier anyway).
    if (!opts.auto) {
      const maxUnlocked = computeZoneUnlocks(s);
      if (maxUnlocked > frontierZoneId(s)) {
        s.pendingZoneUnlock = maxUnlocked;
        pushLog(s, `Nueva zona desbloqueada: ${getZone(maxUnlocked).name}`, "zone", startedAt);
        toast.success("☢ NUEVA ZONA DESBLOQUEADA", {
          description: `${getZone(maxUnlocked).name} · la anterior sigue farmeándose sola`,
          duration: 6000,
        });
      }
    }
  }

  function outcomeSummary(outcome: ExplorationOutcome): string {
    const parts: string[] = [`+${outcome.exp} EXP`];
    for (const f of outcome.findings) {
      if (f.kind === "resource") parts.push(`+${f.amount} ${f.resource === "dinero" ? "$" : f.resource}`);
      else if (f.kind === "damage") parts.push(`${f.cause} · -${f.damage} Salud`);
      else if (f.kind === "event" && f.event) parts.push(f.event.text);
    }
    if (outcome.findings.length === 0) parts.push("Sin hallazgos");
    return parts.join(" · ");
  }

  /** Complete the MANUAL exploration: roll, apply (full rewards), log, toast.
   *  NPC discovery uses the counter-based system (one roll per completion). */
  function completeExploration(s: GameState, zoneId: number, startedAt: number) {
    const run = s.explorationStates[zoneId];
    if (!run) return;
    const expId = run.expId ?? s.nextExplorationId++;
    // MANUAL run: full EXP, rare tier, special events, find bonus.
    const outcome = rollExploration(s, zoneId);
    applyOutcome(s, outcome, startedAt, { expId });
    // Single NPC check per exploration completion (counter-based)
    const counter = (s.explorationsSinceLastNPC ?? 0) + 1;
    const chance = npcChanceForCounter(counter);
    const pool = discoverableNpcIds(s);
    let npcFound = false;
    if (pool.length > 0 && Math.random() < chance) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const seed = NPC_BY_ID[pick];
      if (seed) {
        const npc: NpcSurvivor = {
          ...seed,
          assignedZoneId: null,
          discoveredAt: Date.now(),
          productionTotals: { materiales: 0, agua: 0, comida: 0, medicamentos: 0, componentes: 0, energia: 0, dinero: 0 },
        };
        s.npcs.push(npc);
        pushLog(s, `[EXP #${expId}] NPC OBTENIDO | ${npc.id} · ${npc.name} · ${NPC_TYPE_MODIFIERS[npc.type].label}`, "npc", startedAt);
        pushLog(s, `[NPC] contador reiniciado a 0`, "info", Date.now());
        s.explorationsSinceLastNPC = 0;
        npcFound = true;
        toast.info("SUPERVIVIENTE ENCONTRADO", {
          description: `${npc.name} «${npc.alias}» · ${NPC_TYPE_MODIFIERS[npc.type].label}`,
          duration: 6000,
        });
      }
    }
    if (!npcFound) {
      s.explorationsSinceLastNPC = counter;
      pushLog(s, `[EXP #${expId}] NPC CHECK | contador ${counter} | probabilidad ${Math.round(chance * 100)}% | resultado NO`, "info", startedAt);
    }
    s.explorationsDone += 1;
    s.manualExplorationsDone += 1;
    delete s.explorationStates[zoneId];
    toast.success("EXPLORACIÓN COMPLETADA", {
      description: outcomeSummary(outcome),
      duration: 5000,
    });
  }

  /** Complete one BACKGROUND auto-farm run for a specific zone: reduced EXP,
   *  no NPC discovery, no frontier changes. Chain continues via tick. */
  function completeAutoRun(s: GameState, zoneId: number, startedAt: number) {
    if (!s.autoFarms[zoneId]) return;
    const expId = s.nextExplorationId++;
    // AUTO run: reduced EXP, no rare tier, no special events, no find bonus.
    const outcome = rollExploration(s, zoneId, { auto: true });
    outcome.exp = Math.max(1, Math.round(outcome.exp * BALANCE.autoExploreExpFactor));
    applyOutcome(s, outcome, startedAt, { auto: true, expId });
    s.explorationsDone += 1;
    s.autoFarms[zoneId] = null;
  }

  /** Start the next auto-farm run for a specific zone (must be unlocked). */
  function scheduleAutoFarm(s: GameState, zoneId: number) {
    const now = Date.now();
    const maxUnlocked = computeZoneUnlocks(s);
    if (zoneId < 1 || zoneId > maxUnlocked) return;
    if (s.autoFarms[zoneId]) return;
    // The manual run owns its zone; the farm retries on a later tick.
    if (s.explorationStates[zoneId]) return;
    if (s.health <= 0) return;
    // Agilidad reduces exploration duration (statEffects module).
    const minutes = explorationMinutesWithAgility(getZone(zoneId).explorationMinutes, s.survivor.stats.agilidad);
    s.autoFarms[zoneId] = { zoneId, startedAt: now, finishAt: now + minutes * 60000 };
  }

  // ---- actions ----

  const startNewGame = useCallback(
    async (survivor: Survivor) => {
      const now = Date.now();
      bootOnceRef.current = true;
      const s = createInitialState(survivor, now);
      // starting package: 2 distinct types from Comida/Agua/Materiales/Medicamentos
      const pool: ResourceKey[] = ["comida", "agua", "materiales", "medicamentos"];
      const shuffled = pool.sort(() => Math.random() - 0.5);
      const picks = shuffled.slice(0, BALANCE.startingPackage.count);
      for (const p of picks) {
        const amount =
          BALANCE.startingPackage.min +
          Math.floor(Math.random() * (BALANCE.startingPackage.max - BALANCE.startingPackage.min + 1));
        if (p === "comida") s.foodMin += amount * 60;
        else if (p === "agua") s.waterMin += amount * 60;
        else s.resources[p] += amount;
      }
      s.explorationsSinceLastNPC = 0;
      pushLog(s, "Comienza tu supervivencia", "info", now);
      setState(s);
      stateRef.current = s;
      setHasSaveFile(true);
      setScreen("explorar");
      await saveGame(s);
    },
    [],
  );

  const continueGame = useCallback(async () => {
    const envelope = await loadGame();
    if (envelope?.state) {
      bootOnceRef.current = true;
      const result = applyOfflineProgress(envelope.state, Date.now());
      const s = result.state;
      s.lastTickAt = Date.now();
      setState(s);
      stateRef.current = s;
      setHasSaveFile(true);
      setScreen("explorar");
      navigateRef.current?.("/juego");
    }
  }, []);

  const eraseSave = useCallback(async () => {
    await wipeAllSaves();
    setHasSaveFile(false);
    setState(null);
    stateRef.current = null;
    bootOnceRef.current = false;
    setRollOptions([rollSurvivor()]);
  }, []);

  const rerollSurvivors = useCallback(() => {
    setRollOptions((prev) => (prev.length < SURVIVOR_MAX_ROLLS ? [...prev, rollSurvivor()] : prev));
  }, []);

  const startExploration = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const now = Date.now();
        // Per-zone: only prevent if THIS zone is already exploring
        if (s.explorationStates[zoneId]) return;
        if (currentEnergy(s, now) < 1) {
          toast.error("Sin energía", { description: "Espera a que se regenere." });
          return;
        }
        if (s.health <= 0) {
          toast.error("Salud crítica", { description: "Usa medicina antes de explorar." });
          return;
        }
        spendEnergy(s, 1, now);
        // Agilidad reduces exploration duration (statEffects module).
        const minutes = explorationMinutesWithAgility(getZone(zoneId).explorationMinutes, s.survivor.stats.agilidad);
        s.currentZoneId = zoneId;
        const expId = s.nextExplorationId++;
        s.explorationStates[zoneId] = { zoneId, startedAt: now, finishAt: now + minutes * 60000, expId };
        pushLog(s, `[EXP #${expId}] Z${String(zoneId).padStart(2, "0")} | INICIO | duración ${minutes * 60}s`, "info", now);
      });
    },
    [setAndSave],
  );

  /** Turn the background farm on/off. ON starts a run in the last conquered
   *  zone immediately; OFF cancels the running auto run (it costs nothing). */
  const toggleAutoExplore = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const was = s.autoExplored[zoneId] ?? false;
        s.autoExplored[zoneId] = !was;
        const zoneName = getZone(zoneId).name;
        pushLog(s, !was ? `Auto-exploración activada en ${zoneName}` : `Auto-exploración desactivada en ${zoneName}`, "info");
        if (!was) {
          scheduleAutoFarm(s, zoneId);
        } else {
          s.autoFarms[zoneId] = null;
        }
      });
    },
    [setAndSave],
  );

  const setCurrentZone = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const maxUnlocked = computeZoneUnlocks(s);
        if (zoneId <= maxUnlocked && s.currentZoneId !== zoneId) {
          s.currentZoneId = zoneId;
        }
      });
    },
    [setAndSave],
  );

  const assignNpc = useCallback(
    (npcId: string, zoneId: number | null) => {
      setAndSave((s) => {
        const npc = s.npcs.find((n) => n.id === npcId);
        if (!npc) return;
        const npcWasAssigned = npc.assignedZoneId != null;
        if (npc.assignedZoneId) {
          const oldZone = s.zones[Number(npc.assignedZoneId)];
          if (oldZone && oldZone.assignedNpcId === npcId) oldZone.assignedNpcId = null;
        }
        npc.assignedZoneId = zoneId != null ? String(zoneId) : null;
        if (zoneId != null) {
          const z = s.zones[zoneId];
          if (z) {
            if (z.assignedNpcId && z.assignedNpcId !== npcId) {
              const other = s.npcs.find((n) => n.id === z.assignedNpcId);
              if (other) other.assignedZoneId = null;
            }
            z.assignedNpcId = npcId;
            s.npcCycles[npcId] = Date.now();
            pushLog(s, `${npcDisplayName(npc)} asignado a ${getZone(zoneId).name}`, "npc");
          }
        } else if (npcWasAssigned) {
          pushLog(s, `${npcDisplayName(npc)} sin asignación`, "npc");
        }
      });
    },
    [setAndSave],
  );

  const upgradeBuilding = useCallback(
    (zoneId: number, key: BuildingKey) => {
      setAndSave((s) => {
        const z = s.zones[zoneId];
        if (!z) return;
        const b = z.buildings[key];
        if (!b || b.level >= BALANCE.buildingMaxLevel || b.upgradeFinishAt) return;
        const cost = buildingUpgradeCost(b.level);
        if (s.resources.materiales < cost.materiales || s.resources.componentes < cost.componentes) {
          toast.error("Recursos insuficientes", {
            description: `${cost.materiales} Materiales · ${cost.componentes} Componentes`,
          });
          return;
        }
        s.resources.materiales -= cost.materiales;
        s.resources.componentes -= cost.componentes;
        const minutes = buildingUpgradeMinutes(b.level);
        b.upgradeFinishAt = Date.now() + minutes * 60000;
        pushLog(s, `Mejora iniciada: ${BUILDING_BY_KEY[key].name} N${b.level + 1}`, "build");
      });
    },
    [setAndSave],
  );

  /** Upgrade the exclusive building of a host zone (same costs/times). */
  const upgradeExclusiveBuilding = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const z = s.zones[zoneId];
        if (!z) return;
        const excl = z.exclusiveBuilding;
        if (!excl || excl.level >= BALANCE.buildingMaxLevel || excl.upgradeFinishAt) return;
        const cost = buildingUpgradeCost(excl.level);
        if (s.resources.materiales < cost.materiales || s.resources.componentes < cost.componentes) {
          toast.error("Recursos insuficientes", {
            description: `${cost.materiales} Materiales · ${cost.componentes} Componentes`,
          });
          return;
        }
        s.resources.materiales -= cost.materiales;
        s.resources.componentes -= cost.componentes;
        const minutes = buildingUpgradeMinutes(excl.level);
        excl.upgradeFinishAt = Date.now() + minutes * 60000;
        const def = EXCLUSIVE_BUILDING_BY_ZONE[zoneId];
        pushLog(s, `Mejora iniciada: ${def?.name ?? excl.key} N${excl.level + 1}`, "build");
      });
    },
    [setAndSave],
  );

  const useMedicine = useCallback(() => {
    setAndSave((s) => {
      if (s.resources.medicamentos <= 0) {
        toast.error("Sin medicamentos");
        return;
      }
      if (s.health >= BALANCE.maxHealth) {
        toast.info("Salud completa");
        return;
      }
      s.resources.medicamentos -= 1;
      s.health = Math.min(BALANCE.maxHealth, s.health + BALANCE.medicineHealthPerUnit);
      pushLog(s, "Medicina usada · +1 Salud", "info");
    });
  }, [setAndSave]);

  const buyResource = useCallback(
    (key: ResourceKey) => {
      setAndSave((s) => {
        const offer = MERCHANT_OFFERS[key];
        if (!offer) return;
        if (s.resources.dinero < offer.price) {
          toast.error("Dinero insuficiente", { description: `Cuesta $${offer.price}` });
          return;
        }
        s.resources.dinero -= offer.price;
        if (key === "comida") s.foodMin += offer.amount;
        else if (key === "agua") s.waterMin += offer.amount;
        else s.resources[key] += offer.amount;
        pushLog(s, `Mercader: +${offer.amount}${key === "comida" || key === "agua" ? " min" : ""} ${key} · -$${offer.price}`, "resource");
      });
    },
    [setAndSave],
  );

  const sellResource = useCallback(
    (key: ResourceKey, qty: number) => {
      setAndSave((s) => {
        const offer = MERCHANT_SELL_PRICES[key];
        if (!offer) return;
        const sellAmount = offer.amount * qty;
        const totalMoney = offer.price * qty;
        if (key === "comida") {
          if (s.foodMin < sellAmount) {
            toast.error("Comida insuficiente", { description: `Necesitas ${sellAmount} min de comida` });
            return;
          }
          s.foodMin -= sellAmount;
        } else if (key === "agua") {
          if (s.waterMin < sellAmount) {
            toast.error("Agua insuficiente", { description: `Necesitas ${sellAmount} min de agua` });
            return;
          }
          s.waterMin -= sellAmount;
        } else {
          if (s.resources[key] < sellAmount) {
            toast.error(`${RESOURCE_META[key].label} insuficiente`, { description: `Necesitas ${sellAmount}` });
            return;
          }
          s.resources[key] -= sellAmount;
        }
        s.resources.dinero += totalMoney;
        pushLog(s, `[MERCADER] Venta · -${sellAmount} ${key === "comida" || key === "agua" ? `min ${key}` : key} · +$${totalMoney}`, "resource");
        toast.success(`Venta realizada`, { description: `+ $${totalMoney}` });
      });
    },
    [setAndSave],
  );

  const expelNpc = useCallback(
    (npcId: string) => {
      setAndSave((s) => {
        const npcIdx = s.npcs.findIndex((n) => n.id === npcId);
        if (npcIdx === -1) return;
        const npc = s.npcs[npcIdx];
        // Unassign from zone first
        if (npc.assignedZoneId) {
          const z = s.zones[Number(npc.assignedZoneId)];
          if (z && z.assignedNpcId === npcId) z.assignedNpcId = null;
        }
        s.npcs.splice(npcIdx, 1);
        delete s.npcCycles[npcId];
        pushLog(s, `[NPC] ${npc.id} · ${npc.name} expulsada del refugio`, "npc");
        toast.info(`${npc.name} expulsada`, { description: "El superviviente ha sido eliminado del refugio." });
      });
    },
    [setAndSave],
  );

  /** Lets Landing navigate to /juego right after starting a new game. */
  const setNavigator = useCallback((fn: ((path: string) => void) | null) => {
    navigateRef.current = fn;
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      booted,
      hasSaveFile,
      screen,
      setScreen,
      setNavigator,
      startNewGame,
      continueGame,
      eraseSave,
      cloud: { connected: cloudConnected, syncing: cloudSyncing, lastSyncAt },
      syncNow,
      restoreFromCloud,
      startExploration,
      toggleAutoExplore,
      maxUnlockedZoneId: state ? computeZoneUnlocks(state) : 1,
      setCurrentZone,
      assignNpc,
      upgradeBuilding,
      upgradeExclusiveBuilding,
      useMedicine,
      buyResource,
      sellResource,
      expelNpc,
      rollOptions,
      rerollSurvivors,
    }),
    [state, booted, hasSaveFile, screen, setNavigator, startNewGame, continueGame, eraseSave, cloudConnected, cloudSyncing, lastSyncAt, syncNow, restoreFromCloud, startExploration, toggleAutoExplore, setCurrentZone, assignNpc, upgradeBuilding, upgradeExclusiveBuilding, useMedicine, buyResource, sellResource, expelNpc, rollOptions, rerollSurvivors],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// Re-export helpers used by UI
export { STAT_RESOURCE, npcProductionMultiplier, SURVIVOR_MAX_ROLLS, rollSurvivor };
