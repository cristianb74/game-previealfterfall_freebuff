import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import { getZone, zoneImage } from "@/game/zones";
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
  const { state, startExploration, useMedicine, setScreen } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const now = Date.now();
  const zone = getZone(state.currentZoneId);
  // Per-zone: check if THIS zone is exploring
  const currentExploration = state.explorationStates[state.currentZoneId];
  const isCurrentExploring = currentExploration != null;
  const remaining = isCurrentExploring ? currentExploration.finishAt - now : 0;
  const pct = isCurrentExploring
    ? Math.max(0, Math.min(100, ((now - currentExploration.startedAt) / (currentExploration.finishAt - currentExploration.startedAt)) * 100))
    : 0;
  const energy = currentEnergy(state, now);
  // Can explore if this zone is not already exploring, has energy, and has health
  const canExplore = !isCurrentExploring && energy >= 1 && state.health > 0;
  // Energy regen countdown (ms until next +1)
  const msSinceLastRegen = Math.max(0, now - state.lastEnergyRegenAt);
  const msPerPoint = BALANCE.energyRegenMinutesPerPoint * 60000;
  const msUntilNext = energy < 1 ? Math.max(0, msPerPoint - msSinceLastRegen) : 0;
  const nextRegenMMSS = `${String(Math.floor(msUntilNext / 60000)).padStart(2, "0")}:${String(Math.floor((msUntilNext % 60000) / 1000)).padStart(2, "0")}`;

  const log = state.log.slice(0, 3);
  // Show all active manual explorations across zones
  const activeExplorations = Object.keys(state.explorationStates).map(Number).filter((zid) => state.explorationStates[zid]);
  // Show running auto-farms across all zones
  const activeAutoFarms = Object.keys(state.autoFarms ?? {}).map(Number).filter((zid) => state.autoFarms[zid]);

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

          {isCurrentExploring ? (
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
                {new Date(currentExploration.finishAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}.
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
                  ? `Sin energía · próxima carga en ${nextRegenMMSS}`
                  : "Explorar"}
            </Button>
          )}

          {/* Show all active manual explorations across zones */}
          {activeExplorations.length > 1 && (
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                Otras exploraciones activas
              </p>
              {activeExplorations.filter((zid) => zid !== state.currentZoneId).map((zid) => {
                const run = state.explorationStates[zid]!;
                return (
                  <div key={zid} className="flex items-center justify-between gap-2 rounded-md border border-green-900/40 bg-green-950/10 px-3 py-1.5">
                    <p className="min-w-0 text-[10px] leading-4 text-zinc-400">
                      <span className="font-bold uppercase tracking-wider text-green-500">Z{String(zid).padStart(2, "0")}</span>
                      <span className="ml-1 truncate">{getZone(zid).name}</span>
                    </p>
                    <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-green-400">
                      {fmtCountdown(run.finishAt - now)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* active auto-farm status for all zones */}
          {activeAutoFarms.length > 0 && (
            <div className="flex flex-col gap-1">
              {activeAutoFarms.map((zid) => {
                const run = state.autoFarms[zid]!;
                return (
                  <div key={zid} className="flex items-center justify-between gap-2 rounded-md border border-green-900/40 bg-green-950/10 px-3 py-1.5">
                    <p className="min-w-0 text-[10px] leading-4 text-zinc-400">
                      <span className="font-bold uppercase tracking-wider text-green-500">▶ Auto</span>
                      <span className="ml-1 truncate">{getZone(zid).name}</span>
                    </p>
                    <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-green-400">
                      {fmtCountdown(run.finishAt - now)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* NPC counter display */}
          <div className="rounded-md border border-zinc-800 bg-[#0d0f10] px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">
              NPC · {state.explorationsSinceLastNPC ?? 0} exploraciones desde último NPC
            </p>
            <p className="text-[10px] text-zinc-500">
              Próximo chance: {((state.explorationsSinceLastNPC ?? 0) < 50 ? "exploración #50" : `${Math.round(((state.explorationsSinceLastNPC ?? 0) < 100 ? 0.01 : (state.explorationsSinceLastNPC ?? 0) < 150 ? 0.02 : (state.explorationsSinceLastNPC ?? 0) < 200 ? 0.04 : 1) * 100)}%`)}
            </p>
          </div>
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
          onClick={() => setScreen("registro")}
          className="mt-2 text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400"
        >
          Ver registro completo →
        </button>
      </section>
    </div>
  );
}
