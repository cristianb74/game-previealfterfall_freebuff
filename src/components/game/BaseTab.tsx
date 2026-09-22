import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import {
  activeConstructionsInZone,
  BUILDING_BY_KEY,
  buildingBonus,
  buildingUpgradeCost,
  buildingUpgradeMinutes,
  EXCLUSIVE_BUILDING_BY_ZONE,
  exclusiveBuildingBonus,
} from "@/game/buildings";
import { BALANCE } from "@/game/balance";
import { vnow } from "@/game/virtualClock";
import { RESOURCE_META } from "@/game/resources";
import { getZone, zoneFocusBonus } from "@/game/zones";
import type { BuildingKey } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Shared cost breakdown: "need icon (have)" rows — green/amber when the
 *  player can afford it, red when short. Used by core and exclusive cards. */
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

export function BaseTab() {
  const { state, upgradeBuilding, upgradeExclusiveBuilding, setScreen } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const zoneId = state.currentZoneId;
  const zoneState = state.zones[zoneId];
  const zoneDef = getZone(zoneId);

  // Per-zone construction quota (core + exclusive buildings share it).
  // When the zone is busy, new upgrades are blocked — cards must show it.
  const zoneBusy =
    activeConstructionsInZone(zoneState) >= BALANCE.maxConcurrentConstructionsPerZone;

  // Zone-exclusive building (host zones only).
  const exclDef = EXCLUSIVE_BUILDING_BY_ZONE[zoneId];
  const excl = zoneState.exclusiveBuilding ?? (exclDef ? { key: exclDef.key, level: 0, upgradeFinishAt: null } : undefined);
  const exclBusy = excl?.upgradeFinishAt != null;
  const exclRemaining = exclBusy ? (excl!.upgradeFinishAt as number) - vnow() : 0;
  const exclMaxed = (excl?.level ?? 0) >= BALANCE.buildingMaxLevel;
  const exclCost = buildingUpgradeCost(excl?.level ?? 0);
  const exclAfford =
    state.resources.materiales >= exclCost.materiales &&
    state.resources.componentes >= exclCost.componentes;
  const exclMinutes = buildingUpgradeMinutes(excl?.level ?? 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Prominent zone identification header */}
      <div className="rounded-lg border border-zinc-800/70 bg-[#101213] px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-subtle">
            Base
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            ·
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-green-500">
            Zona {String(zoneId).padStart(2, "0")}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-bold text-zinc-200">{zoneDef.name}</p>
        <p className="mt-0.5 text-[9px] text-subtle">
          Las construcciones y sus bonus pertenecen únicamente a esta zona.
        </p>
        {/* Zone specialization banner */}
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-green-900/40 bg-green-950/20 px-2 py-1.5">
          <span className="text-sm">{RESOURCE_META[zoneDef.focus].icon}</span>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-green-500">
              Especialidad de la zona · {RESOURCE_META[zoneDef.focus].label}
            </p>
            <p className="text-[9px] text-subtle">
              Los hallazgos de {RESOURCE_META[zoneDef.focus].label} aquí son +
              {Math.round(zoneFocusBonus(zoneId) * 100)}% (exploración y NPC)
            </p>
          </div>
        </div>
      </div>

      {/* Exclusive building (host zones only) */}
      {exclDef && excl && (
        <section
          className={cn(
            "rounded-lg border bg-[#12100c] p-3",
            !exclBusy && zoneBusy
              ? "border-amber-900/30 opacity-50"
              : "border-amber-900/50",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base">{exclDef.icon}</span>
                <h3 className="text-sm font-bold text-amber-200">{exclDef.name}</h3>
                <span
                  className={cn(
                    "rounded-sm px-1 text-[9px] font-black",
                    excl.level > 0
                      ? "bg-amber-500 text-black"
                      : "bg-zinc-800 text-subtle",
                  )}
                >
                  N{excl.level}
                </span>
                <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                  Exclusivo Z{String(zoneId).padStart(2, "0")}
                </span>
                {!exclBusy && zoneBusy && (
                  <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                    Zona ocupada
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-subtle">{exclDef.description}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-subtle">
                Bonus actual:{" "}
                <span className="text-amber-400">
                  +{Math.round(exclusiveBuildingBonus(excl.level) * 100)}%
                </span>
                {!exclMaxed && (
                  <span className="text-subtle">
                    {" "}
                    → siguiente +{Math.round(exclusiveBuildingBonus(excl.level + 1) * 100)}%
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {exclBusy ? (
                <span className="font-mono text-sm font-bold tabular-nums text-amber-400">
                  {fmtCountdown(exclRemaining)}
                </span>
              ) : exclMaxed ? (
                <span className="text-[10px] font-bold uppercase text-amber-600">Máx</span>
              ) : zoneBusy ? (
                <span className="text-[8px] font-bold uppercase tracking-wider text-amber-500">
                  Zona ocupada
                </span>
              ) : (
                <div className="flex flex-col items-end gap-1.5">
                  <CostBreakdown cost={exclCost} tone="amber" />
                  <Button
                    size="sm"
                    disabled={!exclAfford}
                    onClick={() => upgradeExclusiveBuilding(zoneId)}
                    className="border border-amber-500/40 bg-amber-600/90 font-bold uppercase tracking-wider text-black hover:bg-amber-500"
                  >
                    <span className="block text-[10px] leading-tight">
                      Mejorar
                      <span className="block font-mono text-[9px] font-bold opacity-80">
                        {exclMinutes} min
                      </span>
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {BUILDING_ORDER.map((key) => {
          const def = BUILDING_BY_KEY[key];
          const b = zoneState.buildings[key];
          const idx = BUILDING_ORDER.indexOf(key);
          const prevKey = idx > 0 ? BUILDING_ORDER[idx - 1] : null;
          const available =
            prevKey === null ||
            (zoneState.buildings[prevKey]?.level ?? 0) >= 1;
          const busy = b.upgradeFinishAt != null;
          // Zone at construction quota: block visually too (not when THIS
          // building is the one constructing — countdown still shows).
          const quotaBlocked = zoneBusy && !busy;
          const shownAvailable = available && !quotaBlocked;
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
                    {!available && (
                      <span className="rounded-sm bg-zinc-900 px-1 text-[8px] uppercase tracking-wider text-subtle">
                        No disponible aquí
                      </span>
                    )}
                    {available && quotaBlocked && (
                      <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        Zona ocupada
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
                          onClick={() => upgradeBuilding(zoneId, key)}
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
