import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { returnToZonasWithScroll } from "@/pages/Game";
import { useGame } from "@/game/GameProvider";
import {
  activeThematicConstructions,
  buildingUpgradeCost,
  buildingUpgradeMinutes,
  THEMATIC_BY_ZONE,
  THEMATIC_BY_KEY,
  thematicBonus,
} from "@/game/buildings";
import { BALANCE } from "@/game/balance";
import { vnow } from "@/game/virtualClock";
import { RESOURCE_META } from "@/game/resources";
import { getZone, zoneFocusBonus, zoneImage } from "@/game/zones";
import type { ResourceKey, Screen } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Shared cost breakdown: "need icon (have)" rows — amber when affordable,
 *  red when short. */
function CostBreakdown({
  cost,
}: {
  cost: { materiales: number; componentes: number };
}) {
  const { state } = useGame();
  if (!state) return null;
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
              have >= need ? "text-amber-400" : "text-red-400",
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

/** INSTALACIONES — per-zone THEMATIC buildings (1–2). LOCAL bonus: they
 *  only boost finds in their own zone. Reached via double-tap on a zone
 *  card or from the global Base header. Amber tone to distinguish from
 *  the green global Base tab. */
export function InstalacionesTab({
  /** Where the visible "← Volver" button returns; the Game passes
   *  "zonas" when opened from a zone card so the list scroll position
   *  saved before entering is restored. */
  returnScreen = "base",
}: {
  returnScreen?: Screen;  } = {}) {
  const { state, upgradeThematicBuilding, setScreen, savedZonasScrollRef } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const zoneId = state.currentZoneId;
  const zoneDef = getZone(zoneId);
  const defs = THEMATIC_BY_ZONE[zoneId] ?? [];
  const zoneBusy =
    activeThematicConstructions(state.zones[zoneId]) >=
    BALANCE.maxConcurrentConstructionsPerZone;

  return (
    <div className="flex flex-col gap-3">
      {/* Zone identification header (amber tone = zone-local) */}
      <div className="rounded-lg border border-amber-900/50 bg-[#12100c] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <img
            src={zoneImage(zoneId)}
            alt={zoneDef.name}
            className="size-12 shrink-0 rounded-md border border-amber-900/40 object-cover"
            loading="lazy"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-subtle">
                Instalaciones
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500">
                Zona {String(zoneId).padStart(2, "0")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm font-bold text-amber-100">{zoneDef.name}</p>
            <p className="mt-0.5 text-[9px] text-subtle">
              Los bonus de estas instalaciones aplican SOLO en esta zona.
            </p>
          </div>
        </div>
        {/* Zone specialization banner */}
        <div className="mt-2 flex items-center gap-2 rounded-sm border border-amber-900/40 bg-amber-950/20 px-2 py-1.5">
          <span className="text-sm">{RESOURCE_META[zoneDef.focus].icon}</span>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">
              Especialidad de la zona · {RESOURCE_META[zoneDef.focus].label}
            </p>
            <p className="text-[9px] text-subtle">
              Los hallazgos de {RESOURCE_META[zoneDef.focus].label} aquí son +
              {Math.round(zoneFocusBonus(zoneId) * 100)}% (exploración y NPC)
            </p>
          </div>
        </div>
        {/* Explicit back button: restores the Zonas list scroll position
            saved before entering this detail view (see returnToZonasWithScroll). */}
        <button
          type="button"
          onClick={() =>
            returnScreen === "zonas"
              ? returnToZonasWithScroll(setScreen, savedZonasScrollRef)
              : setScreen(returnScreen)
            }
          className="mt-2 flex items-center gap-1 self-start rounded-sm border border-amber-900/50 bg-amber-950/30 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300 transition-colors hover:border-amber-500/60 hover:bg-amber-900/40 hover:text-amber-200"
        >
          ← Volver a Zonas
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {defs.map((def) => {
          const b = state.zones[zoneId]?.thematic?.[def.key] ?? {
            key: def.key,
            level: 0,
            upgradeFinishAt: null,
          };
          const busy = b.upgradeFinishAt != null;
          const quotaBlocked = zoneBusy && !busy;
          const shownAvailable = !quotaBlocked;
          const remaining = busy ? (b.upgradeFinishAt as number) - vnow() : 0;
          const cost = buildingUpgradeCost(b.level);
          const maxed = b.level >= BALANCE.buildingMaxLevel;
          const canAfford =
            state.resources.materiales >= cost.materiales &&
            state.resources.componentes >= cost.componentes;
          const minutes = buildingUpgradeMinutes(b.level);
          const resMeta = RESOURCE_META[def.specializes as ResourceKey];

          return (
            <section
              key={def.key}
              className={cn(
                "rounded-lg border bg-[#12100c] p-3",
                shownAvailable ? "border-amber-900/50" : "border-amber-900/30 opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{def.icon}</span>
                    <h3 className="text-sm font-bold text-amber-200">{def.name}</h3>
                    <span
                      className={cn(
                        "rounded-sm px-1 text-[9px] font-black",
                        b.level > 0 ? "bg-amber-500 text-black" : "bg-zinc-800 text-subtle",
                      )}
                    >
                      N{b.level}
                    </span>
                    <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                      Solo Z{String(zoneId).padStart(2, "0")}
                    </span>
                    {quotaBlocked && (
                      <span className="rounded-sm bg-amber-950/60 px-1 text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        Zona ocupada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-subtle">{def.description}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-subtle">
                    Bonus actual:{" "}
                    <span className="text-amber-400">
                      +{Math.round(thematicBonus(b.level) * 100)}% {resMeta.label}
                    </span>
                    {!maxed && (
                      <span className="text-subtle">
                        {" "}
                        → siguiente +
                        {Math.round(thematicBonus(b.level + 1) * 100)}%
                      </span>
                    )}
                  </p>
                </div>

                {shownAvailable && (
                  <div className="shrink-0 text-right">
                    {busy ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-sm font-bold tabular-nums text-amber-400">
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
                      <span className="text-[10px] font-bold uppercase text-amber-600">Máx</span>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        <CostBreakdown cost={cost} />
                        <Button
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => upgradeThematicBuilding(zoneId, def.key)}
                          className="border border-amber-500/40 bg-amber-600/90 font-bold uppercase tracking-wider text-black hover:bg-amber-500"
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

      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3 text-[10px] leading-5 text-subtle">
        <p>
          Las instalaciones son propias de cada zona: potencian los hallazgos
          de su recurso solo aquí, apilándose con la Base global (tab 🏗).
        </p>
      </section>
    </div>
  );
}

// Re-export so Registro/Base can resolve thematic names without importing
// internals directly.
export { THEMATIC_BY_KEY };
