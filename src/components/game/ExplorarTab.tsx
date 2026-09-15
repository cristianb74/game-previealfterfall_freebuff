import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import { getZone, frontierZoneId, zoneImage } from "@/game/zones";
import { currentEnergy } from "@/game/energySystem";
import { BALANCE } from "@/game/balance";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ExplorarTab() {
  const { state, startExploration, toggleAutoExplore, useMedicine, setScreen } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const now = Date.now();
  const zone = getZone(state.currentZoneId);
  const exploring = state.exploration != null;
  const remaining = state.exploration ? state.exploration.finishAt - now : 0;
  const pct = state.exploration
    ? Math.max(0, Math.min(100, ((now - state.exploration.startedAt) / (state.exploration.finishAt - state.exploration.startedAt)) * 100))
    : 0;
  const energy = currentEnergy(state, now);
  const canExplore = !exploring && energy >= 1 && state.health > 0;
  const farmZoneId = frontierZoneId(state) - 1;

  const log = state.log.slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-lg border border-zinc-800 bg-[#101213]">
        <div className="relative h-44 sm:h-56">
          <img
            src={zoneImage(zone.id)}
            alt={zone.name}
            className="absolute inset-0 size-full object-cover"
            style={{ objectFit: "cover" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101213] via-transparent to-transparent" />
          <div className="absolute bottom-2 left-3 right-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-green-500">
              Zona {String(zone.id).padStart(2, "0")} / 20
            </p>
            <h2 className="text-lg font-black uppercase tracking-wider text-zinc-100">{zone.name}</h2>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <p className="text-sm leading-5 text-zinc-400">{zone.description}</p>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-sm border border-white/5 bg-black/40 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">Duración</p>
              <p className="text-sm font-bold text-zinc-200">{zone.explorationMinutes} min</p>
            </div>
            <div className="rounded-sm border border-white/5 bg-black/40 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">EXP</p>
              <p className="text-sm font-bold text-green-500">+{zone.playerExpReward}</p>
            </div>
            <div className="rounded-sm border border-white/5 bg-black/40 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">Recursos</p>
              <p className="truncate text-sm font-bold text-zinc-200">{zone.resources.filter((r) => r !== "dinero").length} tipos</p>
            </div>
          </div>

          {/* auto-exploration toggle — background farm of the last conquered zone */}
          <button
            type="button"
            onClick={toggleAutoExplore}
            disabled={farmZoneId < 1}
            className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors",
              state.autoExplore
                ? "border-green-700/60 bg-green-950/30"
                : "border-zinc-800 bg-[#0d0f10] hover:border-zinc-700",
              farmZoneId < 1 && "cursor-not-allowed opacity-50",
            )}
          >
            <div>
              <p className={cn(
                "text-xs font-bold uppercase tracking-widest",
                state.autoExplore ? "text-green-500" : "text-zinc-300",
              )}>
                Exploración automática {state.autoExplore ? "· ACTIVA" : ""}
              </p>
              <p className="text-[10px] text-zinc-500">
                {farmZoneId < 1
                  ? "Conquista tu primera zona para activar la granja automática"
                  : state.autoExplore
                    ? "Tu última zona conquistada se explora sola en segundo plano (EXP reducida, sin energía)"
                    : "Mientras exploras la zona nueva, la anterior se farmea sola"}
              </p>
            </div>
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                state.autoExplore ? "bg-green-600" : "bg-zinc-700",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 size-4 rounded-full bg-zinc-200 transition-transform",
                  state.autoExplore ? "translate-x-4" : "translate-x-0",
                )}
              />
            </span>
          </button>

          {exploring ? (
            <div className="flex flex-col gap-2 rounded-md border border-green-900/50 bg-green-950/20 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-green-500">EXPLORANDO...</span>
                <span className="font-mono text-lg font-bold tabular-nums text-zinc-100">
                  {fmtCountdown(remaining)}
                </span>
              </div>
              <Progress value={pct} className="h-2 bg-zinc-800" />
              <p className="text-[10px] text-zinc-500">
                Puedes cerrar la app. La exploración termina sola a las{" "}
                {new Date(state.exploration!.finishAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}.
              </p>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={!canExplore}
              onClick={() => startExploration(zone.id)}
              className="h-12 border border-green-500/40 bg-green-600/90 text-base font-bold uppercase tracking-widest text-black hover:bg-green-500"
            >
              {state.health <= 0
                ? "Sin salud"
                : energy < 1
                  ? `Sin energía (${Math.ceil(1 - energy)} regenerando)`
                  : "Explorar"}
            </Button>
          )}

          {/* background farm status: the last conquered zone explores itself */}
          {state.autoExplore && farmZoneId >= 1 && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-green-900/40 bg-green-950/10 px-3 py-2">
              <p className="min-w-0 text-[11px] leading-4 text-zinc-400">
                <span className="font-bold uppercase tracking-wider text-green-500">Granja automática</span>
                <span className="block truncate">
                  {getZone(farmZoneId).name} · EXP reducida ({Math.round(BALANCE.autoExploreExpFactor * 100)}%)
                </span>
              </p>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-green-400">
                {state.autoRun ? fmtCountdown(state.autoRun.finishAt - now) : "—"}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* medicine */}
      <section className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-300">Salud</p>
          <p className="text-[10px] text-zinc-500">
            {Math.round(state.health)}/100 · {Math.floor(state.resources.medicamentos)} Medicamentos (1 = +1 Salud)
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={state.resources.medicamentos < 1 || state.health >= 100}
          onClick={useMedicine}
          className="border-zinc-700 text-zinc-200 hover:border-green-500/50 hover:text-green-400"
        >
          Usar medicina
        </Button>
      </section>

      {/* log */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Registro de exploración
        </h3>
        {log.length === 0 ? (
          <p className="text-xs text-zinc-600">Aún no hay eventos. Empieza a explorar.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {log.map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                  {new Date(e.t).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className={
                    e.kind === "damage"
                      ? "text-red-400"
                      : e.kind === "npc" || e.kind === "zone" || e.kind === "build"
                        ? "text-green-400"
                        : e.kind === "resource"
                          ? "text-zinc-300"
                          : "text-zinc-500"
                  }
                >
                  {e.msg}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => setScreen("perfil")}
          className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400"
        >
          Ver registro completo →
        </button>
      </section>
    </div>
  );
}
