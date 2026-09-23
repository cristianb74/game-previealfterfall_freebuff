import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import {
  activeConstructionsInBase,
  BUILDING_BY_KEY,
  buildingBonus,
  buildingUpgradeCost,
  buildingUpgradeMinutes,
  CORE_BUILDING_GATE_ZONE,
} from "@/game/buildings";
import { BALANCE } from "@/game/balance";
import { vnow } from "@/game/virtualClock";
import { RESOURCE_META } from "@/game/resources";
import { getZone } from "@/game/zones";
import type { BuildingKey } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Shared cost breakdown: "need icon (have)" rows — green/amber when the
 *  player can afford it, red when short. */
function CostBreakdown({
  cost,
  tone,
}: {
  cost: { materiales: number; componentes: number };
  tone: "green" | "amber";
}) {
  const { state } = useGame();
  if (!state) return null;
  const toneClass = tone === "green" ? "text-green-500" : "text-amber-400";
  return (
    <div className="flex flex-col items-end gap-0.5">
      {(["materiales", "componentes"] as const).map((rKey) => {
        const have = Math.floor(state.resources[rKey]);
        const need = cost[rKey];
        return (
          <span
            key={rKey}
            className={cn(
              "flex items-center gap-1 font-mono text-[10px] font-bold tabular-nums",
              have >= need ? toneClass : "text-red-400",
            )}
          >
            {need} {RESOURCE_META[rKey].icon}
            <span className="text-[9px] font-normal text-subtle">({have})</span>
          </span>
        );
      })}
    </div>
  );
}

const BUILDING_ORDER: BuildingKey[] = [
  "cocina",
  "tanque",
  "almacen",
  "enfermeria",
  "taller",
  "generador",
];

/** GLOBAL BASE — the 6 core buildings, one shared instance for the whole
 *  character. Their bonus applies in EVERY zone. Zone-specific thematic
 *  buildings live in the per-zone Instalaciones view. */
