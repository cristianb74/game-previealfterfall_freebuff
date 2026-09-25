import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useEffect as useEffect0 } from "react";
import { HUD } from "@/components/game/HUD";
import { ZonasTab } from "@/components/game/ZonasTab";
import { EquipoTab } from "@/components/game/EquipoTab";
import { BaseTab } from "@/components/game/BaseTab";
import { InstalacionesTab } from "@/components/game/InstalacionesTab";
import { MercaderTab } from "@/components/game/MercaderTab";
import { MochilaTab } from "@/components/game/MochilaTab";
import { PerfilTab } from "@/components/game/PerfilTab";
import { RegistroTab } from "@/components/game/RegistroTab";
import { useGame, MERCHANT_OFFERS } from "@/game/GameProvider";
import { buildingUpgradeCost, CORE_BUILDING_GATE_ZONE } from "@/game/buildings";
import { BALANCE } from "@/game/balance";
import { getZone, ZONES } from "@/game/zones";
import { cn } from "@/lib/utils";
import type { BuildingKey, Screen } from "@/game/types";

const TABS: { key: Screen; label: string; glyph: string }[] = [
  { key: "zonas", label: "Zonas", glyph: "🗺" },
  { key: "equipo", label: "Equipo", glyph: "👥" },
  { key: "base", label: "Base", glyph: "🏗" },
  { key: "mercader", label: "Mercader", glyph: "🤝" },
  { key: "mochila", label: "Mochila", glyph: "🎒" },
  { key: "perfil", label: "Perfil", glyph: "👤" },
  { key: "registro", label: "Registro", glyph: "📋" },
];

/** Escape hatch from the Instalaciones detail back to the Zonas list:
 *  Game's screen-change effect restores the saved list scroll (the Zonas
 *  list saves it in the card's onDoubleClick before switching screens). */
export function returnToZonasWithScroll(
  setScreen: (s: Screen) => void,
  savedScrollRef: { current: number | null },
) {
  savedScrollRef.current = window.scrollY;
  setScreen("zonas");
}

export default function Game() {
  const {
    state,
    booted,
    hasSaveFile,
    screen,
    setScreen,
    maxUnlockedZoneId,
    savedZonasScrollRef,
  } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    if (booted && (!state || !hasSaveFile)) {
      navigate("/", { replace: true });
    }
  }, [booted, state, hasSaveFile, navigate]);

  // Scroll-to-top on section change (bottom nav, in-tab links like "ver
  // Mochila", etc.). The page itself is the scroll container, so resetting
  // window scroll is enough. Skipped on first mount so browser scroll
  // restoration (system back button, initial load) stays untouched.
  // EXCEPT: an explicit "← Volver a Zonas" from Instalaciones restores the
  // exact scroll position saved on the Zonas list before entering it.
  const prevScreenRef = useRef<Screen | null>(null);
  useEffect0(() => {
    if (prevScreenRef.current !== null && prevScreenRef.current !== screen) {
      const saved = savedZonasScrollRef.current;
      if (prevScreenRef.current === "instalaciones" && screen === "zonas" && saved != null) {
        // Explicit return: restore the memorized list position (instant,
        // before paint so the user never sees the top of the list).
        window.scrollTo(0, saved);
        savedZonasScrollRef.current = null;
      } else {
        window.scrollTo(0, 0);
        // Arriving by another path invalidates any stashed position.
        savedZonasScrollRef.current = null;
     }
    }
    prevScreenRef.current = screen;
  }, [screen]);

  // ---- "something to do" badges per nav tab ----
  let zonesUnlockable = false;
  let equipoIdle = false;
  let baseUpgradable = false;
  let merchantAffordable = false;
  if (state) {
    const now = Date.now();
    zonesUnlockable =
      state.pendingZoneUnlock != null && state.pendingZoneUnlock > state.currentZoneId;
    const assignedIds = new Set(state.npcs.filter((n) => n.assignedZoneId).map((n) => n.id));
    equipoIdle = state.npcs.some((n) => !assignedIds.has(n.id));
    // Global base: any core building upgradable right now (gates + quota).
    const order: BuildingKey[] = ["cocina", "tanque", "almacen", "enfermeria", "taller", "generador"];
    baseUpgradable = order.some((k, idx) => {
      const b = state.base?.[k];
      if (!b || b.level >= BALANCE.buildingMaxLevel || b.upgradeFinishAt) return false;
      if (state.base && Object.values(state.base).filter((x) => x.upgradeFinishAt).length >= BALANCE.maxConcurrentConstructionsInBase) return false;
      // Gate zone must be unlocked.
      const gate = CORE_BUILDING_GATE_ZONE[k];
      if (gate != null && state.expTotal < getZone(gate).unlockExp) return false;
      // Sequential unlock: cocina always, others need previous at Lv1+.
      if (idx > 0) {
        const prev = state.base[order[idx - 1]];
        if (!prev || prev.level < 1) return false;
      }
      const cost = buildingUpgradeCost(b.level);
      return state.resources.materiales >= cost.materiales && state.resources.componentes >= cost.componentes;
    });
    merchantAffordable = Object.values(MERCHANT_OFFERS).some(
      (o) => o && state.resources.dinero >= o.price,
    );
  }
  const TAB_ALERTS: Partial<Record<Screen, boolean>> = {
    zonas: zonesUnlockable,
    equipo: equipoIdle,
    base: baseUpgradable,
    mercader: merchantAffordable,
  };

  return (
    <div className="min-h-dvh bg-[#0b0d0e] text-zinc-200">
      <HUD />

      {/* Mobile: single column. Desktop ≥1024: zonas | explorar | base */}
      <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 lg:max-w-none lg:px-6">
        <div className="lg:grid lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)_minmax(260px,340px)] lg:items-start lg:gap-4">
          <aside className="hidden lg:block">
            <div className="sticky top-[130px]">
              <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.25em] text-subtle">Zonas</h2>
              <ZonasTab />
            </div>
          </aside>

          <main className="min-w-0">
            {screen === "zonas" && <ZonasTab />}
            {screen === "equipo" && <EquipoTab />}
            {screen === "base" && <BaseTab />}
            {screen === "instalaciones" && <InstalacionesTab returnScreen="zonas" />}
            {screen === "mercader" && <MercaderTab />}
            {screen === "mochila" && <MochilaTab />}
            {screen === "perfil" && <PerfilTab />}
            {screen === "registro" && <RegistroTab />}
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-[130px]">
              <h2 className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.25em] text-subtle">Construcciones</h2>
              <BaseTab />
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom navigation — visible on mobile and desktop */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-[#0c0e0f]/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-7">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScreen(t.key)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
                screen === t.key ? "text-green-500" : "text-subtle hover:text-zinc-300",
              )}
            >
              {TAB_ALERTS[t.key] && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-green-400 shadow-[0_0_6px_1px_rgba(74,222,128,0.9)]"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-green-400" />
                </span>
              )}
              <span className="text-base leading-none">{t.glyph}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
