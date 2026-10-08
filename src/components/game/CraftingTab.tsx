import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useGame } from "@/game/GameProvider";
import { RECIPES, RECIPE_CATEGORIES, RECIPE_BY_ID } from "@/game/crafting/recipes";
import { missingCosts, getCraftedCount } from "@/game/crafting/crafting";
import { RESOURCE_META } from "@/game/resources";
import { currentEnergy } from "@/game/energySystem";
import { vnow, nowReal } from "@/game/virtualClock";
import type { Recipe, ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

// ============================================================
// AFTERFALL — CRAFTEO screen.
// Reads and writes the REAL game resources (GameState) via the
// provider actions (craftRecipe / cancelCrafting). Recipes come
// only from crafting/recipes.ts. Dark olive/lime styling follows
// the app's token conventions. Effects are NOT wired into any
// system: items accumulate in the crafted inventory and every
// recipe exposes structured effectData for future integration.
// Layout: selected-item detail, production queue and crafted
// inventory on top; the craftable recipe list sits below.
// ============================================================

/** Real current amount of a resource (floor; comida/agua in minutes). */
function realAmount(
  key: ResourceKey,
  state: NonNullable<ReturnType<typeof useGame>["state"]>,
): number {
  if (key === "comida") return Math.floor(state.foodMin);
  if (key === "agua") return Math.floor(state.waterMin);
  return Math.floor(state.resources[key]);
}

function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Compact "need (have)" rows for a cost; missing needs highlighted red. */
function CostRows({
  costs,
  compact = false,
}: {
  costs: Partial<Record<ResourceKey, number>>;
  compact?: boolean;
}) {
  const { state } = useGame();
  if (!state) return null;
  return (
    <div className={cn("flex flex-col gap-0.5", compact ? "items-end" : "items-stretch")}>
      {(Object.keys(costs) as ResourceKey[]).map((k) => {
        const need = costs[k] ?? 0;
        const have = realAmount(k, state);
        const short = have < need;
        const meta = RESOURCE_META[k];
        return (
          <span
            key={k}
            className={cn(
              "flex items-baseline gap-1 font-mono text-[10px] font-bold tabular-nums",
              short ? "text-red-400" : "text-lime-300",
            )}
          >
            {meta.icon} {need}
            <span className="text-[9px] font-normal text-subtle">({have})</span>
            {short && <span className="text-[8px] uppercase text-red-400">falta</span>}
          </span>
        );
      })}
    </div>
  );
}

export function CraftingTab() {
  const { state, setScreen, craftRecipe, cancelCrafting, craftingVersion } = useGame();
  const [, force] = useState(0);
  // 1 s re-render so the active item's progress bar and countdown tick.
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [category, setCategory] = useState<string>("todas");
  const [selectedId, setSelectedId] = useState<string | null>(RECIPES[0]?.id ?? null);

  if (!state) return null;

  const queue = state.craftingQueue;
  const inventory = state.craftedInventory;
  void craftingVersion; // subscribe: deferred updates (catch-up) re-render us

  const active = queue[0] ?? null;
  const now = nowReal();
  const activePct =
    active && active.startedAt > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((now - active.startedAt) / Math.max(1, active.endsAt - active.startedAt)) * 100,
          ),
        )
      : 0;

  const filtered =
    category === "todas" ? RECIPES : RECIPES.filter((r) => r.category === category);
  const selected: Recipe | null =
    selectedId != null ? RECIPE_BY_ID[selectedId] ?? null : null;
  const selectedMissing = selected ? missingCosts(state, selected.costs) : {};
  const selectedAffordable = selected ? Object.keys(selectedMissing).length === 0 : false;

  const categories = [{ key: "todas", label: "Todos", icon: "▦" }, ...RECIPE_CATEGORIES];

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Top resource HUD (real values) ---- */}
      <section className="rounded-lg border border-[#37402e] bg-[#0b0f0b] p-2.5">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {(["materiales", "agua", "comida", "medicamentos", "componentes", "energia"] as const).map(
            (k) => {
              const meta = RESOURCE_META[k];
              const value =
                k === "energia" ? currentEnergy(state, vnow()) : realAmount(k, state);
              return (
                <div
                  key={k}
                  className="flex flex-col items-center rounded-sm border border-[#37402e]/60 bg-black/40 px-1 py-1.5"
                >
                  <span className="text-sm leading-none">{meta.icon}</span>
                  <span className="mt-0.5 font-mono text-xs font-black tabular-nums text-[#d5ef55]">
                    {Math.floor(value).toLocaleString("es")}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-wider text-[#657148]">
                    {meta.label}
                  </span>
                </div>
              );
            },
          )}
        </div>
      </section>

      {/* ---- Detail panel: selected item (effect + cost + craft) ---- */}
      {selected && (
        <aside>
          <div className="rounded-lg border border-[#657148]/60 bg-[#0d120c] p-3">
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{selected.icon}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-black uppercase tracking-wider text-[#d5ef55]">
                  {selected.name}
                </h3>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#657148]">
                  {RECIPE_CATEGORIES.find((c) => c.key === selected.category)?.label}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-zinc-400">{selected.description}</p>
            <p className="mt-1.5 rounded-sm border border-[#37402e] bg-black/40 px-2 py-1.5 text-[10px] leading-4 text-[#d5ef55]">
              ⚙ {selected.effect}
            </p>

            <p className="mt-2.5 text-[9px] font-bold uppercase tracking-widest text-[#657148]">
              Recursos requeridos
            </p>
            <div className="mt-1 rounded-sm border border-[#37402e] bg-black/40 px-2 py-1.5">
              <CostRows costs={selected.costs} />
            </div>
            <p className="mt-1.5 text-[9px] uppercase tracking-wider text-subtle">
              Tiempo de crafteo: {selected.timeSeconds}s
            </p>

            <Button
              onClick={() => craftRecipe(selected.id)}
              disabled={!selectedAffordable}
              className={cn(
                "mt-2 h-10 w-full font-bold uppercase tracking-widest",
                selectedAffordable
                  ? "border border-[#aeca43]/60 bg-[#aeca43] text-[#0b0f0b] hover:bg-[#d5ef55]"
                  : "cursor-not-allowed border border-[#37402e] bg-black/40 text-[#657148]",
              )}
            >
              Fabricar
            </Button>
          </div>
        </aside>
      )}

      {/* ---- Crafting queue (sequential) ---- */}
      <section className="rounded-lg border border-[#37402e] bg-[#0b0f0b] p-2.5">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[#657148]">
          Cola de crafteo · {queue.length}
        </p>
        {queue.length === 0 ? (
          <p className="py-2 text-center text-[10px] uppercase tracking-widest text-subtle">
            Cola vacía
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {queue.map((item, index) => {
              const isActive = index === 0 && item.startedAt > 0;
              const remaining = isActive ? item.endsAt - now : 0;
              return (
                <div
                  key={item.uid}
                  className="flex items-center gap-2 rounded-sm border border-[#37402e] bg-black/40 px-2 py-1.5"
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[10px] font-bold text-zinc-200">
                        {item.name}
                        {isActive && (
                          <span className="ml-1.5 font-mono text-[10px] font-black tabular-nums text-[#d5ef55]">
                            {fmtRemaining(remaining)}
                          </span>
                        )}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 text-[8px] font-black uppercase tracking-widest",
                          isActive ? "text-[#d5ef55]" : "text-[#657148]",
                        )}
                      >
                        {isActive ? "Fabricando" : "En espera"}
                      </span>
                    </div>
                    {isActive && (
                      <Progress
                        value={activePct}
                        className="mt-1 h-1 bg-[#37402e]/60"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelCrafting(item.uid)}
                    title="Cancela y devuelve el costo completo"
                    className="shrink-0 rounded-sm border border-red-900/50 bg-red-950/30 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-900/40 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Crafted inventory ---- */}
      <section className="rounded-lg border border-[#37402e] bg-[#0b0f0b] p-2.5">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[#657148]">
          Inventario de crafteos
        </p>
        {Object.keys(inventory).length === 0 ? (
          <p className="py-2 text-center text-[10px] uppercase tracking-widest text-subtle">
            Aún no fabricaste nada
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(inventory).map(([id, count]) => {
              const r = RECIPE_BY_ID[id];
              if (!r) return null;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-sm border border-[#37402e] bg-black/40 px-2 py-1 text-[10px] font-bold text-zinc-200"
                  title={r.effect}
                >
                  <span>{r.icon}</span>
                  <span className="max-w-[110px] truncate">{r.name}</span>
                  <span className="font-mono text-[#d5ef55]">×{count}</span>
                </span>
              );
            })}
          </div>
        )}
        <p className="mt-1.5 text-[9px] leading-4 text-subtle">
          Los objetos no consumibles se activan ASIGNÁNDOLOS desde la Mochila a una zona o a un
          superviviente (duran 2 h y se consumen al asignar); los consumibles se usan desde la Mochila
          (Botiquín, Kit de provisiones) y la Radio se desbloquea para siempre al fabricarla.
        </p>
      </section>

      {/* ---- Category tabs (filter the recipe list below) ---- */}
      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
              category === c.key
                ? "border-[#aeca43] bg-[#aeca43]/15 text-[#d5ef55]"
                : "border-[#37402e] bg-black/30 text-[#657148] hover:border-[#657148] hover:text-zinc-300",
            )}
          >
            <span aria-hidden className="mr-1">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* ---- Recipe list ---- */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const missing = missingCosts(state, r.costs);
          const affordable = Object.keys(missing).length === 0;
          const owned = getCraftedCount(state, r.id);
          const isSelected = selectedId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "relative flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
                isSelected
                  ? "border-[#aeca43] bg-[#aeca43]/10"
                  : affordable
                    ? "border-[#37402e] bg-[#0d120c] hover:border-[#657148]"
                    : "border-[#37402e]/60 bg-[#0d120c]/60 opacity-80 hover:border-[#657148]",
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xl leading-none">{r.icon}</span>
                <span
                  className={cn(
                    "rounded-sm px-1 py-0.5 text-[7px] font-black uppercase tracking-widest",
                    affordable
                      ? "bg-[#aeca43]/20 text-[#d5ef55]"
                      : "bg-red-950/40 text-red-400",
                  )}
                >
                  {affordable ? "Disponible" : "Sin recursos"}
                </span>
              </div>
              <p className="text-[11px] font-bold leading-tight text-zinc-100">{r.name}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-[#657148]">
                {RECIPE_CATEGORIES.find((c) => c.key === r.category)?.label} · {r.timeSeconds}s
              </p>
              {owned > 0 && (
                <span className="absolute bottom-2 right-2 rounded-sm border border-[#37402e] bg-black/70 px-1 font-mono text-[9px] font-black tabular-nums text-[#d5ef55]">
                  ×{owned}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Back to base (real navigation) ---- */}
      <button
        type="button"
        onClick={() => setScreen("base")}
        className="mx-auto flex items-center gap-1.5 rounded-sm border border-[#37402e] bg-black/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#657148] transition-colors hover:border-[#aeca43] hover:text-[#d5ef55]"
      >
        ← Volver
      </button>
    </div>
  );
}