export function BaseTab() {
  const { state, upgradeBaseBuilding, setScreen } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;

  // GLOBAL base construction quota.
  const baseBusy =
    activeConstructionsInBase(state.base) >= BALANCE.maxConcurrentConstructionsInBase;
  const currentZoneId = state.currentZoneId;

  return (
    <div className="flex flex-col gap-3">
      {/* Prominent global-base header */}
      <div className="rounded-lg border border-green-900/40 bg-[#0d1210] px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-subtle">
            Refugio
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            ·
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-green-500">
            Base global
          </span>
        </div>
        <p className="mt-0.5 text-sm font-bold text-zinc-200">Edificios comunes del refugio</p>
        <p className="mt-0.5 text-[9px] text-subtle">
          Los bonus de estos 6 edificios aplican en TODAS las zonas.
        </p>
        <button
          type="button"
          onClick={() => setScreen("instalaciones")}
          className="mt-2 flex w-full items-center gap-2 rounded-sm border border-amber-900/40 bg-amber-950/20 px-2 py-1.5 text-left transition-colors hover:border-amber-700/60"
        >
          <span className="text-sm">🏗</span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">
              Instalaciones de zona · {getZone(currentZoneId).name}
            </p>
            <p className="text-[9px] text-subtle">
              Edificios temáticos que solo benefician a su zona (doble toque en la tarjeta) ›
            </p>
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {BUILDING_ORDER.map((key) => {
          const def = BUILDING_BY_KEY[key];
          const b = state.base[key];
          const idx = BUILDING_ORDER.indexOf(key);
          const prevKey = idx > 0 ? BUILDING_ORDER[idx - 1] : null;

          // Availability: gate zone reached + sequential unlock (previous N1+).
          const gateZone = CORE_BUILDING_GATE_ZONE[key];
          const gateUnlocked =
            gateZone == null || state.expTotal >= getZone(gateZone).unlockExp;
          const sequentialOk =
            prevKey === null || (state.base[prevKey]?.level ?? 0) >= 1;

          const busy = b.upgradeFinishAt != null;
          // Base at construction quota: block visually too (not when THIS
          // building is the one constructing — countdown still shows).
          const quotaBlocked = baseBusy && !busy;
          const shownAvailable = gateUnlocked && sequentialOk && !quotaBlocked;
          const remaining = busy ? (b.upgradeFinishAt as number) - vnow() : 0;
          const cost = buildingUpgradeCost(b.level);
          const maxed = b.level >= BALANCE.buildingMaxLevel;
          const canAfford =
            state.resources.materiales >= cost.materiales &&
            state.resources.componentes >= cost.componentes;
          const minutes = buildingUpgradeMinutes(b.level);
          const nextBonus = `+${Math.round(buildingBonus(b.level + 1) * 100)}%`;

          return (
            <section
              key={key}
              className={cn(
                "rounded-lg border bg-[#101213] p-3",
                shownAvailable
                  ? "border-zinc-800"
                  : "border-zinc-800/50 opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{def.icon}</span>
                    <h3 className="text-sm font-bold text-zinc-100">
                      {def.name}
                    </h3>
                    <span
                      className={cn(
                        "rounded-sm px-1 text-[9px] font-black",
                        b.level > 0
                          ? "bg-green-600/90 text-black"
                          : "bg-zinc-800 text-subtle",
                      )}
                    >
                      N{b.level}
                    </span>
                    <span className="rounded-sm bg-zinc-900 px-1 text-[8px] uppercase tracking-wider text-subtle">
                      Global
                    </span>
                    {!gateUnlocked && (
                      <span className="rounded-sm bg-zinc-900 px-1 text-[8px] uppercase tracking-wider text-subtle">
                        Requiere Zona {String(gateZone).padStart(2, "0")}
                      </span>
                    )}
                    {gateUnlocked && !sequentialOk && (
                      <span className="rounded-sm bg-zinc-900 px-1 text-[8px] uppercase tracking-wider text-subtle">
                        Desbloquea {BUILDING_BY_KEY[prevKey as BuildingKey].name}
                      </span>
                    )}
                    {gateUnlocked && sequentialOk && quotaBlocked && (
                      <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        Base ocupada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-subtle">
                    {def.description}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-subtle">
                    Bonus actual:{" "}
                    <span className="text-green-500">
                      +{Math.round(buildingBonus(b.level) * 100)}%
                    </span>
                    <span className="text-subtle"> en todas las zonas</span>
                    {!maxed && (
                      <span className="text-subtle">
                        {" "}
                        → siguiente {nextBonus}
                      </span>
                    )}
                  </p>
                </div>

                {shownAvailable && (
                  <div className="shrink-0 text-right">
                    {busy ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-bold tabular-nums text-green-400">
                          {fmtCountdown(remaining)}
                        </span>
                        <Progress
                          value={Math.max(
                            0,
                            Math.min(
                              100,
                              100 - (remaining / (minutes * 60000)) * 100,
                            ),
                          )}
                          className="h-1.5 w-20 bg-zinc-800"
                        />
                      </div>
                    ) : maxed ? (
                      <span className="text-[10px] font-bold uppercase text-green-600">
                        Máx
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        <CostBreakdown cost={cost} tone="green" />
                        <Button
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => upgradeBaseBuilding(key)}
                          className="border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-wider text-black hover:bg-green-500"
                        >
                          <span className="block text-[10px] leading-tight">
                            Mejorar
                            <span className="block font-mono text-[9px] font-bold opacity-80">
                              {minutes} min
                            </span>
                          </span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3 text-[11px] leading-5 text-subtle">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Inventario
        </p>
        <button
          type="button"
          onClick={() => setScreen("mochila")}
          className="w-full rounded-sm text-left transition-colors hover:text-zinc-300"
        >
          ⚒ {Math.floor(state.resources.materiales)} Materiales · ✚{" "}
          {Math.floor(state.resources.medicamentos)} Medicamentos · ⚙{" "}
          {Math.floor(state.resources.componentes)} Componentes ·{" "}
          <span className="text-green-500">
            $ {Math.floor(state.resources.dinero)}
          </span>
          <span className="ml-1 text-[9px] uppercase tracking-wider text-subtle">
            ver Mochila ›
          </span>
        </button>
        <p className="mt-1 text-[10px] text-subtle">
          Las construcciones usan solo Materiales y Componentes. Nunca Comida
          ni Agua.
        </p>
      </section>
    </div>
  );
}
