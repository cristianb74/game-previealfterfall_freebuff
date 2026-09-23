import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HUD } from "@/components/game/HUD";
import { StatsGrid } from "@/components/game/StatsGrid";
import { useNavigate } from "react-router";
import { useGame } from "@/game/GameProvider";
import { STAT_META, STAT_ORDER, RESOURCE_META } from "@/game/resources";
import { STAT_RESOURCE } from "@/game/balance";
import { statEffectRows } from "@/game/statEffects";
import { GAME_INFO } from "@/game/gameConfig";
import { getZone } from "@/game/zones";
import { useAuth } from "@/hooks/use-auth";
import { CloudUpload, CloudDownload, Loader2, LogIn, LogOut, ShieldCheck, AlertTriangle } from "lucide-react";

export function PerfilTab() {
  const { state, cloud, syncNow, restoreFromCloud, eraseSave, speedMultiplier, setSpeed } = useGame();
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAck, setResetAck] = useState(false);
  if (!state) return null;

  const fullLog = state.log;

  return (
    <div className="flex flex-col gap-3">
      {/* survivor card */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <div className="flex items-center gap-4">
          <img
            src={state.survivor.portrait}
            alt={state.survivor.name}
            className="size-20 rounded-sm border border-zinc-800 object-cover"
          />
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-wider text-zinc-100">{state.survivor.name}</h2>
            <p className="text-sm text-green-500">{state.survivor.profession}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-subtle">
              EXP total {Math.floor(state.expTotal).toLocaleString("es")} · Exploraciones {state.explorationsDone}
            </p>
          </div>
        </div>
        <StatsGrid stats={state.survivor.stats} className="mt-3" />
      </section>

      {/* account + cloud save */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Cuenta y guardado en la nube
        </h3>
        {isAuthenticated ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">
                  {user?.name || user?.email || "Cuenta vinculada"}
                </p>
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-green-500">
                  <ShieldCheck className="size-3" />
                  {cloud.syncing
                    ? "Sincronizando…"
                    : cloud.lastSyncAt
                      ? `Sincronizado ${new Date(cloud.lastSyncAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`
                      : "Conectado a la nube"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={cloud.syncing}
                onClick={() => void signOut()}
                className="border-zinc-700 text-zinc-400 hover:text-zinc-200"
              >
                <LogOut className="mr-1.5 size-3.5" />
                Salir
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={cloud.syncing}
                onClick={() => void syncNow()}
                className="border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
              >
                {cloud.syncing ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="mr-1.5 size-3.5" />
                )}
                Sincronizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={cloud.syncing}
                onClick={() => void restoreFromCloud()}
                className="border-zinc-700 text-zinc-300 hover:border-green-500/50 hover:text-green-400"
              >
                <CloudDownload className="mr-1.5 size-3.5" />
                Restaurar nube
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-faint">
              Guardando solo en este dispositivo. Inicia sesión para proteger tu progreso y
              continuar en cualquier móvil, tablet u ordenador.
            </p>
            <Button
              size="sm"
              onClick={() => navigate("/auth?returnTo=%2Fjuego")}
              className="border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
            >
              <LogIn className="mr-1.5 size-3.5" />
              Iniciar sesión
            </Button>
          </div>
        )}
        <p className="mt-3 text-[10px] leading-4 text-subtle">
          La partida se guarda automáticamente en el dispositivo y, con la sesión iniciada,
          también se sube a la nube. Si dos copias chocan, gana la más reciente.
        </p>
      </section>

      {/* stat-resource relation */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Estadísticas → Recursos
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3">
          {STAT_ORDER.map((k) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">{STAT_META[k].label}</span>
              <span className="text-subtle">→</span>
              <span className="text-zinc-300">{RESOURCE_META[STAT_RESOURCE[k]].label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-subtle">
          Una estadística más alta mejora la probabilidad de encontrar su recurso asociado.
          Los edificios y los NPC multiplican esa probabilidad base (bonus relativo).
        </p>
      </section>

      {/* real stat effects (from statEffects.ts) */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Efectos de tus estadísticas
        </h3>
        <ul className="flex flex-col gap-1.5 text-[11px]">
          {statEffectRows(state.survivor.stats).map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3">
              <span className="shrink-0 font-bold uppercase tracking-wider text-green-500">
                {STAT_META[row.key].label}
              </span>
              <span className="text-right text-zinc-400">{row.effect}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* rules / help */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4 text-[11px] leading-5 text-subtle">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Cómo se juega</h3>
        <p>· Explora: gasta 1 ⚡ y gana EXP, recursos y a veces supervivientes.</p>
        <p>· Comida y Agua son tiempo de supervivencia; se consumen siempre, incluso cerrando la app.</p>
        <p>· Los NPC asignados a zonas producen solos (más débiles que tu exploración).</p>
        <p>· La Base global (tab 🏗) mejora hallazgos en todas las zonas; las Instalaciones de cada zona (doble toque) solo benefician a su zona.</p>
        <p>· Alcanza EXP para desbloquear las 20 zonas hasta la Base Militar.</p>
      </section>

      {/* full log */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Registro de exploración
        </h3>
        {fullLog.length === 0 ? (
          <p className="text-xs text-subtle">Sin eventos todavía.</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
            {fullLog.map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-[10px] text-subtle">
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
                          : "text-subtle"
                  }
                >
                  {e.msg}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== TEST ZONE (dev/QA tooling — public for now) ===== */}
      <section className="rounded-lg border border-red-900/60 bg-red-950/20 p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
          <AlertTriangle className="size-3.5" />
          Zona de testeo
        </h3>
        <p className="mb-3 text-[10px] leading-4 text-subtle">
          Herramientas de desarrollo. Estas acciones son destructivas y no forman
          parte del juego normal.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setResetAck(false);
            setResetOpen(true);
          }}
          className="border-red-800/70 text-red-300 hover:border-red-500 hover:bg-red-950/40 hover:text-red-200"
        >
          Reiniciar cuenta
        </Button>

        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Velocidad del juego (solo esta sesión)
          </p>
          <div className="flex gap-2">
            {([1, 2, 4] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSpeed(m)}
                className={cn(
                  "flex-1 rounded-sm border px-2 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors",
                  speedMultiplier === m
                    ? "border-amber-400/70 bg-amber-500/15 text-amber-300"
                    : "border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-300",
                )}
              >
                x{m}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-subtle">
            Acelera el tiempo del juego x2 o x4 (exploraciones, construcción,
            energía y consumo). Vuelve a x1 automáticamente al recargar.
          </p>
        </div>
      </section>

      {/* reset confirmation: double confirm (ack checkbox + button) */}
      <Dialog
        open={resetOpen}
        onOpenChange={(o) => {
          if (!o) setResetOpen(false);
        }}
      >
        <DialogContent className="max-w-sm rounded-lg border-red-900/60 bg-[#101213] text-zinc-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="size-4" />
              Reiniciar cuenta
            </DialogTitle>
            <DialogDescription className="text-faint">
              Esta acción borra tu partida y empieza de cero.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3 text-xs leading-5 text-zinc-300">
            <p className="font-bold">Se perderá TODO el progreso:</p>
            <p>· Superviviente, stats, EXP y zonas desbloqueadas</p>
            <p>· Recursos, edificios y NPC del refugio</p>
            <p>· El guardado local Y la copia en la nube (si hay sesión iniciada)</p>
            <p className="mt-1 text-[10px] text-red-400">
              Esta acción es permanente e irreversible.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={resetAck}
              onChange={(e) => setResetAck(e.target.checked)}
              className="mt-0.5 size-4 accent-red-600"
            />
            <span>Entiendo que se perderá todo el progreso y no se puede recuperar.</span>
          </label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              className="flex-1 border-zinc-700 text-zinc-300"
            >
              Cancelar
            </Button>
            <Button
              disabled={!resetAck}
              onClick={() => {
                setResetOpen(false);
                void eraseSave().then(() => navigate("/", { replace: true }));
              }}
              className="flex-1 border border-red-500/40 bg-red-600/90 font-bold uppercase tracking-widest text-white hover:bg-red-500 disabled:opacity-40"
            >
              Reiniciar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="pb-2 text-center text-[10px] uppercase tracking-[0.25em] text-zinc-700">
        {GAME_INFO.title} v{GAME_INFO.version} · guardado local + nube
      </p>
    </div>
  );
}
