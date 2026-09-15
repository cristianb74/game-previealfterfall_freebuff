import { useEffect } from "react";
import { useNavigate } from "react-router";
import { HUD } from "@/components/game/HUD";
import { ExplorarTab } from "@/components/game/ExplorarTab";
import { ZonasTab } from "@/components/game/ZonasTab";
import { EquipoTab } from "@/components/game/EquipoTab";
import { BaseTab } from "@/components/game/BaseTab";
import { MercaderTab } from "@/components/game/MercaderTab";
import { MochilaTab } from "@/components/game/MochilaTab";
import { PerfilTab } from "@/components/game/PerfilTab";
import { useGame } from "@/game/GameProvider";
import { cn } from "@/lib/utils";
import type { Screen } from "@/game/types";

const TABS: { key: Screen; label: string; glyph: string }[] = [
  { key: "explorar", label: "Explorar", glyph: "🧭" },
  { key: "zonas", label: "Zonas", glyph: "🗺" },
  { key: "equipo", label: "Equipo", glyph: "👥" },
  { key: "base", label: "Base", glyph: "🏗" },
  { key: "mercader", label: "Mercader", glyph: "🤝" },
  { key: "mochila", label: "Mochila", glyph: "🎒" },
  { key: "perfil", label: "Perfil", glyph: "👤" },
];

export default function Game() {
  const { state, booted, hasSaveFile, screen, setScreen } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    if (booted && (!state || !hasSaveFile)) {
      navigate("/", { replace: true });
    }
  }, [booted, state, hasSaveFile, navigate]);

  if (!booted) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0b0d0e]">
        <p className="animate-pulse text-sm uppercase tracking-[0.3em] text-green-500">AFTERFALL</p>
      </main>
    );
  }
  if (!state) return null;

  return (
    <div className="min-h-dvh bg-[#0b0d0e] text-zinc-200">
      <HUD />

      {/* Mobile: single column. Desktop ≥1024: zonas | explorar | base */}
      <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 lg:max-w-none lg:px-6 lg:pb-6">
        <div className="lg:grid lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)_minmax(260px,340px)] lg:items-start lg:gap-4">
          <aside className="hidden lg:block">
            <div className="sticky top-[130px]">
              <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">Zonas</h2>
              <ZonasTab />
            </div>
          </aside>

          <main className="min-w-0">
            {screen === "explorar" && <ExplorarTab />}
            {screen === "zonas" && <ZonasTab />}
            {screen === "equipo" && <EquipoTab />}
            {screen === "base" && <BaseTab />}
            {screen === "mercader" && <MercaderTab />}
            {screen === "mochila" && <MochilaTab />}
            {screen === "perfil" && <PerfilTab />}
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-[130px]">
              <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">Construcciones</h2>
              <BaseTab />
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-[#0c0e0f]/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-7">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScreen(t.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
                screen === t.key ? "text-green-500" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <span className="text-base leading-none">{t.glyph}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
