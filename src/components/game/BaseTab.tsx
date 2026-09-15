import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import { BUILDING_BY_KEY, buildingBonus, buildingUpgradeCost, buildingUpgradeMinutes } from "@/game/buildings";
import { ZONE_BUILDING_MAP } from "@/game/zones";
import { BALANCE } from "@/game/balance";
import { RESOURCE_META } from "@/game/resources";
import type { BuildingKey } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const { state, upgradeBuilding, setScreen } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const zoneId = state.currentZoneId;
  const zoneState = state.zones[zoneId];
  const availableKey = ZONE_BUILDING_MAP[zoneId] as BuildingKey | undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Construcciones de la zona {String(zoneId).padStart(2, "0")} · cada zona mejora por separado
      </p>

      <div className="flex flex-col gap-2">
        {BUILDING_ORDER.map((key) => {
          const def = BUILDING_BY_KEY[key];
          const b = zoneState.buildings[key];
          const available = availableKey === key;
          const busy = b.upgradeFinishAt != null;
          const remaining = busy ? (b.upgradeFinishAt as number) - Date.now() : 0;
          const cost = buildingUpgradeCost(b.level);
          const maxed = b.level >= BALANCE.buildingMaxLevel;
          const canAfford =
            state.resources.materiales >= cost.materiales &&
            state.resources.componentes >= cost.componentes;
          const minutes = buildingUpgradeMinutes(b.level);
          const nextBonus = `+${Math.round((buildingBonus(b.level + 1) * 100))}%`;

          return (
            <section
              key={key}
              className={cn(
                "rounded-lg border bg-[#101213] p-3",
                available ? "border-zinc-800" : "border-zinc-800/50 opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{def.icon}</span>
                    <h3 className="text-sm font-bold text-zinc-100">{def.name}</h3>
                    <span
                      className={cn(
                        "rounded-sm px-1 text-[9px] font-black",
                        b.level > 0 ? "bg-green-600/90 text-black" : "bg-zinc-800 text-zinc-500",
                      )}
                    >
                      N{b.level}
                    </span>
                    {!available && (
                      <span className="rounded-sm bg-zinc-900 px-1 text-[8px] uppercase tracking-wider text-zinc-600">
                        No disponible aquí
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">{def.description}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                    Bonus actual:{" "}
                    <span className="text-green-500">+{Math.round(buildingBonus(b.level) * 100)}%</span>
                    {!maxed && <span className="text-zinc-500"> → siguiente {nextBonus}</span>}
                  </p>
                </div>

                {available && (
                  <div className="shrink-0 text-right">
                    {busy ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-bold tabular-nums text-green-400">
                          {fmtCountdown(remaining)}
                        </span>
                        <Progress
                          value={Math.max(
                            0,
                            Math.min(100, 100 - (remaining / (minutes * 60000)) * 100),
                          )}
                          className="h-1.5 w-20 bg-zinc-800"
                        />
                      </div>
                    ) : maxed ? (
                      <span className="text-[10px] font-bold uppercase text-green-600">Máx</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        {/* required resources for this upgrade */}
                        <div className="flex flex-col items-end gap-0.5">
                          {([
                            { key: "materiales" as const, need: cost.materiales, have: Math.floor(state.resources.materiales) },
                            { key: "componentes" as const, need: cost.componentes, have: Math.floor(state.resources.componentes) },
                          ]).map(({ key, need, have }) => (
                            <span
                              key={key}
                              className={cn(
                                "flex items-center gap-1 font-mono text-[10px] font-bold tabular-nums",
                                have >= need ? "text-green-500" : "text-red-400",
                              )}
                            >
                              {need} {RESOURCE_META[key].icon}
                              <span className="text-[9px] font-normal text-zinc-600">({have})</span>
                            </span>
                          ))}
                        </div>
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

      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3 text-[11px] leading-5 text-zinc-500">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-300">Inventario</p>
        <button
          type="button"
          onClick={() => setScreen("mochila")}
          className="w-full rounded-sm text-left transition-colors hover:text-zinc-300"
        >
          ⚒ {Math.floor(state.resources.materiales)} Materiales · ✚ {Math.floor(state.resources.medicamentos)} Medicamentos · ⚙{" "}
          {Math.floor(state.resources.componentes)} Componentes · <span className="text-green-500">$ {Math.floor(state.resources.dinero)}</span>
          <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-600">ver Mochila ›</span>
        </button>
        <p className="mt-1 text-[10px] text-zinc-600">
          Las construcciones usan solo Materiales y Componentes. Nunca Comida ni Agua.
        </p>
      </section>
    </div>
  );
}
