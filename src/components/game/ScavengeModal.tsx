import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGame } from "@/game/GameProvider";
import { scavengePreview, scavengeTargetPoints } from "@/game/scavenge";
import { SCAVENGE_PINS, scavengeLocationForZone } from "@/game/scavengeLocations";
import { BALANCE } from "@/game/balance";
import type { ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

// ============================================================
// AFTERFALL — Scavenge minigame modal (8 fixed search points).
// Renders while state.scavengeEvent is active: an animated
// "¡Ubicación de Suministros Encontrada!" announcement, then the
// location image with the 8 search pins overlaid (same shared
// layout for all 5 locations). Each tap searches that spot: the
// result (loot/nada/daño) applies to the REAL state immediately
// and shows as an inline feedback line. Real-health damage is
// floored by the engine (never lethal inside the event). The
// player can quit anytime keeping everything already found.
// ============================================================

type Phase = "announce" | "playing";

function lootLabel(r: ResourceKey, amount: number): string {
  const isTime = r === "comida" || r === "agua";
  return `+${amount}${isTime ? " min" : ""} ${r === "dinero" ? "$" : r}`;
}

export function ScavengeModal() {
  const { state, searchScavenge, finishScavengeEvent, ignoreScavengeEvent } = useGame();
  const event = state?.scavengeEvent ?? null;
  const open = event != null;

  const [phase, setPhase] = useState<Phase>("announce");
  /** % de saqueo elegido (100 = comportamiento original: saquear todo). */
  const [pct, setPct] = useState<number>(100);
  /** Board index of the last searched point — the result itself is read
   *  from the (provider-updated) event board on the next render, so the
   *  feedback line always shows the fresh roll without stale closures. */
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  // Reset the local phase machine whenever a NEW event opens.
  const eventKey = event ? event.startedAt : 0;
  const [lastKey, setLastKey] = useState(0);
  if (open && eventKey !== lastKey) {
    setLastKey(eventKey);
    setPhase("announce");
    setLastIndex(null);
    setPct(100);
  }

  if (!event) return null;

  const loc = scavengeLocationForZone(event.zoneId);
  const health = state?.health ?? 0;
  const searched = event.board.filter((c) => c.result).length;
  const cleared = searched >= event.board.length;
  /** Saqueo parcial: cuántos puntos cubre el % elegido y qué se arriesga/gana
   *  (preview con los MISMOS pesos que usará el roll — se muestra antes de
   *  tocar cada punto). */
  const target = scavengeTargetPoints(event, pct);
  const preview = state ? scavengePreview(state, event, pct) : null;
  const objetivoAlcanzado = !cleared && searched >= target;
  const lastResult =
    lastIndex != null ? event.board[lastIndex]?.result ?? null : null;

  const onSearch = (index: number) => {
    setLastIndex(index);
    searchScavenge(index);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "max-w-md gap-3 overflow-hidden rounded-lg border-zinc-800 bg-[#101213] p-3 text-zinc-200 outline-none",
          phase === "announce" && "border-green-500/40 shadow-[0_0_50px_rgba(34,197,94,0.25)]",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {phase === "announce" && (
            <motion.div
              key="announce"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.08 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center gap-3 py-2 text-center"
            >
              <div className="flex size-14 items-center justify-center rounded-full border-2 border-green-500/70 bg-black/60 text-2xl shadow-[0_0_30px_rgba(34,197,94,0.35)]">
                ☢
              </div>
              <DialogTitle className="text-base font-black uppercase tracking-[0.2em] text-green-500">
                ¡Ubicación de Suministros Encontrada!
              </DialogTitle>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-200">{loc.name}</p>
              <p className="text-[11px] text-subtle">{loc.subtitle}</p>
              <Button
                onClick={() => setPhase("playing")}
                className="mt-1 h-10 w-full border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
              >
                Registrar ubicación
              </Button>
              {/* Opción 1 — Ignorar: el scavenger se va, nada se busca,
                  nada se consume (queda en el log de actividades). */}
              <Button
                onClick={ignoreScavengeEvent}
                variant="outline"
                className="h-8 w-full border-zinc-700 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Ignorar · no saquear nada
              </Button>
            </motion.div>
          )}

          {phase === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <DialogTitle className="text-sm font-black uppercase tracking-widest text-green-500">
                  {loc.name}
                </DialogTitle>
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs font-bold tabular-nums",
                    health <= 30 ? "text-red-400" : "text-zinc-100",
                  )}
                >
                  SALUD {Math.round(health)}/{BALANCE.maxHealth}
                </span>
              </div>

              {/* Background = the REAL location photo (/assets/scavenge/<focus>.jpg);
                  the 8 pins render ON TOP of it as an overlay. The per-point
                  status icons (✔/✖/−) are generated UI, the scene behind
                  them must always be the real artwork. If the JPG is ever
                  missing, onError swaps to the SVG fallback scene. */}
              <div className="relative w-full overflow-hidden rounded-md border border-zinc-800 bg-black">
                <img
                  src={loc.image}
                  alt={loc.name}
                  className="aspect-[1253/847] w-full select-none object-cover opacity-90"
                  draggable={false}
                  onError={(e) => {
                    // JPG not present yet → vector fallback scene.
                    const img = e.currentTarget;
                    if (!img.dataset.fallback) {
                      img.dataset.fallback = "1";
                      img.src = loc.fallbackImage;
                    }
                  }}
                />
                {SCAVENGE_PINS.map((pin, index) => {
                  const cell = event.board[index];
                  const result = cell?.result ?? null;
                  const isLast = lastIndex === index;
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      disabled={result != null}
                      onClick={() => onSearch(index)}
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      className={cn(
                        "absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-black transition-all",
                        result == null &&
                          "border-green-400/80 bg-black/70 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.5)] hover:scale-110 hover:bg-green-950/70 active:scale-95",
                        result?.kind === "loot" &&
                          "border-green-500 bg-green-600/90 text-black",
                        result?.kind === "nada" &&
                          "border-zinc-600 bg-zinc-900/90 text-zinc-500",
                        result?.kind === "dano" &&
                          "border-red-500 bg-red-600/90 text-white",
                        isLast && result != null && "scale-110",
                      )}
                    >
                      {result == null ? String(index + 1) : result.kind === "loot" ? "✔" : result.kind === "dano" ? "✖" : "–"}
                    </button>
                  );
                })}
              </div>

              {/* Inline feedback of the last search. */}
              <div className="min-h-[34px] rounded-md border border-white/5 bg-black/40 px-3 py-2 text-center text-[11px] leading-4">
                {!lastResult ? (
                  <span className="text-subtle">
                    Toca un punto marcado para revisarlo · {searched}/{event.board.length} revisados
                  </span>
                ) : lastResult.kind === "dano" ? (
                  <span className="text-red-400">{lastResult.text}</span>
                ) : lastResult.kind === "loot" ? (
                  <span className="text-green-300">{lastResult.text}</span>
                ) : (
                  <span className="text-zinc-400">{lastResult.text}</span>
                )}
              </div>

              {/* Saqueo PARCIAL: elegí cuánto saquear. Menos puntos = menos
                  botín esperado Y menos riesgo (preview antes de confirmar).
                  Solo mientras queden puntos por revisar. */}
              {!cleared && (
                <>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-subtle">
                  Saquear
                </span>
                <div className="flex flex-1 gap-1">
                  {BALANCE.scavengePartialPresets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPct(p)}
                      className={cn(
                        "flex-1 rounded-md border py-1 text-[10px] font-black tabular-nums transition-colors",
                        pct === p
                          ? "border-green-500/70 bg-green-950/60 text-green-300"
                          : "border-zinc-700 bg-black/40 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-white/5 bg-black/40 px-3 py-2 text-center text-[11px] leading-4">
                <span className="text-zinc-300">
                  Objetivo{" "}
                  <span className="font-bold text-green-400">
                    {Math.min(target, event.board.length)}/{event.board.length} puntos
                  </span>
                </span>
                <span className="text-subtle"> · riesgo ≈ </span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    (preview?.riesgoSalud ?? 0) > 0 ? "text-red-400" : "text-zinc-500",
                  )}
                >
                  −{preview?.riesgoSalud ?? 0} salud
                </span>
                <span className="text-subtle"> · botín ≈ </span>
                <span className="font-bold text-emerald-300">
                  {preview?.hallazgos ?? 0} hallazgo{(preview?.hallazgos ?? 0) === 1 ? "" : "s"}
                </span>
                {objetivoAlcanzado && (
                  <span className="ml-1 font-bold uppercase tracking-wider text-green-400">
                    · objetivo logrado, cobrá
                  </span>
                )}
              </div>
                </>
              )}

              <p className="text-center text-[10px] text-subtle">
                El daño es real: baja tu SALUD (nunca letal dentro del evento). Menos
                puntos = menos botín y menos riesgo. Lo encontrado queda asegurado al
                instante — podés retirarte cuando quieras.
              </p>

              {searched === 0 && (
                <Button
                  onClick={ignoreScavengeEvent}
                  variant="outline"
                  className="h-8 w-full border-zinc-700 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                >
                  Ignorar · el scavenger se va
                </Button>
              )}

              <Button
                onClick={finishScavengeEvent}
                variant="outline"
                className={cn(
                  "h-9 w-full border-zinc-700 font-bold uppercase tracking-widest hover:border-zinc-500 hover:bg-zinc-900",
                  objetivoAlcanzado
                    ? "border-green-500/50 bg-green-950/40 text-green-300 hover:bg-green-950/70"
                    : "text-zinc-300",
                )}
              >
                {cleared
                  ? "Terminar saqueo"
                  : objetivoAlcanzado
                    ? "Cobrar saqueo parcial"
                    : "Retirarse con lo encontrado"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
