import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { BALANCE, STAT_RESOURCE } from "@/game/balance";
import { getZone, ZONES } from "@/game/zones";
import { NPC_BY_ID } from "@/game/npcData";
import { NPC_TYPE_MODIFIERS, npcProductionMultiplier } from "@/game/npcTypes";
import { createInitialState, loadGame, saveGame, deleteSave } from "@/game/saveSystem";
import { applyOfflineProgress } from "@/game/offlineProgress";
import { tickNpcs } from "@/game/onlineTick";
import { applyEnergyRegen, currentEnergy, spendEnergy } from "@/game/energySystem";
import { rollExploration } from "@/game/explorationEngine";
import {
  buildingUpgradeCost,
  buildingUpgradeMinutes,
  BUILDING_BY_KEY,
} from "@/game/buildings";
import { SURVIVOR_MAX_ROLLS, generateSurvivorOptions, rollSurvivor } from "@/game/survivorGenerator";
import type {
  BuildingKey,
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
  startExploration: (zoneId: number) => void;
  collectExploration: () => void;
  setCurrentZone: (zoneId: number) => void;
  assignNpc: (npcId: string, zoneId: number | null) => void;
  upgradeBuilding: (zoneId: number, key: BuildingKey) => void;
  useMedicine: () => void;
  buyResource: (key: ResourceKey) => void;
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

function computeZoneUnlocks(state: GameState): number | null {
  // returns newly reached zone id (max) or null
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
    }, 400);
  }, []);

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

  // ---- 1 s tick ----
  useEffect(() => {
    if (!booted) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      const now = Date.now();
      applyEnergyRegen(s, now);
      tickNpcs(s, now);
      s.lastTickAt = now;
      // exploration completion
      if (s.exploration && now >= s.exploration.finishAt) {
        const outcome = rollExploration(s, s.exploration.zoneId);
        applyOutcome(s, outcome, s.exploration.startedAt);
        s.exploration = null;
        void saveGame(s);
        toast.success("EXPLORACIÓN COMPLETADA", {
          description: outcomeSummary(outcome),
          duration: 5000,
        });
      }
      s.lastTickAt = now;
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

  function applyOutcome(s: GameState, outcome: ReturnType<typeof rollExploration>, startedAt: number) {
    const zone = getZone(outcome.zoneId);
    s.exp += outcome.exp;
    s.expTotal += outcome.exp;
    for (const f of outcome.findings) {
      if (f.kind === "resource" && f.resource) {
        const amount = f.amount ?? 0;
        if (f.resource === "comida") s.foodMin += amount;
        else if (f.resource === "agua") s.waterMin += amount;
        else s.resources[f.resource] += amount;
        const isTime = f.resource === "comida" || f.resource === "agua";
        pushLog(s, `${isTime ? `+${amount} min ${f.resource}` : `+${amount} ${f.resource === "dinero" ? "$" : f.resource}`}`, "resource", startedAt);
      } else if (f.kind === "damage") {
        s.health = Math.max(0, s.health - (f.damage ?? 0));
        pushLog(s, `${f.cause} · -${f.damage} Salud`, "damage", startedAt);
      } else if (f.kind === "npc" && f.npcId) {
        const seed = NPC_BY_ID[f.npcId];
        if (seed) {
          const npc: NpcSurvivor = {
            ...seed,
            assignedZoneId: null,
            discoveredAt: Date.now(),
            productionTotals: { materiales: 0, agua: 0, comida: 0, medicamentos: 0, componentes: 0, energia: 0, dinero: 0 },
          };
          s.npcs.push(npc);
          pushLog(s, `${npc.id} «${npc.alias}» se unió al refugio`, "npc", startedAt);
          toast.info("SUPERVIVIENTE ENCONTRADO", {
            description: `${npc.name} «${npc.alias}» · ${NPC_TYPE_MODIFIERS[npc.type].label}`,
            duration: 6000,
          });
        }
      }
    }
    if (outcome.findings.length === 0) {
      pushLog(s, "Sin hallazgos", "info", startedAt);
    }
    pushLog(s, `Exploración de ${zone.name} completada · +${outcome.exp} EXP`, "exp", startedAt);
    const newZone = computeZoneUnlocks(s);
    if (newZone != null && newZone > s.currentZoneId) {
      s.pendingZoneUnlock = newZone;
      pushLog(s, `Nueva zona desbloqueada: ${getZone(newZone).name}`, "zone", startedAt);
      toast.success("☢ NUEVA ZONA DESBLOQUEADA", {
        description: getZone(newZone).name,
        duration: 6000,
      });
    }
    s.explorationsDone += 1;
  }

  function outcomeSummary(outcome: ReturnType<typeof rollExploration>): string {
    const parts: string[] = [`+${outcome.exp} EXP`];
    for (const f of outcome.findings) {
      if (f.kind === "resource") parts.push(`+${f.amount} ${f.resource === "dinero" ? "$" : f.resource}`);
      else if (f.kind === "damage") parts.push(`${f.cause} · -${f.damage} Salud`);
      else if (f.kind === "npc") parts.push(`Superviviente ${f.npcId}`);
    }
    if (outcome.findings.length === 0) parts.push("Sin hallazgos");
    return parts.join(" · ");
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
    await deleteSave();
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
        if (s.exploration) return;
        if (currentEnergy(s, now) < 1) {
          toast.error("Sin energía", { description: "Espera a que se regenere." });
          return;
        }
        if (s.health <= 0) {
          toast.error("Salud crítica", { description: "Usa medicina antes de explorar." });
          return;
        }
        spendEnergy(s, 1, now);
        const minutes = getZone(zoneId).explorationMinutes;
        s.currentZoneId = zoneId;
        s.exploration = { zoneId, startedAt: now, finishAt: now + minutes * 60000 };
        pushLog(s, `Exploración iniciada en ${getZone(zoneId).name}`, "info", now);
      });
    },
    [setAndSave],
  );

  const collectExploration = useCallback(() => {
    setAndSave((s) => {
      const now = Date.now();
      if (!s.exploration || now < s.exploration.finishAt) return;
      const outcome = rollExploration(s, s.exploration.zoneId);
      applyOutcome(s, outcome, s.exploration.startedAt);
      s.exploration = null;
      toast.success("EXPLORACIÓN COMPLETADA", { description: outcomeSummary(outcome), duration: 5000 });
    });
  }, [setAndSave]);

  const setCurrentZone = useCallback(
    (zoneId: number) => {
      setAndSave((s) => {
        const maxUnlocked = computeZoneUnlocks(s);
        if (maxUnlocked != null && zoneId <= maxUnlocked) {
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
          const oldZone = stateRef.current?.zones[Number(npc.assignedZoneId)];
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
            pushLog(s, `${npc.id} asignado a ${getZone(zoneId).name}`, "npc");
          }
        } else if (npcWasAssigned) {
          pushLog(s, `${npc.id} sin asignación`, "npc");
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
      startExploration,
      collectExploration,
      setCurrentZone,
      assignNpc,
      upgradeBuilding,
      useMedicine,
      buyResource,
      rollOptions,
      rerollSurvivors,
    }),
    [state, booted, hasSaveFile, screen, setNavigator, startNewGame, continueGame, eraseSave, startExploration, collectExploration, setCurrentZone, assignNpc, upgradeBuilding, useMedicine, buyResource, rollOptions, rerollSurvivors],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// Re-export helpers used by UI
export { STAT_RESOURCE, npcProductionMultiplier, SURVIVOR_MAX_ROLLS, rollSurvivor };
