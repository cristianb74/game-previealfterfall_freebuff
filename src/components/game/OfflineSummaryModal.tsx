import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BALANCE } from "@/game/balance";
import { offlineDeltaLabel } from "@/game/offlineProgress";
import { useGame } from "@/game/GameProvider";

function fmtAway(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0) return `${h} h ${rem} min`;
  return `${rem} min`;
}

/** Boot-time modal: a clear summary of what happened while away. */
export function OfflineSummaryModal() {
  const { state, offlineSummary, dismissOfflineSummary } = useGame();
  if (!offlineSummary) return null;
  const s = offlineSummary;

  const expDelta = state ? Math.max(0, Math.round(s.expEarned)) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && dismissOfflineSummary()}>
      <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="tracking-wider text-zinc-100">
            BIENVENIDO DE VUELTA
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Estuviste fuera {fmtAway(s.minutesAway)}
            {s.capped ? ` — el progreso se limitó a ${BALANCE.offlineCapHours} h` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Cap notice */}
        {s.capped && (
          <div className="rounded-md border border-amber-800/40 bg-amber-950/20 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              Tope de {BALANCE.offlineCapHours} h alcanzado
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">
              El consumo y la producción durante el resto de tu ausencia no se
              contabilizaron. La energía sí se recuperó completa.
            </p>
          </div>
        )}

        {/* Exploration results */}
        <div className="rounded-md border border-white/5 bg-black/40 p-3">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
            Exploraciones
          </p>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-zinc-500">Completadas</span>
            <span className="font-bold text-zinc-200">{s.explorationsCompleted}</span>
          </div>
          {expDelta > 0 && (
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-500">EXP de auto-farm</span>
              <span className="font-bold text-green-400">+{expDelta}</span>
            </div>
          )}
          {s.energyGained >= 1 && (
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-500">Energía recuperada</span>
              <span className="font-bold text-green-400">+{s.energyGained}</span>
            </div>
          )}
          {s.npcFindsCount > 0 && (
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-500">Hallazgos del equipo</span>
              <span className="font-bold text-purple-400">{s.npcFindsCount}</span>
            </div>
          )}
        </div>

        {/* Resource net deltas */}
        {s.resourceDeltas.length > 0 && (
          <div className="rounded-md border border-white/5 bg-black/40 p-3">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              Recursos (neto)
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              {s.resourceDeltas.map((d) => (
                <div key={d.resource} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-zinc-500">
                    {offlineDeltaLabel(d).replace(/^[+−]/, "")}
                  </span>
                  <span
                    className={
                      d.amount >= 0
                        ? "shrink-0 font-bold text-green-400"
                        : "shrink-0 font-bold text-red-400"
                    }
                  >
                    {offlineDeltaLabel(d).split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buildings */}
        {s.buildingsCompleted.length > 0 && (
          <div className="rounded-md border border-white/5 bg-black/40 p-3">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              Construcciones terminadas
            </p>
            <ul className="flex flex-col gap-0.5 text-[11px] text-zinc-300">
              {s.buildingsCompleted.map((b, i) => (
                <li key={i}>🏗 {b}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Negative events: hunger/thirst */}
        {(s.hungerStruck || s.thirstStruck || s.healthLost >= 1) && (
          <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-red-400">
              Eventos negativos
            </p>
            {s.hungerStruck && (
              <p className="mt-1 text-[11px] text-zinc-400">
                🥫 La comida se agotó mientras no estabas.
              </p>
            )}
            {s.thirstStruck && (
              <p className="mt-1 text-[11px] text-zinc-400">
                💧 El agua se agotó mientras no estabas.
              </p>
            )}
            {s.healthLost >= 1 && (
              <p className="mt-1 text-[11px] text-zinc-400">
                ❤️‍🩹 Perdiste {Math.round(s.healthLost)} de salud por hambre/sed.
              </p>
            )}
          </div>
        )}

        <Button
          onClick={dismissOfflineSummary}
          className="h-10 w-full border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
        >
          Continuar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
