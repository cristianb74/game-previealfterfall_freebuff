import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { toast } from "sonner";
import { BALANCE, autoFarmConcurrentFactorFor, farmExpForZone, STAT_RESOURCE, MERCHANT_SELL_PRICES, MERCHANT_BATTERY_OFFER } from "@/game/balance";
import { getZone, frontierZoneId, ZONES } from "@/game/zones";
import { NPC_BY_ID, npcDisplayName } from "@/game/npcData";
import { NPC_TYPE_MODIFIERS, npcProductionMultiplier, npcZoneSpeedFactor } from "@/game/npcTypes";
import { createInitialState, loadGame, saveGame, deleteSave, migrateStateToCurrent } from "@/game/saveSystem";
import { legacyUnlockFloorV2 } from "@/game/zones";
import {
  setConvexClient,
  pullCloudSave,
  pushCloudSave,
  wipeAllSaves,
} from "@/game/cloudSave";
import { applyOfflineProgress } from "@/game/offlineProgress";
import type { OfflineSummary } from "@/game/offlineProgress";import { vnow,
  setSpeedMultiplier,
  getSpeedMultiplier,
  tickVirtualClock,
  rebaseToRealTime,
  resetVirtualClock,
  type SpeedMultiplier,
} from "@/game/virtualClock";
import { pushClick, pushLog } from "./log";
import { OfflineSummaryModal } from "@/components/game/OfflineSummaryModal";
import { RECIPE_BY_ID } from "./crafting/recipes";
import {
  canAfford,
  cancelCraft,
  catchUpCrafting,
  resolveFinishedCrafts,
  startCraft,
} from "./crafting/crafting";
import {
  agilityFactor,
  explorationDurationFactor,
  nextAssignmentExpiry,
  pruneExpiredAssignments,
  useCraftedItem as applyCraftedUse,
} from "./crafting/craftedEffects";
import type { CraftedAssignment } from "./types";
import { tickNpcs } from "@/game/onlineTick";
import { applyEnergyRegen, currentEnergy, energyShortfallInfo, gainEnergy, spendEnergy, nextEnergyRegenAt } from "@/game/energySystem";
import { explorationMinutesWithAgility } from "@/game/statEffects";
import {
  narrExplorationStart,
  narrResourceFind,
  narrDamage,
  narrZoneUnlock,
  narrBuildDone,
} from "@/game/narrativeLog";
import { rollExploration, npcChanceForCounter, discoverableNpcIds } from "@/game/explorationEngine";
import {
  checkScavengeTrigger,
  searchScavengePoint,
  resolveScavengeAuto,
  finishScavenge,
  ignoreScavenge,
  settleScavengeOnBoot,
} from "@/game/scavenge";
import { scavengeLocationForZone } from "@/game/scavengeLocations";
import { ScavengeModal } from "@/components/game/ScavengeModal";
import {
  buildingUpgradeCost,
  CORE_BUILDING_GATE_ZONE,
  buildingUpgradeMinutes,
  activeConstructionsInBase,
  activeThematicConstructions,
  BUILDING_BY_KEY,
  THEMATIC_BY_KEY,
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
  /** Dev/QA session speed (x1/x2/x4). Session-only, never persisted. */
  speedMultiplier: SpeedMultiplier;
  setSpeed: (m: SpeedMultiplier) => void;
  /** Cloud save status (Convex auth + last sync). */
  cloud: { connected: boolean; syncing: boolean; lastSyncAt: number | null };
  /** Manual full sync: merge with cloud (newest wins) and push local state. */
  syncNow: () => Promise<void>;
  /** Force-restore the cloud save over this device's copy. */
  restoreFromCloud: () => Promise<void>;
  /** Offline progress summary (shown once per boot in a modal). */
  offlineSummary: OfflineSummary | null;
  /** CRAFTING UI version — bumps when the queue/inventory change through
   *  deferred paths (catch-up timers) so consumers re-render. */
  craftingVersion: number;
  /** FABRICAR: deduct from the REAL resources and enqueue (atomic). */
  craftRecipe: (recipeId: string) => void;
  /** CANCEL a queued item: refund + remove; never disturbs other items' progress. */
  cancelCrafting: (uid: string) => void;
  /** Saved Zonas-list scroll position (list → Instalaciones → back). */
  savedZonasScrollRef: { current: number | null };
  dismissOfflineSummary: () => void;
  startExploration: (zoneId: number) => void;
    /** Search one scavenge point of the ACTIVE event (rolls + applies loot/
   *  damage at once). `index` = board position (0–7). */
  searchScavenge: (index: number) => void;
  /** Close the active scavenge event: settle unsearched points as "nada",
   *  clear the session and log the haul. Loot was already granted at
   *  search time — quitting keeps everything found (per design). */
  finishScavengeEvent: () => void;
  /** IGNORAR el evento: el scavenger se va sin que revises nada — sin botín,
   *  sin daño y sin consumos; queda la línea en el log de actividades. */
  ignoreScavengeEvent: () => void;
  /** Toggle the background auto-exploration farm for a specific zone. */
  toggleAutoExplore: (zoneId: number) => void;
  /** Highest zone id reachable with the player's total EXP. */
  maxUnlockedZoneId: number;
  setCurrentZone: (zoneId: number) => void;
  assignNpc: (npcId: string, zoneId: number | null) => void;
  /** Recruit a candidate NPC into the shelter (pays the recruit cost). */
  recruitNpc: (npcId: string) => void;
  /** Dismiss a found-but-unrecruited survivor: no recruit, no cost. */
  ignoreNpc: (npcId: string) => void;
  /** Mark all current activity of a nav screen as seen (activity badge). */
  markScreenSeen: (screen: Screen) => void;
  /** Upgrade a GLOBAL core building (GameState.base). Shares one base quota. */
  upgradeBaseBuilding: (key: BuildingKey) => void;
  /** Upgrade a zone THEMATIC building (zones[].thematic). Per-zone quota. */
  upgradeThematicBuilding: (zoneId: number, key: string) => void;
  /** Consume medicine to restore health. Without qty: heals to max in one
   *  click (clamped by stock and BALANCE.maxHealth). With qty: uses exactly
   *  that many units (still clamped by stock and missing health). */
  useMedicine: (qty?: number) => void;
  /** Use one crafted CONSUMABLE (botiquín / kit de provisiones): applies
   *  the effect immediately and decrements the crafted inventory by 1. */
  useCraftedItem: (recipeId: string) => void;
  /** ASIGNAR a crafted NON-CONSUMABLE to a zone or NPC: quantity −1 and
   *  the recipe's effect applies ONLY to that target until it expires
   *  (per-recipe duration, no refund). Blocked when the same recipe is
   *  already assigned to the same target. */
  assignCraftedItem: (recipeId: string, targetType: "zone" | "npc", targetId: string) => void;
  /** Cancel an active assignment early: the effect stops NOW — no refund
   *  (the item was already consumed at assignment). */
  cancelCraftedAssignment: (assignmentId: string) => void;
  buyResource: (key: ResourceKey, qty?: number) => void;
  /** Buy a battery (MERCHANT_BATTERY_OFFER): +energy, blocked if it does
   *  not fit fully under maxEnergy (no partial waste). */
  buyBattery: (qty?: number) => void;
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
  // Curva nueva (v3): la EXP total compra zonas según los umbrales nuevos…
  let unlocked = 1;
  for (const z of ZONES) {
    if (state.expTotal >= z.unlockExp) unlocked = Math.max(unlocked, z.id);
  }
  // …pero NADIE pierde zonas ya desbloqueadas: el floor congelado de los
  // umbrales v2 (migración en saveSystem) garantiza el máximo histórico.
  return Math.max(unlocked, state.unlockedZoneFloor ?? legacyUnlockFloorV2(state.expTotal));
}

