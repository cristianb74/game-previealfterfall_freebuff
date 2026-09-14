import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatsGrid } from "@/components/game/StatsGrid";
import { SURVIVOR_MAX_ROLLS } from "@/game/survivorGenerator";
import { useGame } from "@/game/GameProvider";
import type { Survivor } from "@/game/types";

export default function SurvivorCreation({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (s: Survivor) => void;
}) {
  const { rollOptions, rerollSurvivors } = useGame();
  const canReroll = rollOptions.length < SURVIVOR_MAX_ROLLS;
  const rerollsUsed = rollOptions.length === SURVIVOR_MAX_ROLLS ? 1 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-hidden rounded-lg border-zinc-800 bg-[#101213] text-zinc-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="tracking-widest text-zinc-100">TU SUPERVIVIENTE</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Se han detectado {rollOptions.length} perfiles compatibles. Elige con quién sobrevivirás.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[58dvh] pr-2">
          <div className="flex flex-col gap-3">
            {rollOptions.map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                onClick={() => onStart(s)}
                className="group flex items-center gap-3 rounded-md border border-zinc-800 bg-black/40 p-3 text-left transition-colors hover:border-green-500/60 hover:bg-green-950/20"
              >
                <img
                  src={s.portrait}
                  alt={s.name}
                  className="size-16 shrink-0 rounded-sm border border-zinc-800 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold text-zinc-100">{s.name}</p>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
                      Perfil {i + 1}
                    </span>
                  </div>
                  <p className="truncate text-xs text-green-500/90">{s.profession}</p>
                  <StatsGrid stats={s.stats} className="mt-2" />
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">
            Máximo {SURVIVOR_MAX_ROLLS} lanzamientos
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={rerollsUsed >= 1}
            onClick={rerollSurvivors}
            className="border-zinc-700 text-zinc-300 hover:border-green-500/50 hover:text-green-400"
          >
            {rerollsUsed >= 1 ? "Sin lanzamientos extra" : "Volver a lanzar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
