import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HUD } from "@/components/game/HUD";
import { useGame } from "@/game/GameProvider";
import { ZONES, getZone, zoneImage } from "@/game/zones";
import { cn } from "@/lib/utils";

export function ZonasTab() {
  const { state, setCurrentZone } = useGame();
  const [selected, setSelected] = useState<number | null>(null);

  if (!state) return null;
  const unlockedMax = ZONES.reduce(
    (acc, z) => (state.expTotal >= z.unlockExp ? Math.max(acc, z.id) : acc),
    1,
  );
  const sel = selected != null ? getZone(selected) : null;
  const selUnlocked = sel != null && sel.id <= unlockedMax;

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Zonas desbloqueadas · {unlockedMax}/20
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZONES.map((z) => {
          const unlocked = z.id <= unlockedMax;
          const isCurrent = state.currentZoneId === z.id;
          const assignedNpc = z.id <= unlockedMax ? state.zones[z.id]?.assignedNpcId : null;
          return (
            <button
              key={z.id}
              onClick={() => setSelected(z.id)}
              className={cn(
                "group relative overflow-hidden rounded-lg border text-left transition-colors",
                isCurrent ? "border-green-500/70" : "border-zinc-800 hover:border-zinc-600",
                !unlocked && "opacity-45",
              )}
            >
              <div className="relative h-20 w-full sm:h-24">
                <img
                  src={zoneImage(z.id)}
                  alt={z.name}
                  className="absolute inset-0 size-full object-cover"
                  style={{ objectFit: "cover" }}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e0f] via-[#0c0e0f]/30 to-transparent" />
                <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/70 px-1 text-[9px] font-bold tabular-nums text-zinc-300">
                  {String(z.id).padStart(2, "0")}
                </span>
                {isCurrent && (
                  <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/90 px-1 text-[8px] font-black uppercase text-black">
                    Actual
                  </span>
                )}
                {assignedNpc && (
                  <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/70 px-1 text-[8px] font-bold text-green-400">
                    {assignedNpc}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-[11px] font-bold text-zinc-200">{z.name}</p>
                <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                  {unlocked ? `${z.explorationMinutes} min · +${z.playerExpReward} EXP` : `🔒 ${z.unlockExp.toLocaleString("es")} EXP`}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={sel != null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
          {sel && (
            <>
              <div className="relative -mx-6 -mt-6 h-36 overflow-hidden rounded-t-lg sm:h-44">
                <img
                  src={zoneImage(sel.id)}
                  alt={sel.name}
                  className="absolute inset-0 size-full object-cover"
                  style={{ objectFit: "cover" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#101213] to-transparent" />
              </div>
              <DialogHeader>
                <DialogTitle className="tracking-wider text-zinc-100">
                  <span className="text-green-500">Z{String(sel.id).padStart(2, "0")} · </span>
                  {sel.name}
                </DialogTitle>
                <DialogDescription className="text-zinc-500">{sel.description}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <p>Duración: <span className="text-zinc-200">{sel.explorationMinutes} min</span></p>
                <p>EXP: <span className="text-green-400">+{sel.playerExpReward}</span></p>
                <p>EXP NPC asignado: <span className="text-zinc-300">+{sel.npcExpReward}</span></p>
                <p>Desbloqueo: <span className="text-zinc-200">{sel.unlockExp.toLocaleString("es")} EXP</span></p>
              </div>
              <div className="flex flex-wrap gap-1">
                {sel.resources.filter((r) => r !== "dinero").map((r) => (
                  <Badge key={r} variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                    {r}
                  </Badge>
                ))}
              </div>
              {selUnlocked ? (
                <Button
                  className="border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
                  onClick={() => {
                    setCurrentZone(sel.id);
                    setSelected(null);
                  }}
                >
                  Viajar a esta zona
                </Button>
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  Zona bloqueada · necesitas {Math.max(0, Math.ceil(sel.unlockExp - state.expTotal)).toLocaleString("es")} EXP más
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