function computeZoneUnlocks(state: GameState): number {
  // Highest zone id currently reachable with the player's total EXP.
  return unlockedZoneId(state);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [booted, setBooted] = useState(false);
  const [hasSaveFile, setHasSaveFile] = useState(false);
  const [screen, setScreen] = useState<Screen>("zonas");
  const [rollOptions, setRollOptions] = useState<Survivor[]>(() => [rollSurvivor()]);
  /** Offline progress summary shown once per boot in a modal. */
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(null);
  /** Session-only game speed (dev tool). Resets to x1 on every reload. */
  const [speedMultiplier, setSpeedMultiplierState] = useState<SpeedMultiplier>(() => getSpeedMultiplier());
  /** CRAFTING: queue/inventory live in the real GameState (single source of
   *  truth). This counter only forces the UI to re-render when crafting's
   *  deferred save timer fires — queue items are MUTATED in place by the
   *  catch-up helpers (startedAt/endsAt get stamped), so the identity of
   *  state.craftingQueue does not change. */
  const [craftingUiTick, setCraftingUiTick] = useState(0);
  /** CRAFTING: next resolution check timestamp (active item's endsAt). */
  const craftingNextCheckRef = useRef<number | null>(null);
  /** ASIGNACIONES: UI version — bumps when assignments change through
   *  deferred paths (expiry timer) so Mochila/assign UI re-render. */
  const [assignmentsUiTick, setAssignmentsUiTick] = useState(0);
  const bumpAssignmentsUi = useCallback(() => setAssignmentsUiTick((t) => t + 1), []);
  /** Offline summary prepared by boot, shown once the player actually
   *  enters /juego ("Continuar") — never on the welcome/login screen. */
  const pendingOfflineSummaryRef = useRef<OfflineSummary | null>(null);
  /** Saved scroll position of the Zonas list, kept here (not in a screen
   *  component) so it survives ZonasTab/InstalacionesTab unmounts. Saved by
   *  the card's double-tap before entering Instalaciones; restored by
   *  Game's screen-change effect on the explicit "← Volver a Zonas". */
  const savedZonasScrollRef = useRef<number | null>(null);
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
      // Persist the LIVE state normalized to the real timeline: saved
      // timestamps must stay comparable with Date.now() (offline progress,
      // cloud "newest wins") even while x2/x4 is active.
      const live = stateRef.current ?? next;
      rebaseToRealTime(live);
      void saveGame(live);
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
      rebaseToRealTime(s); // push real-timeline timestamps
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
          resetVirtualClock(); // cloud timeline is real time
          const s = migrateStateToCurrent(result.state); // cloud saves may predate current
          const offline = applyOfflineProgress(s, Date.now());
          const next = offline.state;
          next.lastTickAt = Date.now();
          stateRef.current = next;
          setState(next);
          setHasSaveFile(true);
          // Show offline rewards only once the player is actually in the
          // game screen; on the welcome screen defer to continueGame.
          if (offline.summary.minutesAway >= 1) {
            if (window.location.pathname === "/juego") {
              setOfflineSummary(offline.summary);
            } else {
              pendingOfflineSummaryRef.current = offline.summary;
            }
          }
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
    rebaseToRealTime(s);
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
      rebaseToRealTime(s); // save & compare on the real timeline
      await saveGame(s);
      const result = await pullCloudSave();
      if (result.kind === "restored") {
        resetVirtualClock(); // cloud timeline is real time
        const next = migrateStateToCurrent(result.state); // cloud saves may predate current
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
        resetVirtualClock(); // cloud timeline is real time
        const offline = applyOfflineProgress(migrateStateToCurrent(result.state), Date.now());
        const next = offline.state;
        next.lastTickAt = Date.now();
        stateRef.current = next;
        setState(next);
        setHasSaveFile(true);
        if (offline.summary.minutesAway >= 1) {
          if (window.location.pathname === "/juego") {
            setOfflineSummary(offline.summary);
          } else {
            pendingOfflineSummaryRef.current = offline.summary;
          }
        }
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
    resetVirtualClock(); // session clock starts aligned with real time
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
        // A persisted SCAVENGE session restored from the save would mount
        // its modal as a boot blocker: resolve it right here (searched
        // points keep their loot/damage, unsearched settle as "nada") and
        // narrate the closure in the log instead.
        settleScavengeOnBoot(s);
        // CRAFTING catch-up: resolve everything that finished while the app
        // was closed (in order, idempotent) before the first render.
        catchUpCrafting(s);
        // ASIGNACIONES catch-up: drop assignments that expired while away
        // (no refund — items were consumed at assignment time).
        const expiredNames = pruneExpiredAssignments(s, Date.now());
        for (const name of expiredNames) {
          pushLog(s, { zona: String(getZone(s.currentZoneId).id), origen: "auto", category: "NPC_ACTION", subtype: "expirado", fields: { npc: name, motivo: "fecha_de_expiración" }, mensaje: `ASIGNACIÓN expirada | ${name}` });
        }
        setState(s);
        stateRef.current = s;
        setHasSaveFile(true);
        // Offline rewards show ONLY after the player actually enters the
        // game ("Continuar" → /juego). Booting just prepares the session:
        // stash the summary so continueGame/initial cloud pull can show it.
        if (result.summary.minutesAway >= 1) {
          pendingOfflineSummaryRef.current = result.summary;
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
    rebaseToRealTime(s);
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
      // Virtual session clock: accumulate fast-forward (x2/x4) from real
      // elapsed time, then fold the accumulated lead into the state (a
      // uniform, exact shift) so the whole tick — and every save it
      // triggers — runs on the REAL timeline. The tick delta still equals
      // realΔ × multiplier, so the speedup is fully preserved.
      tickVirtualClock();
      rebaseToRealTime(s);
      const now = vnow();
      const energyBefore = Math.floor(s.resources.energia);
      const gained = applyEnergyRegen(s, now);
      const energyAfter = Math.floor(s.resources.energia);
      if (gained >= 1) {
        pushLog(s, {
          zona: String(getZone(s.currentZoneId).id),
          origen: "auto",
          category: "ENERGÍA",
          subtype: "regeneración",
          fields: { gained, energyBefore, energyAfter },
          mensaje: `[ENERGÍA] +${gained} regeneración · ${energyBefore}/${BALANCE.maxEnergy} → ${energyAfter}/${BALANCE.maxEnergy}`,
        });
        // Log next cycle start if still below max
        if (energyAfter < BALANCE.maxEnergy) {
          const nextAt = nextEnergyRegenAt(s);
          const remainMs = Math.max(0, nextAt - now);
          const mm = String(Math.floor(remainMs / 60000)).padStart(2, "0");
          const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, "0");
          pushLog(s, {
            zona: String(getZone(s.currentZoneId).id),
            origen: "auto",
            category: "ENERGÍA",
            subtype: "ciclo_iniciado",
            fields: { próxima: `${mm}:${ss}` },
          });
        }
      }
      // Auto-farm pause/resume on energy state transitions
      const isZeroNow = energyAfter <= 0;
      const wasZero = wasEnergyZeroRef.current;
      if (isZeroNow && !wasZero) {
        // Energy just hit 0: pause all active auto-farms
        for (const zid of Object.keys(s.autoExplored).map(Number)) {
          if (s.autoExplored[zid]) {
            pushLog(s, {
              zona: `Z${String(zid).padStart(2, "0")}`,
              origen: "auto",
              category: "AUTO_EXPLORER",
              subtype: "pausado",
              fields: { motivo: "falta_energía" },
              mensaje: `[AUTO] Z${String(zid).padStart(2, "0")} pausado por falta de Energía`,
            });
          }
        }
      } else if (!isZeroNow && wasZero) {
        // Energy just recovered from 0: resume auto-farms
        for (const zid of Object.keys(s.autoExplored).map(Number)) {
          if (s.autoExplored[zid]) {
            pushLog(s, {
              zona: `Z${String(zid).padStart(2, "0")}`,
              origen: "auto",
              category: "AUTO_EXPLORER",
              subtype: "reanudado",
              fields: { motivo: "energía_disponible" },
              mensaje: `[AUTO] Z${String(zid).padStart(2, "0")} reanudado · Energía disponible`,
            });
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

      // BUILDING COMPLETION: global base first, then per-zone thematic.
      for (const key of Object.keys(s.base ?? {}) as BuildingKey[]) {
        const b = s.base?.[key];
        if (b && b.upgradeFinishAt && now >= b.upgradeFinishAt) {
          b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
          b.upgradeFinishAt = null;
          pushLog(s, { zona: "global", origen: "auto", category: "CONSTR", subtype: "completada", fields: { construcción: BUILDING_BY_KEY[key].name, nivel: b.level, ambito: "base_global" },          mensaje: `Construcción completada: ${BUILDING_BY_KEY[key].name} → N${b.level} (Base global) — ${narrBuildDone(BUILDING_BY_KEY[key].name, b.level)}` });
          dirty = true;
        }
      }
      for (const zid of Object.keys(s.zones).map(Number)) {
        const z = s.zones[zid];
        for (const key of Object.keys(z.thematic ?? {})) {
          const b = z.thematic[key];
          if (b && b.upgradeFinishAt && now >= b.upgradeFinishAt) {
            b.level = Math.min(BALANCE.buildingMaxLevel, b.level + 1);
            b.upgradeFinishAt = null;
            const def = THEMATIC_BY_KEY[key];
            pushLog(s, {
              zona: `Z${String(zid).padStart(2, "0")}`,
              origen: "auto",
              category: "CONSTR",
              subtype: "completada",
              fields: { construcción: def?.name ?? key, nivel: b.level },
              mensaje: `Construcción completada: ${def?.name ?? key} → N${b.level} (Z${String(zid).padStart(2, "0")})${def ? ` — ${narrBuildDone(def.name, b.level)}` : ""}`,
            });
            dirty = true;
          }
        }
      }

      // CRAFTING: sequential queue — resolve finished items (also caught up
      // on load; idempotent so the timer + load can never double-grant).
      const craftedNow = resolveFinishedCrafts(s);
      if (craftedNow.length > 0) {
        for (const name of craftedNow) {
          pushLog(s, { zona: String(getZone(s.currentZoneId).id), origen: "auto", category: "CRAFTEO", subtype: "fin", fields: { item: name, resultado: "exito" }, mensaje: `Crafteo completado: ${name}` });
        }
        toast.success("CRAFTEO COMPLETADO", { description: craftedNow.join(" · ") });
        dirty = true;
      }

      // ASIGNACIONES: expire assignments whose endsAt has passed (also
      // caught up on load; no refund — items were consumed at assignment).
      const expiredNow = pruneExpiredAssignments(s, now);
      if (expiredNow.length > 0) {
        for (const name of expiredNow) {
      pushLog(s, {
        zona: String(getZone(s.currentZoneId).id),
        origen: "auto",
        category: "NPC_ACTION",
        subtype: "expirado",
            fields: { npc: name, motivo: "fecha_de_expiración" },
            mensaje: `ASIGNACIÓN expirada | ${name}`,
          });
        }
        dirty = true;
        bumpAssignmentsUi();
      }

      if (dirty) void saveGame(s);
      setState({ ...s });
      // periodic save (every 15 s) to keep timestamps fresh
      if (now % 15000 < 1000) void saveGame(s);
    }, 1000);
    return () => window.clearInterval(id);
  }, [booted]);

  // ---- CRAFTING catch-up timer: fires when the active item's endsAt is
  // reached, even with the tab hidden or the UI on another screen (the app
  // never depends on the 1 s tick for crafting resolution; on load the
  // boot catch-up handles everything, idempotently).
  useEffect(() => {
    if (!booted) return;
    const schedule = () => {
      const front = stateRef.current?.craftingQueue?.[0];
      craftingNextCheckRef.current =
        front && front.startedAt > 0 ? front.endsAt : null;
      return craftingNextCheckRef.current;
    };
    const run = () => {
      const s = stateRef.current;
      if (!s) return;
      const done = resolveFinishedCrafts(s);
      if (done.length > 0) {
        for (const name of done) pushLog(s, { zona: String(getZone(s.currentZoneId).id), origen: "auto", category: "CRAFTEO", subtype: "fin", fields: { item: name, resultado: "exito" }, mensaje: `Crafteo completado: ${name}` });
        toast.success("CRAFTEO COMPLETADO", { description: done.join(" · ") });
        void saveGame(s);
      }
      const next = schedule();
      timerId = next != null ? window.setTimeout(run, Math.max(0, next - Date.now())) : null;
    };
    const first = schedule();
    let timerId = first != null ? window.setTimeout(run, Math.max(0, first - Date.now())) : null;
    return () => {
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [booted, craftingUiTick]);

  // ---- ASIGNACIONES expiry timer: fires when the soonest endsAt is
  // reached (even with the tab hidden or on another screen), mirroring
  // the crafting catch-up. On load the boot catch-up already pruned.
  useEffect(() => {
    if (!booted) return;
    let timerId: number | null = null;
    const run = () => {
      const s = stateRef.current;
      if (!s) return;
      const expired = pruneExpiredAssignments(s, vnow());
      if (expired.length > 0) {
      for (const name of expired) pushLog(s, { zona: String(getZone(s.currentZoneId).id), origen: "auto", category: "NPC_ACTION", subtype: "expirado", fields: { npc: name, motivo: "fecha_de_expiración" }, mensaje: `ASIGNACIÓN expirada | ${name}` });
      void saveGame(s);
        bumpAssignmentsUi();
      }
      const next = stateRef.current ? nextAssignmentExpiry(stateRef.current, vnow()) : null;
      timerId = next != null ? window.setTimeout(run, Math.max(0, next - vnow())) : null;
    };
    const first = stateRef.current ? nextAssignmentExpiry(stateRef.current, vnow()) : null;
    timerId = first != null ? window.setTimeout(run, Math.max(0, first - vnow())) : null;
    return () => {
      if (timerId != null) window.clearTimeout(timerId);
    };
    // assignmentsUiTick bumps on create/cancel/expiry — every path that
    // changes the soonest endsAt re-schedules the timer.
  }, [booted, assignmentsUiTick]);

  // save on tab hide (mobile backgrounding)
  useEffect(() => {
    const onHide = () => {
      const s = stateRef.current;
      if (s) {
        rebaseToRealTime(s);
        void saveGame(s);
      }
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
        // UN SOLO emisor de [RECURSO] por hallazgo real: narrResourceFind
        // fusiona la línea técnica y la narrativa (antes eran DOS líneas con
        // event_id distinto y origen= inconsistente). El inventario solo se
        // sumó UNA vez, arriba → era bug de log, no de economía.
        narrResourceFind(s, outcome.zoneId, f.resource, amount, !!f.rare, {
          origen: opts.auto ? "auto" : "manual",
          expTag,
        });
      } else if (f.kind === "damage") {
        s.health = Math.max(0, s.health - (f.damage ?? 0));
        // UN solo emisor de [ENERGÍA]/daño: la frase narrativa (incluye causa
        // y salud perdida) ES el mensaje de la única línea del golpe.
        pushLog(s, {
          zona: `Z${String(outcome.zoneId).padStart(2, "0")}`,
          origen: opts.auto ? "auto" : "manual",
          category: "ENERGÍA",
          subtype: "daño",
          fields: { causa: f.cause ?? "Accidente", salud_perdida: f.damage ?? 0 },
          mensaje: expTag + narrDamage(outcome.zoneId, f.cause ?? "Accidente", f.damage ?? 0),
        });
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
        pushLog(s, {
          zona: `Z${String(outcome.zoneId).padStart(2, "0")}`,
          origen: opts.auto ? "auto" : "manual",
          category: "EXP",
          subtype: "evento",
          fields: { evento: ev.text, recompensas: parts.join(" · ") },
          mensaje: expTag + 'EVENTO | ' + ev.text + (parts.length > 0 ? ' (' + parts.join(' · ') + ')' : ''),
        });
        // (narrEvent se eliminó: repetía exactamente este mismo texto como
        // SEGUNDA línea [EXP]/evento para un único evento real.)
      }
    }    if (outcome.findings.length === 0) {
      pushLog(s, { zona: `Z${String(outcome.zoneId).padStart(2, "0")}`, origen: opts.auto ? "auto" : "manual", category: "EXP", subtype: "sin_hallazgos", fields: {}, mensaje: `${expTag}Sin hallazgos` });
    }
    pushLog(s, { zona: `Z${String(outcome.zoneId).padStart(2, "0")}`, origen: opts.auto ? "auto" : "manual", category: "EXP", subtype: opts.auto ? "auto_fin" : "fin", fields: { exp: outcome.exp }, mensaje: `${expTag}${opts.auto ? "Auto" : "FIN"} | Z${String(outcome.zoneId).padStart(2, "0")} · ${zone.name} completada · +${outcome.exp} EXP` });

    // Only MANUAL explorations advance the frontier. Auto farm runs in
    // conquered zones can never unlock anything (zone < frontier anyway).
    if (!opts.auto) {
      const maxUnlocked = computeZoneUnlocks(s);
      if (maxUnlocked > frontierZoneId(s)) {
        s.pendingZoneUnlock = maxUnlocked;
        pushLog(s, { zona: getZone(maxUnlocked).id, origen: 'manual', category: 'ZONA', subtype: 'desbloqueada', fields: { zona_nombre: getZone(maxUnlocked).name }, mensaje: narrZoneUnlock(getZone(maxUnlocked).name) });
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

  /** Shared NPC-check helper: one roll per completed exploration (manual
   *  or auto). Counter is shared between both paths so a pure auto-farmer
   *  is never stuck with a frozen chance. fromAuto only affects the log
   *  label and the chance factor (autoNpcChanceFactor). */
  function npcCheck(s: GameState, zoneId: number, expId: number, startedAt: number, fromAuto: boolean) {
    const counter = (s.explorationsSinceLastNPC ?? 0) + 1;
    const baseChance = npcChanceForCounter(counter);
    const chance = fromAuto ? baseChance * BALANCE.autoNpcChanceFactor : baseChance;
    const pool = discoverableNpcIds(s);
    if (pool.length === 0) {
      // Pool exhausted: consume the exploration for the counter anyway.
      s.explorationsSinceLastNPC = counter;
      return;
    }
    if (Math.random() >= chance) {
      s.explorationsSinceLastNPC = counter;
      const via = fromAuto ? "AUTO" : "MANUAL";
      pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: via === "AUTO" ? "auto" : "manual", category: "NPC CHECK", subtype: "check", fields: { contador: counter, vía: via, probabilidad: (chance * 100).toFixed(1) }, mensaje: `[EXP #${expId}] NPC CHECK | contador ${counter} | ${via} | probabilidad ${(chance * 100).toFixed(1)}% | resultado NO` });
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const seed = NPC_BY_ID[pick];
    if (!seed) {
      s.explorationsSinceLastNPC = counter;
      return;
    }
    const npc: NpcSurvivor = {
      ...seed,
      assignedZoneId: null,
      // New finds are CANDIDATES: they must be recruited in Equipo
      // before they can be assigned to a zone.
      status: "candidate",
      discoveredAt: vnow(),
      productionTotals: { materiales: 0, agua: 0, comida: 0, medicamentos: 0, componentes: 0, energia: 0, dinero: 0 },
    };
    s.npcs.push(npc);
    const via = fromAuto ? "AUTO-FARM" : "MANUAL";
    pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: via === "AUTO-FARM" ? "auto" : "manual", category: "NPC CHECK", subtype: "check", fields: { contador: counter, vía: via, probabilidad: (chance * 100).toFixed(1), resultado: "sí" }, mensaje: `[EXP #${expId}] NPC CHECK | contador ${counter} | ${via} | probabilidad ${(chance * 100).toFixed(1)}% | resultado SÍ` });
    pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: via === "AUTO-FARM" ? "auto" : "manual", category: "NPC_ACTION", subtype: "hallazgo", fields: { npc: `${npc.id}·${npc.name}`, tipo: NPC_TYPE_MODIFIERS[npc.type].label }, mensaje: `[EXP #${expId}] NPC OBTENIDO (${via}) | ${npc.id} · ${npc.name} · ${NPC_TYPE_MODIFIERS[npc.type].label}` });
    // (narrNpcFound se eliminó: generaba una SEGUNDA línea [NPC_ACTION]
    //  /hallazgo para el mismo descubrimiento, sin el campo npc=<id>·<nombre>.)
    pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: "auto", category: "NPC_ACTION", subtype: "contador_reiniciado", fields: {}, mensaje: `[NPC] contador reiniciado a 0` });
    s.explorationsSinceLastNPC = 0;
    toast.info(fromAuto ? "SUPERVIVIENTE ENCONTRADO (AUTO)" : "SUPERVIVIENTE ENCONTRADO", {
      description: `${npc.name} «${npc.alias}» · ${NPC_TYPE_MODIFIERS[npc.type].label}`,
      duration: 6000,
    });
  }

  /** Complete the MANUAL exploration: roll, apply (full rewards), log, toast.
   *  NPC discovery uses the counter-based system (one roll per completion).
   *  SCAVENGE ya NO se tira aquí: el trigger vive en startExploration (el
   *  evento aparece en el momento en que el jugador inicia la exploración),
   *  así el cierre nunca vuelve a dispararlo (sin duplicados). */
  function completeExploration(s: GameState, zoneId: number, startedAt: number) {
    const run = s.explorationStates[zoneId];
    if (!run) return;
    const expId = run.expId ?? s.nextExplorationId++;
    // MANUAL run: full EXP, rare tier, special events, find bonus.
    const outcome = rollExploration(s, zoneId);
    applyOutcome(s, outcome, startedAt, { expId });
    // Single NPC check per exploration completion (counter-based).
    npcCheck(s, zoneId, expId, startedAt, false);
    s.explorationsDone += 1;
    s.manualExplorationsDone += 1;
    delete s.explorationStates[zoneId];
    toast.success("EXPLORACIÓN COMPLETADA", {
      description: outcomeSummary(outcome),
      duration: 5000,
    });
  }

  /** Complete one BACKGROUND auto-farm run for a specific zone: reduced EXP,
   *  reduced NPC discovery chance, no frontier changes. Chain continues via tick.
   *  SCAVENGE: rolls the same counter at autoScavengeChanceFactor; on fire,
   *  the 8 points resolve in chain (no UI) and every result is logged as
   *  "EVENTO | SCAVENGE · ..." lines. */
  function completeAutoRun(s: GameState, zoneId: number, startedAt: number) {
    if (!s.autoFarms[zoneId]) return;
    const expId = s.nextExplorationId++;
    // AUTO run: reduced EXP, no rare tier, no special events, no find bonus.
    const outcome = rollExploration(s, zoneId, { auto: true });
    // REBALANCEO v3: mismo bloque de fórmulas que el offline —
    // farmExpForZone (balance.ts · offlineFarming) × factor concurrente.
    // Así 8 h online u offline rinden lo mismo y el auto-farm nunca
    // vuelve a pagar la recompensa completa de una exploración manual.
    outcome.exp = farmExpForZone(zoneId) * autoFarmConcurrentFactorFor(s, zoneId);
    applyOutcome(s, outcome, startedAt, { auto: true, expId });
    // NPC check with reduced chance (autoNpcChanceFactor), same shared counter.
    npcCheck(s, zoneId, expId, startedAt, true);
    s.explorationsDone += 1;
    const runSeconds = Math.max(0, Math.round((vnow() - startedAt) / 1000));
    s.autoFarms[zoneId] = null;
    // AUTO_EXPLORER · ciclo_fin: duración real del ciclo, hallazgos y recursos.
    {
      const recursos: Record<string, number> = {};
      let hallazgos = 0;
      for (const f of outcome.findings) {
        if (f.kind === "resource" && f.resource) {
          const amount = f.amount ?? 0;
          hallazgos += 1;
          recursos[f.resource] = (recursos[f.resource] ?? 0) + amount;
        }
      }
      pushLog(s, {
        zona: zoneId,
        origen: "auto",
        category: "AUTO_EXPLORER",
        subtype: "ciclo_fin",
        fields: {
          // exploration_id = id interno de la exploración (NO son XP: las XP
          // reales las reporta [EXP] con su campo exp=).
          exploration_id: expId,
          duracion: runSeconds,
          hallazgos,
          recursos,
        },
        mensaje: `Auto-exploración: ciclo cerrado en Z${String(zoneId).padStart(2, "0")} · ${runSeconds}s · ${hallazgos} hallazgo(s)`,
      });
    }
    // SCAVENGE in auto: resolve all 8 points in chain, no interface.
    if (checkScavengeTrigger(s, zoneId, true)) {
      const loc = scavengeLocationForZone(zoneId);
      // Disparador del minijuego: NO es acción de NPC → categoría SCAVENGE
      // (es el inicio del bloque [SCAVENGE] que sigue; en manual es [CLICK]).
      pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: "auto", category: "SCAVENGE", subtype: "inicio", fields: { minijuego: "SCAVENGE", localizacion: loc.name, exploration_id: expId }, mensaje: `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE (auto)` });
      const results = resolveScavengeAuto(s, zoneId);
      for (const r of results) {
        const line =
          r.kind === "loot" && r.loot
            ? `+${r.loot.amount}${r.loot.resource === "comida" || r.loot.resource === "agua" ? " min" : ""} ${r.loot.resource === "dinero" ? "$" : r.loot.resource}`
            : r.kind === "dano"
              ? `-${r.damage} Salud`
              : "sin hallazgos";
        pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: "auto", category: "SCAVENGE", subtype: r.kind === "dano" ? "daño" : r.kind === "loot" ? "hallazgo" : "nada", fields: { resultado: line, texto: r.text }, mensaje: `EVENTO | SCAVENGE · ${line} — ${r.text}` });
      }
      finishScavenge(s); // auto sessions close immediately (no UI)
    }
  }

  /** Start the next auto-farm run for a specific zone (must be unlocked). */
  function scheduleAutoFarm(s: GameState, zoneId: number) {
    const now = vnow();
    const maxUnlocked = computeZoneUnlocks(s);
    if (zoneId < 1 || zoneId > maxUnlocked) return;
    if (s.autoFarms[zoneId]) return;
    // The manual run owns its zone; the farm retries on a later tick.
    if (s.explorationStates[zoneId]) return;
    if (s.health <= 0) return;
    // Agilidad reduces exploration duration (statEffects module).
    // Passive NPC benefit: an assigned NPC speeds up their zone further.
    // ASIGNACIONES apply here too (linterna/botas per zone), exactly as in
    // manual exploration — both paths can never drift apart.
    const minutes =
      explorationMinutesWithAgility(getZone(zoneId).explorationMinutes, s.survivor.stats.agilidad) *
      explorationDurationFactor(s, zoneId) *
      agilityFactor(s, zoneId) *
      npcZoneSpeedFactor(s, zoneId);
    s.autoFarms[zoneId] = { zoneId, startedAt: now, finishAt: now + minutes * 60000 };
    // AUTO_EXPLORER · ciclo_iniciado: se registra UNA vez por zona al arrancar
    // su run, con la lista completa de zonas en auto activo.
    pushLog(s, {
      zona: zoneId,
      origen: "auto",
      category: "AUTO_EXPLORER",
      subtype: "ciclo_iniciado",
      fields: {
        zonas: activeAutoZones(s).join(",") || `Z${String(zoneId).padStart(2, "0")}`,
        // exploration_id = id interno de la exploración, NO puntos de EXP.
        exploration_id: s.nextExplorationId,
        duracion: Math.round(minutes * 60),
      },
      mensaje: `Auto-exploración: ciclo iniciado en Z${String(zoneId).padStart(2, "0")}`,
    });
  }

  /** Zonas con auto-exploración activa, como "Z01","Z03"... */
  function activeAutoZones(s: GameState): string[] {
    return Object.keys(s.autoExplored ?? {})
      .map(Number)
      .filter((zid) => s.autoExplored[zid])
      .sort((a, b) => a - b)
      .map((zid) => `Z${String(zid).padStart(2, "0")}`);
  }

  // ---- actions ----

  const startNewGame = useCallback(
    async (survivor: Survivor) => {
      const now = vnow();
      bootOnceRef.current = true;
      const s = createInitialState(survivor, now);
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
      pendingOfflineSummaryRef.current = null; // fresh start: drop boot stash
      pushLog(s, {
        zona: String(getZone(s.currentZoneId).id),
        origen: "manual",
        category: "INICIO",
        subtype: "partida",
        fields: { estado: "nueva_partida" },
        mensaje: "Comienza tu supervivencia",
      });
      setState(s);
      stateRef.current = s;
      setHasSaveFile(true);
      setScreen("zonas");
      rebaseToRealTime(s); // persist the new account on the real timeline
      await saveGame(s);
    },
    [],
  );

  const continueGame = useCallback(async () => {
    const envelope = await loadGame();
    if (envelope?.state) {
      bootOnceRef.current = true;
      resetVirtualClock(); // fresh session: real timeline
      const now = Date.now();
      const result = applyOfflineProgress(envelope.state, now);
      const s = result.state;
      s.lastTickAt = now;
      setState(s);
      stateRef.current = s;
      setHasSaveFile(true);
      setScreen("zonas");
      if (result.summary.minutesAway >= 1) {
        setOfflineSummary(result.summary);
      } else if (pendingOfflineSummaryRef.current) {
        // Boot already computed an offline summary (e.g. fresh cloud pull
        // right before): show it now that we are entering the game.
        setOfflineSummary(pendingOfflineSummaryRef.current);
      }
      pendingOfflineSummaryRef.current = null;
      navigateRef.current?.("/juego");
    }
  }, []);

  const eraseSave = useCallback(async () => {
    await wipeAllSaves();
    resetVirtualClock(); // fresh account → fresh real timeline
    setHasSaveFile(false);
    setState(null);
    stateRef.current = null;
    bootOnceRef.current = false;
    setRollOptions([rollSurvivor()]);
  }, []);

  /** Dev/QA: change session speed. Session-only — never saved or synced. */
  const setSpeed = useCallback((m: SpeedMultiplier) => {
    setSpeedMultiplier(m);
    setSpeedMultiplierState(m);
  }, []);

  const rerollSurvivors = useCallback(() => {
    setRollOptions((prev) => (prev.length < SURVIVOR_MAX_ROLLS ? [...prev, rollSurvivor()] : prev));
  }, []);

  // ---- CRAFTING actions ----
  /** FABRICAR: validate against the REAL resources, deduct atomically and
   *  enqueue. Returns false when unaffordable (UI keeps the button disabled;
   *  the guard also protects against races). */
  const craftRecipe = useCallback(
    (recipeId: string) => {
      const recipe = RECIPE_BY_ID[recipeId];
      if (!recipe) return;
      setAndSave((s) => {
        if (!canAfford(s, recipe.costs)) {
          pushClick(s, "fabricar", {
            resultado: "bloqueado",
            motivo: "recursos_insuficientes",
            extra: { item: recipe.name },
          });
          toast.error("Recursos insuficientes");
          return;
        }
        startCraft(s, recipe);
        pushLog(s, {
          zona: s.currentZoneId,
          origen: "manual",
          category: "CRAFTEO",
          subtype: "inicio",
          fields: {
            item: recipe.name,
            receta: recipe.id,
            materiales_usados: { ...recipe.costs },
            duracion: recipe.timeSeconds,
          },
          mensaje: `Crafteo iniciado: ${recipe.name}`,
        });
        pushClick(s, "fabricar", { zona: s.currentZoneId, extra: { item: recipe.name } });
        setCraftingUiTick((t) => t + 1);
      });
    },
    [setAndSave],
  );

  /** CANCEL: full refund from the frozen cost snapshot + removal. Cancelling
   *  the active item starts the next one from now; waiting items shift.
   *  The refund lands in the real resource pools in the same update. */
  const cancelCrafting = useCallback(
    (uid: string) => {
      setAndSave((s) => {
        const item = s.craftingQueue.find((q) => q.uid === uid);
        pushClick(s, "cancelar_crafteo", {
          zona: s.currentZoneId,
          ...(item
            ? {}
            : { resultado: "bloqueado" as const, motivo: "crafteo_inexistente" }),
          extra: { item: item?.name ?? uid },
        });
        cancelCraft(s, uid);
        if (item) {
          pushLog(s, {
            zona: s.currentZoneId,
            origen: "manual",
            category: "CRAFTEO",
            subtype: "cancelado",
            fields: {
              item: item.name,
              resultado: "cancelado",
              materiales_devueltos: { ...item.costs },
            },
            mensaje: `Crafteo cancelado: ${item.name}`,
          });
        }
        setCraftingUiTick((t) => t + 1);
      });
    },
    [setAndSave],
  );

  /** Redondea a 3 decimales (mata el ruido de coma flotante tipo
   *  54.68399999999999 en las líneas de duración). */
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  // [EXP] ya NO registra el INICIO de un ciclo (opción 1 del fix #4): el
  // arranque pertenece en exclusiva a [INICIO] (narrExplorationStart), que
  // ahora arrastra duracion= y exploration_id=. Así un mismo hecho nunca se
  // loguea dos veces bajo dos categorías distintas.

  const startExploration = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const now = vnow();
        // Per-zone: only prevent if THIS zone is already exploring
        if (s.explorationStates[zoneId]) return;
        if (currentEnergy(s, now) < 1) {
          // Aviso claro: cuánta falta, cuánta hay, cuándo vuelve y cómo
          // acelerarla (Batería en el Mercader). El botón deshabilitado ya
          // muestra la pista corta; este toast da el detalle completo.
          toast.error("Sin energía para explorar", {
            description: energyShortfallInfo(s, 1, now).mensaje,
          });
          return;
        }
        if (s.health <= 0) {
          toast.error("Salud crítica", { description: "Usa medicina antes de explorar." });
          return;
        }
        spendEnergy(s, 1, now);
    // Agilidad reduces exploration duration (statEffects module).
    // Passive NPC benefit: an assigned NPC speeds up their zone further.
    // ASIGNACIONES (zone-targeted): linterna −10% duration ONLY in its
    // assigned zone; botas +8% agility ONLY via that zone's assigned NPC.
    const minutes =
      explorationMinutesWithAgility(getZone(zoneId).explorationMinutes, s.survivor.stats.agilidad) *
      explorationDurationFactor(s, zoneId) *
      agilityFactor(s, zoneId) *
      npcZoneSpeedFactor(s, zoneId);
    s.currentZoneId = zoneId;
        const expId = s.nextExplorationId++;
        s.explorationStates[zoneId] = { zoneId, startedAt: now, finishAt: now + minutes * 60000, expId };
        // UN SOLO evento de inicio por ciclo: [INICIO] es la única fuente.
        narrExplorationStart(s, zoneId, getZone(zoneId).name, {
          duracion: round3(minutes * 60),
          exploration_id: expId,
        });
        // SCAVENGE event roll (manual starts): se resuelve AL TOCAR/INICIAR la
        // exploración — mismo contador y tiers de probabilidad, resultado
        // inmediato (el modal abre ahora, no al terminar). El check registra
        // su línea técnica (contador / probabilidad / resultado) acá, así el
        // log refleja el evento en el momento correcto y la curva sigue
        // siendo auditable. La finalización ya no vuelve a tirar.
        if (checkScavengeTrigger(s, zoneId, false)) {
          const loc = scavengeLocationForZone(zoneId);
          // Disparador del minijuego: NO es acción de NPC → click del jugador
          // que arranca el evento (abre el bloque [SCAVENGE] posterior).
          pushClick(s, "iniciar_scavenge", {
            zona: `Z${String(zoneId).padStart(2, "0")}`,
            extra: { minijuego: "SCAVENGE", localizacion: loc.name, exploration_id: expId },
            mensaje: `[EXP #${expId}] EVENTO | ${loc.name} detectada · minijuego SCAVENGE`,
          });
        }
      });
    },
    [setAndSave],
  );

  /** Search one point of the ACTIVE scavenge session: rolls loot/nada/daño
   *  for that spot, applies the grant/damage to the REAL state right away
   *  (loot is banked at search time — quitting keeps everything found) and
   *  logs the flavor line. The modal stays open; the session ends via
   *  finishScavengeEvent (manual) — board cleared or player choice. */
  const searchScavenge = useCallback(
    (index: number) => {
      setAndSave((s) => {
        if (!s.scavengeEvent) return;
        const result = searchScavengePoint(s, index);
        if (!result) return; // already searched or no event
        const line =
          result.kind === "loot" && result.loot
            ? `+${result.loot.amount}${result.loot.resource === "comida" || result.loot.resource === "agua" ? " min" : ""} ${result.loot.resource === "dinero" ? "$" : result.loot.resource}`
            : result.kind === "dano"
              ? `-${result.damage} Salud`
              : "sin hallazgos";
        pushLog(s, {
          zona: `Z${String(s.currentZoneId).padStart(2, "0")}`,
          origen: "manual",
          category: "SCAVENGE",
          subtype: result.kind === "dano" ? "daño" : result.kind === "loot" ? "hallazgo" : "nada",
          fields: { resultado: line, texto: result.text },
          mensaje: `EVENTO | SCAVENGE · ${line} — ${result.text}`,
        });
      });
    },
    [setAndSave],
  );

  /** Close the scavenge minigame: settle unsearched points as "nada",
   *  log the session total and clear the event. Loot/damage were applied
   *  at search time; this only finalizes the session.
   *  `fin` = tablero completo (saquear todo); `parcial` = se cerró antes de
   *  revisar los N puntos (saquear parcial / retirarse con lo obtenido). */
  const finishScavengeEvent = useCallback(() => {
    setAndSave((s) => {
      if (!s.scavengeEvent) return;
      const board = s.scavengeEvent.board;
      const buscados = board.filter((c) => c.result).length;
      const total = board.length;
      const completo = buscados >= total;
      const puntos = `${buscados}/${total}`;
      const subtype = completo ? "fin" : "parcial";
      const results = finishScavenge(s);
      const lootLines = results.filter((r) => r.kind === "loot" && r.loot);
      const saludPerdida = results.reduce(
        (acc, r) => acc + (r.kind === "dano" ? r.damage ?? 0 : 0),
        0,
      );
      if (lootLines.length > 0) {
        const summary = lootLines
          .map((r) => `+${r.loot!.amount}${r.loot!.resource === "comida" || r.loot!.resource === "agua" ? " min" : ""} ${r.loot!.resource === "dinero" ? "$" : r.loot!.resource}`)
          .join(" · ");
        toast.success(completo ? "SAQUEO COMPLETADO" : "SAQUEO PARCIAL COBRADO", {
          description: summary,
        });
        pushLog(s, {
          zona: `Z${String(s.currentZoneId).padStart(2, "0")}`,
          origen: "manual",
          category: "SCAVENGE",
          subtype,
          fields: { puntos, completo, hallazgos: summary, salud_perdida: saludPerdida },
          mensaje: `EVENTO | SCAVENGE ${completo ? "cerrado" : "parcial"} · ${puntos} puntos · ${summary}`,
        });
      } else {
        pushLog(s, {
          zona: `Z${String(s.currentZoneId).padStart(2, "0")}`,
          origen: "manual",
          category: "SCAVENGE",
          subtype,
          fields: { puntos, completo, salud_perdida: saludPerdida },
          mensaje: `EVENTO | SCAVENGE ${completo ? "cerrado" : "parcial"} sin hallazgos · ${puntos} puntos`,
        });
        toast.info("Saqueo terminado", {
          description: "No encontraste nada aprovechable esta vez.",
        });
      }
    });
  }, [setAndSave]);

  /** IGNORAR el evento: no se revisa ningún punto → sin botín, sin daño y
   *  sin consumos. El scavenger se va y el log registra el descarte. */
  const ignoreScavengeEvent = useCallback(() => {
    setAndSave((s) => {
      if (!ignoreScavenge(s)) return;
      toast.info("Ubicación ignorada", {
        description: "No saqueaste nada: ni botín ni riesgo. El scavenger se retira.",
      });
    });
  }, [setAndSave]);

  /** Turn the background farm on/off. ON starts a run in the last conquered
   *  zone immediately; OFF cancels the running auto run (it costs nothing).
   *  ON is gated by BALANCE.maxConcurrentAutoFarms — the cap only blocks NEW
   *  activations: saves already above the cap keep their farms running and
   *  just cannot activate more zones until they drop below the cap. */
  const toggleAutoExplore = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const was = s.autoExplored[zoneId] ?? false;
        const zoneName = getZone(zoneId).name;
        if (!was) {
          const activeCount = Object.keys(s.autoExplored).filter((id) => s.autoExplored[Number(id)]).length;
          if (activeCount >= BALANCE.maxConcurrentAutoFarms) {
            pushClick(s, "auto_explorar", { zona: zoneId, resultado: "bloqueado", motivo: "limite_zonas_auto" });
            toast.error("Máximo de zonas en auto-farm", {
              description: `Ya tenés ${activeCount} zonas activas (máximo ${BALANCE.maxConcurrentAutoFarms}). Desactivá alguna primero.`,
            });
            return;
          }
        }
        s.autoExplored[zoneId] = !was;
        pushClick(s, "auto_explorar", {
          zona: zoneId,
          extra: { estado: !was ? "activada" : "desactivada" },
        });
        // AUTO_EXPLORER: el toggle refleja el ESTADO de la zona; el ciclo
        // real (inicio/fin con duracion/hallazgos/recursos) se loguea en
        // scheduleAutoFarm / completeAutoRun.
        pushLog(s, {
          zona: zoneId,
          origen: "manual",
          category: "AUTO_EXPLORER",
          subtype: !was ? "activado" : "desactivado",
          fields: {
            zonas: activeAutoZones(s).join(",") || `Z${String(zoneId).padStart(2, "0")}`,
            estado: !was ? "activada" : "desactivada",
          },
          mensaje: !was ? 'Auto-exploración activada en ' + zoneName : 'Auto-exploración desactivada en ' + zoneName,
        });
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
            s.npcCycles[npcId] = vnow();
            pushClick(s, "asignar_npc", { zona: zoneId, extra: { npc: npc.id } });
            pushLog(s, { zona: zoneId, origen: 'manual', category: 'NPC_ACTION', subtype: 'asignado', fields: { npc: npc.id, nombre: npc.name, zona_anterior: npc.assignedZoneId ?? 'sin_asignar', zona_nueva: String(getZone(zoneId).id) }, mensaje: `${npcDisplayName(npc)} asignado a ${getZone(zoneId).name}` });
          }
        } else if (npcWasAssigned) {
          const zonaAnterior: string = npc.assignedZoneId == null ? 'sin_asignar' : String(getZone(Number(npc.assignedZoneId)).id);
          pushClick(s, "reasignar_npc", { zona: npc.assignedZoneId ?? "global", extra: { npc: npc.id } });
          pushLog(s, { zona: npc.assignedZoneId ?? "global", origen: 'manual', category: 'NPC_ACTION', subtype: 'reasignado', fields: { npc: npc.id, nombre: npc.name, zona_anterior: zonaAnterior, zona_nueva: zoneId == null ? 'sin_asignar' : String(getZone(zoneId).id) }, mensaje: `${npcDisplayName(npc)} sin asignación` });
        }
      });
    },
    [setAndSave],
  );

  /** Upgrade a GLOBAL core building (GameState.base). One shared base quota;
   *  availability gated by the gate zone of each core building. */
  const upgradeBaseBuilding = useCallback(
    (key: BuildingKey) => {
      setAndSave((s) => {
        const b = s.base?.[key];
        if (!b || b.level >= BALANCE.buildingMaxLevel || b.upgradeFinishAt) return;
        // Base concurrency quota (global, independent of zone quotas).
        const active = activeConstructionsInBase(s.base);
        if (active >= BALANCE.maxConcurrentConstructionsInBase) {
          toast.error("Construcción en curso", {
            description: `Límite de la base: ${BALANCE.maxConcurrentConstructionsInBase} · ${active} activa${active === 1 ? "" : "s"} ahora`,
          });
          return;
        }
        const cost = buildingUpgradeCost(b.level, CORE_BUILDING_GATE_ZONE[key]);
        if (s.resources.materiales < cost.materiales || s.resources.componentes < cost.componentes) {
          toast.error("Recursos insuficientes", {
            description: `${cost.materiales} Materiales · ${cost.componentes} Componentes`,
          });
          return;
        }
        s.resources.materiales -= cost.materiales;
        s.resources.componentes -= cost.componentes;
        const minutes = buildingUpgradeMinutes(b.level);
        b.upgradeFinishAt = vnow() + minutes * 60000;
        pushLog(s, { zona: 'Base global', origen: 'auto', category: 'CONSTR', subtype: 'completada', fields: { construcción: BUILDING_BY_KEY[key].name, nivel: b.level }, mensaje: `Mejora iniciada: ${BUILDING_BY_KEY[key].name} N${b.level + 1} (Base global)` });
      });
    },
    [setAndSave],
  );

  /** Upgrade a zone THEMATIC building (local, zones[].thematic). */
  const upgradeThematicBuilding = useCallback(
    (zoneId: number, key: string) => {
      setAndSave((s) => {
        const z = s.zones[zoneId];
        if (!z) return;
        const b = z.thematic?.[key];
        const def = THEMATIC_BY_KEY[key];
        if (!b || !def || b.level >= BALANCE.buildingMaxLevel || b.upgradeFinishAt) return;
        // Per-zone concurrency quota (thematic buildings share it).
        const active = activeThematicConstructions(z);
        if (active >= BALANCE.maxConcurrentConstructionsPerZone) {
          toast.error("Construcción en curso", {
            description: `Límite: ${BALANCE.maxConcurrentConstructionsPerZone} por zona · ${active} activa${active === 1 ? "" : "s"} ahora`,
          });
          return;
        }
        const cost = buildingUpgradeCost(b.level, zoneId, { tier: key });
        if (s.resources.materiales < cost.materiales || s.resources.componentes < cost.componentes) {
          toast.error("Recursos insuficientes", {
            description: `${cost.materiales} Materiales · ${cost.componentes} Componentes`,
          });
          return;
        }
        s.resources.materiales -= cost.materiales;
        s.resources.componentes -= cost.componentes;
        const minutes = buildingUpgradeMinutes(b.level);
        b.upgradeFinishAt = vnow() + minutes * 60000;
        pushLog(s, { zona: `Z${String(zoneId).padStart(2, "0")}`, origen: 'auto', category: 'CONSTR', subtype: 'completada', fields: { construcción: def.name, nivel: b.level }, mensaje: `Mejora iniciada: ${def.name} N${b.level + 1} (Z${String(zoneId).padStart(2, "0")})` });
      });
    },
    [setAndSave],
  );

  const useMedicine = useCallback(
    (qty?: number) => {
      setAndSave((s) => {
        if (s.resources.medicamentos <= 0) {
          pushClick(s, "usar_medicina", { resultado: "bloqueado", motivo: "sin_medicamentos" });
          toast.error("Sin medicamentos");
          return;
        }
        if (s.health >= BALANCE.maxHealth) {
          // Intento BLOQUEADO: queda en el log con resultado/motivo, nunca
          // como un USO_ITEM ejecutado (evita confundir el inventario).
          pushClick(s, "usar_medicina", { resultado: "bloqueado", motivo: "salud_al_maximo" });
          pushLog(s, {
            zona: "global",
            origen: 'manual',
            category: "USO_ITEM",
            subtype: "bloqueado",
            fields: {
              item: "medicamentos",
              cantidad: qty == null ? 0 : Math.max(1, Math.floor(qty)),
              efecto: "curacion",
              resultado: "bloqueado",
              motivo: "salud_al_maximo",
            },
            mensaje: "Medicina NO usada · salud al máximo",
          });
          toast.info("Salud completa");
          return;
        }
        const unitsForMissing = Math.ceil(
          (BALANCE.maxHealth - s.health) / BALANCE.medicineHealthPerUnit,
        );
        // No qty = "curar al máximo"; explicit qty = use that many (min 1).
        const wanted = qty == null ? unitsForMissing : Math.max(1, Math.floor(qty));
        const units = Math.min(
          wanted,
          unitsForMissing,
          Math.floor(s.resources.medicamentos),
        );
        if (units <= 0) {
          pushClick(s, "usar_medicina", { resultado: "bloqueado", motivo: "sin_unidades" });
          return;
        }
        const saludAntes = s.health;
        const stockAntes = Math.floor(s.resources.medicamentos);
        s.resources.medicamentos -= units;
        s.health = Math.min(
          BALANCE.maxHealth,
          s.health + units * BALANCE.medicineHealthPerUnit,
        );
        pushClick(s, "usar_medicina", { extra: { cantidad: units } });
        pushLog(s, {
          zona: "global",
          origen: 'manual',
          category: "USO_ITEM",
          subtype: "consumido",
          fields: {
            item: "medicamentos",
            cantidad: units,
            efecto: `+${units * BALANCE.medicineHealthPerUnit} salud`,
            resultado_recurso: `salud ${Math.round(saludAntes)}→${Math.round(s.health)}`,
            medicamentos_restantes: stockAntes - units,
          },
          mensaje: units > 1
            ? `Medicina usada · +${units * BALANCE.medicineHealthPerUnit} Salud (${units} medicamentos)`
            : "Medicina usada · +1 Salud",
        });
      });
    },
    [setAndSave],
  );

  /** Use one crafted CONSUMABLE: applies the effect and decrements the
   *  inventory by 1 (single atomic update). Passive/unlock items are NOT
   *  usable — passives are assigned to a zone/NPC from Mochila. */
  const useCraftedItemAction = useCallback(
    (recipeId: string) => {
      const recipe = RECIPE_BY_ID[recipeId];
      if (!recipe) return;
      setAndSave((s) => {
        const stockAntes = s.craftedInventory[recipeId] ?? 0;
        const result = applyCraftedUse(s, recipeId);
        if (!result) {
          pushClick(s, "usar_item", { resultado: "bloqueado", motivo: "no_aplicable", extra: { item: recipe.name } });
          pushLog(s, {
            zona: "global",
            origen: "manual",
            category: "USO_ITEM",
            subtype: "bloqueado",
            fields: { item: recipe.name, cantidad: stockAntes, efecto: recipe.effect, resultado: "bloqueado", motivo: "no_aplicable" },
            mensaje: `Objeto NO usado · ${recipe.name}`,
          });
          toast.error("No se puede usar", { description: recipe.name });
          return;
        }
        pushClick(s, "usar_item", { extra: { item: recipe.name } });
        pushLog(s, {
          zona: "global",
          origen: "manual",
          category: "USO_ITEM",
          subtype: "consumido",
          fields: {
            item: recipe.name,
            cantidad: 1,
            efecto: recipe.effect,
            resultado_recurso: result,
            restantes: Math.max(0, stockAntes - 1),
          },
          mensaje: `Objeto usado · ${result}`,
        });
        toast.success(recipe.name.toUpperCase(), { description: result });
      });
    },
    [setAndSave],
  );

  /** ASIGNAR (modelo de activación): consume 1 unit of the non-consumable
   *  and register an active assignment for its per-recipe duration. Zone
   *  targets must be unlocked; NPC targets must be active team members.
   *  Same recipe on the same target is blocked (UI + guard). */
  const assignCraftedItem = useCallback(
    (recipeId: string, targetType: "zone" | "npc", targetId: string) => {
      const recipe = RECIPE_BY_ID[recipeId];
      if (!recipe) return;
      setAndSave((s) => {
        const count = s.craftedInventory[recipeId] ?? 0;
        if (count < 1) {
          toast.error("No tienes ese objeto");
          return;
        }
        const now = vnow();
        if (
          (s.assignments ?? []).some(
            (a) => a.recipeId === recipeId && a.targetId === targetId && a.endsAt > now,
          )
        ) {
          toast.error("Ya asignado", {
            description: `${recipe.name} ya está asignado a ese destino.`,
          });
          return;
        }
        if (targetType === "zone") {
          const zoneId = Number(targetId);
          if (!Number.isFinite(zoneId) || zoneId < 1 || zoneId > computeZoneUnlocks(s)) {
            toast.error("Zona no disponible");
            return;
          }
        } else {
          const npc = s.npcs.find((n) => n.id === targetId);
          if (!npc || (npc.status ?? "active") !== "active") {
            toast.error("Superviviente no disponible");
            return;
          }
        }
        const seconds = recipe.assignDurationSeconds ?? 7200;
        const assignment: CraftedAssignment = {
          id: `${recipeId}-${now}-${Math.floor(Math.random() * 1e6)}`,
          recipeId,
          targetType,
          targetId,
          effect: recipe.effect,
          startedAt: now,
          endsAt: now + seconds * 1000,
        };
        s.assignments = [...(s.assignments ?? []), assignment];
        s.craftedInventory[recipeId] = count - 1;
        if (s.craftedInventory[recipeId] <= 0) delete s.craftedInventory[recipeId];
        const targetLabel =
          targetType === "zone"
            ? `${getZone(Number(targetId)).name} (Z${String(Number(targetId)).padStart(2, "0")})`
            : (() => {
                const npc = s.npcs.find((n) => n.id === targetId);
                return npc ? `${npc.name} «${npc.alias}»` : targetId;
              })();
        pushLog(s, {
          zona: undefined,
          origen: 'manual',
          category: "NPC_ACTION",
          subtype: "asignado",
          fields: {},
          mensaje: `ASIGNACIÓN | ${recipe.name} → ${targetLabel} · ${Math.round(seconds / 60)} min (objeto consumido)`,
        });
        toast.success("OBJETO ASIGNADO", {
          description: `${recipe.name} → ${targetLabel} · ${Math.round(seconds / 60)} min`,
        });
        bumpAssignmentsUi();
      });
    },
    [setAndSave],
  );

  /** Cancel an active assignment early: effect stops now, NO refund — the
   *  item was consumed when the assignment was created (consistent with
   *  the rest of the app's economy). */
  const cancelCraftedAssignment = useCallback(
    (assignmentId: string) => {
      setAndSave((s) => {
        const idx = (s.assignments ?? []).findIndex((a) => a.id === assignmentId);
        if (idx === -1) return;
        const [removed] = s.assignments.splice(idx, 1);
        const recipe = RECIPE_BY_ID[removed.recipeId];
        pushLog(s, {
          zona: undefined,
          origen: 'auto',
          category: "NPC_ACTION",
          subtype: "cancelado",
          fields: {},
          mensaje: `ASIGNACIÓN cancelada | ${recipe?.name ?? removed.recipeId} (sin reembolso)`,
        });
        toast.info("Asignación cancelada", {
          description: "El objeto ya se consumió al asignarlo: sin reembolso.",
        });
        bumpAssignmentsUi();
      });
    },
    [setAndSave],
  );

  const buyResource = useCallback(
    (key: ResourceKey, qty = 1) => {
      setAndSave((s) => {
        const offer = MERCHANT_OFFERS[key];
        if (!offer) return;
        const q = Math.max(1, Math.floor(qty));
        const total = offer.price * q;
        if (s.resources.dinero < total) {
          pushClick(s, "comprar_mercader", {
            resultado: "bloqueado",
            motivo: "dinero_insuficiente",
            extra: { item: key, cantidad: q, precio: total },
          });
          toast.error("Dinero insuficiente", { description: `Cuesta $${total}` });
          return;
        }
        s.resources.dinero -= total;
        if (key === "comida") s.foodMin += offer.amount * q;
        else if (key === "agua") s.waterMin += offer.amount * q;
        else s.resources[key] += offer.amount * q;
        pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'compra', fields: { item: key, cantidad: offer.amount * q, precio: total }, mensaje: `Mercader: +${offer.amount * q}${key === 'comida' || key === 'agua' ? ' min' : ''} ${key} · -$${total}` });
        pushClick(s, "comprar_mercader", { extra: { item: key, cantidad: q } });
      });
    },
    [setAndSave],
  );

  const buyBattery = useCallback(
    (qty = 1) => {
      setAndSave((s) => {
        const now = vnow();
        applyEnergyRegen(s, now); // settle pending regen before checking headroom
        const q = Math.max(1, Math.floor(qty));
        const total = MERCHANT_BATTERY_OFFER.price * q;
        if (s.resources.dinero < total) {
          pushClick(s, "comprar_bateria", {
            resultado: "bloqueado",
            motivo: "dinero_insuficiente",
            extra: { item: "batería", cantidad: q, precio: total },
          });
          toast.error("Dinero insuficiente", { description: `Cuesta $${total}` });
          return;
        }
        if (s.resources.energia + MERCHANT_BATTERY_OFFER.energy * q > BALANCE.maxEnergy) {
          pushClick(s, "comprar_bateria", {
            resultado: "bloqueado",
            motivo: "sin_margen_energía",
            extra: { item: "batería", medidor: `${s.resources.energia}/${BALANCE.maxEnergy}` },
          });
          toast.error("Sin margen de energía", {
            description: `Tienes ${s.resources.energia}/${BALANCE.maxEnergy} · la batería da +${MERCHANT_BATTERY_OFFER.energy}`,
          });
          return;
        }
        s.resources.dinero -= total;
        gainEnergy(s, MERCHANT_BATTERY_OFFER.energy * q, now);
        pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'compra', fields: { item: 'batería', cantidad: MERCHANT_BATTERY_OFFER.energy * q, precio: total }, mensaje: `Mercader: ${MERCHANT_BATTERY_OFFER.label} +${MERCHANT_BATTERY_OFFER.energy * q} Energía · -$${total}` });
        pushClick(s, "comprar_bateria", { extra: { item: "batería", cantidad: q } });
        toast.success("Batería comprada", { description: `+${MERCHANT_BATTERY_OFFER.energy * q} Energía` });
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
            pushClick(s, "vender_mercader", {
              resultado: "bloqueado",
              motivo: "stock_insuficiente",
              extra: { item: key, cantidad: sellAmount },
            });
            toast.error("Comida insuficiente", { description: `Necesitas ${sellAmount} min de comida` });
            return;
          }
          s.foodMin -= sellAmount;
        } else if (key === "agua") {
          if (s.waterMin < sellAmount) {
            pushClick(s, "vender_mercader", {
              resultado: "bloqueado",
              motivo: "stock_insuficiente",
              extra: { item: key, cantidad: sellAmount },
            });
            toast.error("Agua insuficiente", { description: `Necesitas ${sellAmount} min de agua` });
            return;
          }
          s.waterMin -= sellAmount;
        } else {
          if (s.resources[key] < sellAmount) {
            pushClick(s, "vender_mercader", {
              resultado: "bloqueado",
              motivo: "stock_insuficiente",
              extra: { item: key, cantidad: sellAmount },
            });
            toast.error(`${RESOURCE_META[key].label} insuficiente`, { description: `Necesitas ${sellAmount}` });
            return;
          }
          s.resources[key] -= sellAmount;
        }
        s.resources.dinero += totalMoney;
        pushLog(s, { zona: undefined, origen: 'manual', category: 'MERCADER', subtype: 'venta', fields: { item: key, cantidad: sellAmount, precio: totalMoney }, mensaje: `[MERCADER] Venta · -${sellAmount} ${key === 'comida' || key === 'agua' ? 'min ' + key : key} · +$${totalMoney}` });
        pushClick(s, "vender_mercader", { extra: { item: key, cantidad: qty } });
        toast.success(`Venta realizada`, { description: `+ $${totalMoney}` });
      });
    },
    [setAndSave],
  );

  /** Recruit a candidate NPC into the shelter: pays the recruit cost and
   *  flips status to "active" so it can be assigned to a zone. */
  const recruitNpc = useCallback(
    (npcId: string) => {
      setAndSave((s) => {
        const npc = s.npcs.find((n) => n.id === npcId);
        if (!npc) return;
        if ((npc.status ?? "active") === "active") return; // already recruited
        const matCost = BALANCE.npcRecruitCostMateriales;
        const foodCost = BALANCE.npcRecruitCostComidaMin;
        if (s.resources.materiales < matCost) {
          toast.error("Materiales insuficientes", { description: `Reclutar cuesta ${matCost} Materiales` });
          return;
        }
        if (s.foodMin < foodCost) {
          toast.error("Comida insuficiente", { description: `Reclutar cuesta ${foodCost} min de comida` });
          return;
        }
        s.resources.materiales -= matCost;
        s.foodMin -= foodCost;
        npc.status = "active";
        pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'reclutado', fields: { npc: npc.id, nombre: npc.name, costo_materiales: matCost, costo_comida: foodCost }, mensaje: `[NPC] ${npc.id} · ${npc.name} reclutado · -${matCost} Materiales · -${foodCost} min Comida` });
        toast.success("SUPERVIVIENTE RECLUTADO", {
          description: `${npc.name} «${npc.alias}» se une al refugio.`,
        });
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
        // Its crafted-item assignments die with it (already consumed — no refund).
        if (Array.isArray(s.assignments) && s.assignments.some((a) => a.targetType === "npc" && a.targetId === npcId)) {
          s.assignments = s.assignments.filter((a) => !(a.targetType === "npc" && a.targetId === npcId));
        }
        pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'expulsado', fields: { npc: npc.id, nombre: npc.name }, mensaje: `[NPC] ${npc.id} · ${npc.name} expulsada del refugio` });
        toast.info(`${npc.name} expulsada`, { description: "El superviviente ha sido eliminado del refugio." });
      });
    },
    [setAndSave],
  );

  /** Ignore a candidate survivor found while exploring: removes them from
   *  the roster WITHOUT recruiting (no resource cost, no assignment). Only
   *  candidates can be ignored; later finds and explorations keep working
   *  and the same NPC may reappear in a future discovery. */
  const ignoreNpc = useCallback(
    (npcId: string) => {
      setAndSave((s) => {
        const idx = s.npcs.findIndex((n) => n.id === npcId);
        if (idx === -1) return;
        const npc = s.npcs[idx];
        if ((npc.status ?? "active") === "active") return; // solo candidatos
        s.npcs.splice(idx, 1);
        delete s.npcCycles[npcId];
        pushLog(s, { zona: undefined, origen: 'manual', category: 'NPC_ACTION', subtype: 'ignorado', fields: { npc: npc.id, nombre: npc.name }, mensaje: `Ignoraste a ${npc.name}` });
        toast.info(`${npc.name} ignorado`, { description: "El superviviente se marcha. Podés encontrarlo en otra exploración." });
      });
    },
    [setAndSave],
  );

  /** Activity badges ("visto"): entering a screen — or being on it when its
   *  activity arrives — marks every log event up to the newest id as seen
   *  for that screen. Persisted via GameState.activitySeen. */
  const markScreenSeen = useCallback(
    (screen: Screen) => {
      setAndSave((s) => {
        const seen = s.activitySeen ?? {};
        const upTo = s.nextLogEventId;
        if ((seen[screen] ?? 0) >= upTo) return; // nada nuevo que marcar
        s.activitySeen = { ...seen, [screen]: upTo };
      });
    },
    [setAndSave],
  );

  // ---- badge de actividad: limpiar al entrar / no encender en vivo ----
  // Runs on boot, on every screen change, and whenever the newest log event
  // id advances (a new event while viewing its screen never lights the dot:
  // markScreenSeen covers up to the current id). For events of OTHER screens
  // the call is a no-op and their dot stays on.
  const latestActivityId = state?.log[0]?.event_id;
  useEffect(() => {
    if (!booted) return;
    markScreenSeen(screen);
  }, [booted, screen, latestActivityId, markScreenSeen]);

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
      searchScavenge,
      finishScavengeEvent,
      ignoreScavengeEvent,
      toggleAutoExplore,
      maxUnlockedZoneId: state ? computeZoneUnlocks(state) : 1,
      setCurrentZone,
      assignNpc,
      recruitNpc,
      ignoreNpc,
      markScreenSeen,
      upgradeBaseBuilding,
      upgradeThematicBuilding,
      useMedicine,
      useCraftedItem: useCraftedItemAction,
      assignCraftedItem,
      cancelCraftedAssignment,
      buyResource,
      buyBattery,
      sellResource,
      expelNpc,
      rollOptions,
      rerollSurvivors,
      offlineSummary,
      savedZonasScrollRef,
      craftingVersion: craftingUiTick,
      craftRecipe,
      cancelCrafting,
      dismissOfflineSummary: () => setOfflineSummary(null),
      speedMultiplier,
      setSpeed,
    }),
    [state, booted, hasSaveFile, screen, setNavigator, startNewGame, continueGame, eraseSave,      cloudConnected, cloudSyncing, lastSyncAt, syncNow, restoreFromCloud,      startExploration, searchScavenge, finishScavengeEvent, ignoreScavengeEvent, toggleAutoExplore, setCurrentZone, assignNpc, recruitNpc, ignoreNpc, markScreenSeen, upgradeBaseBuilding, upgradeThematicBuilding, useMedicine, useCraftedItemAction, assignCraftedItem, cancelCraftedAssignment, buyResource, buyBattery, sellResource, expelNpc, rollOptions, rerollSurvivors, offlineSummary, savedZonasScrollRef, speedMultiplier, setSpeed],
  );

  return (
    <GameContext.Provider value={value}>
      {children}
      <OfflineSummaryModal />
      <ScavengeModal />
    </GameContext.Provider>
  );
}

// Re-export helpers used by UI
export { STAT_RESOURCE, npcProductionMultiplier, SURVIVOR_MAX_ROLLS, rollSurvivor };
