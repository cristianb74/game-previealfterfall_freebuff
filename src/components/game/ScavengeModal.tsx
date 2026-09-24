import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useGame } from "@/game/GameProvider";
import { getZone } from "@/game/zones";
import { RESOURCE_META } from "@/game/resources";
import { isScavengeExpired } from "@/game/scavenge";
import { vnow } from "@/game/virtualClock";
import type { ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

// ============================================================
// AFTERFALL — Scavenge minigame modal.
// Renders while state.scavengeEvent is active: an animated
// "¡Ubicación de Suministros Encontrada!" announcement, then a
// timed tap-to-loot board. Claimed loot is banked on close;
// unclaimed cells are lost when the timer runs out.
// ============================================================

type Phase = "announce" | "playing" | "summary";

function lootMeta(r: ResourceKey): { icon: string; cls: string } {
  const meta = RESOURCE_META[r];
  if (r === "dinero") return { icon: "$", cls: "border-amber-500/60 bg-amber-500/10 text-amber-300" };
  if (r === "comida" || r === "agua") {
    return { icon: meta.icon, cls: "border-sky-600/50 bg-sky-500/10 text-sky-300" };
  }
  return { icon: meta.icon, cls: "border-green-600/50 bg-green-500/10 text-green-300" };
}

function lootLabel(r: ResourceKey, amount: number): string {
  if (r === "dinero") return `+$${amount}`;
  return `+${amount}${r === "comida" || r === "agua" ? " min" : ""} ${RESOURCE_META[r].label}`;
}

function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ScavengeModal() {
  const { state, completeScavengeEvent } = useGame();
  const event = state?.scavengeEvent ?? null;
  const open = event != null;

  const [phase, setPhase] = useState<Phase>("announce");
  /** Cells already tapped — handed to completeScavengeEvent on close so
   *  their loot is banked into the global state (even on expiry). */
  const [tapped, setTapped] = useState<number[]>([]);
  const [now, setNow] = useState(() => vnow());

  // Reset the local phase machine whenever a NEW event opens.
  const eventKey = event ? event.startedAt : 0;
  const [lastKey, setLastKey] = useState(0);
  if (open && eventKey !== lastKey) {
    setLastKey(eventKey);
    setPhase("announce");
    setTapped([]);
    setNow(vnow());
  }

  // UI ticker for the countdown while the event is open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(vnow()), 500);
    return () => window.clearInterval(id);
  }, [open]);

  const expired = event != null && isScavengeExpired(event, now);

  // Expiry or fully-cleared board → summary. Expiry wins even from the
  // announce screen (waiting too long forfeits the location).
  useEffect(() => {
    if (!event || phase === "summary") return;
    if (expired) {
      setPhase("summary");
      return;
    }
    if (phase === "playing" && event.board.length > 0 && tapped.length >= event.board.length) {
      setPhase("summary");
    }
  }, [event, phase, expired, tapped.length]);

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "max-w-sm rounded-lg border-zinc-800 bg-[#101213] p-4 text-zinc-200 outline-none",
          phase === "announce" && "border-green-500/40 shadow-[0_0_50px_rgba(34,197,94,0.25)]",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {phase === "announce" && event && (
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
              <p className="text-xs text-subtle">
                Z{String(getZone(event.zoneId).id).padStart(2, "0")} · {getZone(event.zoneId).name}
              </p>
              <p className="max-w-[260px] text-[11px] leading-4 text-zinc-400">
                Casillas sin saquear a la vista. Toca rápido — cuando el tiempo
                acabe, lo no reclamado se pierde.
              </p>
              <Button
                onClick={() => setPhase("playing")}
                className="mt-1 h-10 w-full border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
              >
                Reclamar ubicación
              </Button>
            </motion.div>
          )}

          {phase === "playing" && event && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between">
                <DialogTitle className="text-sm font-black uppercase tracking-widest text-green-500">
                  Saqueo en curso
                </DialogTitle>
                <span className="font-mono text-sm font-bold tabular-nums text-zinc-100">
                  {fmtTimer(event.expiresAt - now)}
                </span>
              </div>
              <Progress
                value={Math.max(0, Math.min(100, ((event.expiresAt - now) / (event.expiresAt - event.startedAt)) * 100))}
                className="h-1.5 bg-zinc-800"
              />
              <div className="grid grid-cols-4 gap-2">
                {event.board.map((cell, i) => {
                  const isTapped = tapped.includes(i);
                  const loot = cell.loot;
                  const m = loot ? lootMeta(loot.resource) : null;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={isTapped}
                      onClick={() => setTapped((prev) => [...prev, i])}
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-0.5 rounded-md border transition-all",
                        isTapped
                          ? loot
                            ? "border-green-500/70 bg-green-500/15 text-green-300"
                            : "border-zinc-800 bg-black/40 text-subtle"
                          : "border-zinc-700 bg-black/60 hover:border-green-500/50 hover:bg-green-950/20 active:scale-95",
                      )}
                    >
                      {isTapped ? (
                        loot ? (
                          <>
                            <span className="text-lg leading-none">{m!.icon}</span>
                            <span className="text-[10px] font-black leading-none">
                              {lootLabel(loot.resource, loot.amount)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] uppercase tracking-wider">Escombros</span>
                        )
                      ) : (
                        <span className="text-xl leading-none opacity-70">?</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[10px] text-subtle">
                {tapped.length}/{event.board.length} casillas revisadas · lo reclamado está a salvo
              </p>
            </motion.div>
          )}

          {phase === "summary" && event && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3 py-1"
            >
              <DialogTitle className="text-center text-base font-black uppercase tracking-[0.2em] text-zinc-100">
                {tapped.some((i) => event.board[i]?.loot) ? "Botín asegurado" : "Sin botín"}
              </DialogTitle>
              {tapped.some((i) => event.board[i]?.loot) ? (
                <div className="flex flex-col gap-1 rounded-md border border-white/5 bg-black/40 p-3">
                  {tapped
                    .filter((i) => event.board[i]?.loot)
                    .map((i) => {
                      const loot = event.board[i]!.loot!;
                      const m = lootMeta(loot.resource);
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 text-zinc-300">
                            <span>{m.icon}</span> {lootLabel(loot.resource, loot.amount)}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-subtle">✔</span>
                        </div>
                      );
                    })}
                  <p className="mt-1 text-[10px] text-subtle">
                    {expired
                      ? "El tiempo se agotó — solo se conserva lo reclamado."
                      : "Todo lo reclamado pasa a tu refugio."}
                  </p>
                </div>
              ) : (
                <p className="rounded-md border border-zinc-800 bg-black/40 p-3 text-center text-xs text-subtle">
                  {expired
                    ? "El tiempo se agotó antes de reclamar nada. Otra vez será."
                    : "No revisaste ninguna casilla. Otra vez será."}
                </p>
              )}
              <Button
                onClick={() => completeScavengeEvent(expired, tapped)}
                className="h-10 w-full border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
              >
                Continuar
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
