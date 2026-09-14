import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { GAME_INFO } from "@/game/gameConfig";
import { useGame } from "@/game/GameProvider";
import SurvivorCreation from "@/components/game/SurvivorCreation";

export default function Landing() {
  const { hasSaveFile, booted, startNewGame, continueGame, eraseSave, setNavigator } = useGame();
  const navigate = useNavigate();
  useEffect(() => {
    setNavigator((path: string) => navigate(path));
    return () => setNavigator(null);
  }, [navigate, setNavigator]);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const disabled = !booted;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0b0d0e] text-zinc-200">
      {/* backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 50% 88%, rgba(34,197,94,0.10), transparent 70%), radial-gradient(80% 50% at 50% 110%, rgba(34,197,94,0.08), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.02) 2px 4px), repeating-linear-gradient(90deg, transparent 0 2px, rgba(255,255,255,0.015) 2px 4px)",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full border-2 border-green-500/70 bg-black/60 shadow-[0_0_40px_rgba(34,197,94,0.25)]">
          <span className="text-4xl leading-none text-green-500">☢</span>
        </div>

        <h1 className="text-4xl font-black tracking-[0.35em] text-zinc-100 sm:text-5xl">
          {GAME_INFO.title}
        </h1>
        <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-green-500/90">
          {GAME_INFO.subtitle}
        </p>
        <p className="mt-6 max-w-xs text-sm leading-6 text-zinc-400">
          La ciudad cayó. Los que quedan exploran, recolectan y reconstruyen.
          <br />
          Tu refugio te espera, {`superviviente`}.
        </p>

        <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
          <Button
            size="lg"
            disabled={disabled}
            onClick={() => setCreating(true)}
            className="h-12 border border-green-500/40 bg-green-600/90 text-base font-bold uppercase tracking-widest text-black hover:bg-green-500"
          >
            Nueva partida
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={disabled || !hasSaveFile}
            onClick={() => void continueGame()}
            className="h-12 border-zinc-700 bg-zinc-900/60 text-base font-bold uppercase tracking-widest text-zinc-300 hover:border-green-500/50 hover:text-green-400"
          >
            Continuar
          </Button>
          <Button
            size="lg"
            variant="ghost"
            disabled={disabled}
            onClick={() => setSettingsOpen(true)}
            className="h-11 text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            Configuración
          </Button>
        </div>

        <p className="mt-10 text-[10px] uppercase tracking-[0.25em] text-zinc-600">
          {GAME_INFO.tagline}
        </p>
      </div>

      <SurvivorCreation open={creating} onOpenChange={setCreating} onStart={(s) => { setCreating(false); void startNewGame(s).then(() => navigate("/juego")); }} />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
          <DialogHeader>
            <DialogTitle className="tracking-widest text-zinc-100">CONFIGURACIÓN</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Ajustes locales de la aplicación.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <Label htmlFor="haptics" className="text-sm text-zinc-300">Vibración</Label>
            <Switch id="haptics" checked={haptics} onCheckedChange={setHaptics} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="motion" className="text-sm text-zinc-300">Animaciones reducidas</Label>
            <Switch id="motion" checked={reducedMotion} onCheckedChange={setReducedMotion} />
          </div>
          <Separator className="bg-zinc-800" />
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Zona de peligro</p>
            {confirmErase ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    void eraseSave();
                    setConfirmErase(false);
                    setSettingsOpen(false);
                  }}
                >
                  Borrar de verdad
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmErase(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={!hasSaveFile}
                onClick={() => setConfirmErase(true)}
                className="border-red-900/60 text-red-400 hover:bg-red-950/40 hover:text-red-300"
              >
                Borrar partida
              </Button>
            )}
            <p className="text-[10px] text-zinc-600">
              v{GAME_INFO.version} · Partida guardada en este dispositivo
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
