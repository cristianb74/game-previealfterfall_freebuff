import { Button } from "@/components/ui/button";
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
import { CloudUpload, CloudDownload, Loader2, LogIn, LogOut, ShieldCheck } from "lucide-react";

export function PerfilTab() {
  const { state, cloud, syncNow, restoreFromCloud } = useGame();
  const { user, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
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
            <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
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
            <p className="text-xs text-zinc-500">
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
        <p className="mt-3 text-[10px] leading-4 text-zinc-600">
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
              <span className="text-zinc-600">→</span>
              <span className="text-zinc-300">{RESOURCE_META[STAT_RESOURCE[k]].label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-zinc-600">
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
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4 text-[11px] leading-5 text-zinc-500">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Cómo se juega</h3>
        <p>· Explora: gasta 1 ⚡ y gana EXP, recursos y a veces supervivientes.</p>
        <p>· Comida y Agua son tiempo de supervivencia; se consumen siempre, incluso cerrando la app.</p>
        <p>· Los NPC asignados a zonas producen solos (más débiles que tu exploración).</p>
        <p>· Mejora edificios en cada zona para multiplicar los hallazgos de esa zona.</p>
        <p>· Alcanza EXP para desbloquear las 20 zonas hasta la Base Militar.</p>
      </section>

      {/* full log */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Registro de exploración
        </h3>
        {fullLog.length === 0 ? (
          <p className="text-xs text-zinc-600">Sin eventos todavía.</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
            {fullLog.map((e, i) => (
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
      </section>

      <p className="pb-2 text-center text-[10px] uppercase tracking-[0.25em] text-zinc-700">
        {GAME_INFO.title} v{GAME_INFO.version} · guardado local + nube
      </p>
    </div>
  );
}
