import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGame, MERCHANT_OFFERS } from "@/game/GameProvider";
import { BALANCE, MERCHANT_SELL_PRICES } from "@/game/balance";
import { RESOURCE_META } from "@/game/resources";
import type { ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

const OFFER_ORDER = ["materiales", "medicamentos", "componentes", "comida", "agua"] as const;
type OfferKey = (typeof OFFER_ORDER)[number];

const SELL_ORDER = ["materiales", "medicamentos", "componentes", "comida", "agua"] as const;
type SellKey = (typeof SELL_ORDER)[number];

function getMaxSellQty(key: SellKey, state: { resources: Record<ResourceKey, number>; foodMin: number; waterMin: number }): number {
  const offer = MERCHANT_SELL_PRICES[key];
  if (!offer) return 0;
  if (key === "comida") return Math.floor(state.foodMin / offer.amount);
  if (key === "agua") return Math.floor(state.waterMin / offer.amount);
  return Math.floor(state.resources[key] / offer.amount);
}

export function MercaderTab() {
  const { state, buyResource, sellResource } = useGame();
  const [, force] = useState(0);
  const [sellQty, setSellQty] = useState<Record<SellKey, number>>({
    materiales: 1, medicamentos: 1, componentes: 1, comida: 1, agua: 1,
  });

  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const money = Math.floor(state.resources.dinero);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-subtle">
        Comercio de supervivencia · sin dinero premium
      </p>

      {/* Wallet */}
      <section className="rounded-lg border border-green-500/30 bg-[#101213] p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-subtle">Tu dinero</p>
        <p className="mt-1 font-mono text-3xl font-black text-green-500">$ {money}</p>
        <p className="mt-1 text-[10px] text-subtle">
          Se encuentra explorando zonas. No existe dinero premium ni compras reales.
        </p>
      </section>

      {/* Buy offers */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Comprar</p>
        <div className="flex flex-col gap-2">
          {OFFER_ORDER.map((key) => {
            const offer = MERCHANT_OFFERS[key];
            if (!offer) return null;
            const affordable = money >= offer.price;
            return (
              <Button
                key={key}
                variant="outline"
                disabled={!affordable}
                onClick={() => buyResource(key)}
                className={cn(
                  "h-auto justify-between border-zinc-700 px-3 py-2.5 text-left hover:border-green-500/60",
                  affordable && "hover:bg-green-500/10",
                )}
              >
                <span className="text-sm font-bold text-zinc-200">{offer.label}</span>
                <span className="font-mono text-sm font-black text-green-500">${offer.price}</span>
              </Button>
            );
          })}
        </div>
      </section>

      {/* Sell section */}
      <section className="rounded-lg border border-amber-800/40 bg-[#101213] p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-400">Vender</p>
        <div className="flex flex-col gap-3">
          {SELL_ORDER.map((key) => {
            const offer = MERCHANT_SELL_PRICES[key];
            if (!offer) return null;
            const maxQty = getMaxSellQty(key, state);
            const qty = Math.min(sellQty[key], maxQty);
            const totalMoney = offer.price * qty;
            const totalAmount = offer.amount * qty;
            const hasStock = maxQty > 0;
            const currentStock = key === "comida"
              ? `${Math.floor(state.foodMin)} min`
              : key === "agua"
                ? `${Math.floor(state.waterMin)} min`
                : `${Math.floor(state.resources[key])}`;

            return (
              <div
                key={key}
                className={cn(
                  "rounded-md border px-3 py-2.5",
                  hasStock ? "border-zinc-700 bg-[#0d0f10]" : "border-zinc-800/50 bg-[#0d0f10]/50 opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-200">{offer.label}</span>
                  <span className="text-[10px] text-subtle">Stock: {currentStock}</span>
                </div>
                <p className="mt-1 text-[10px] text-subtle">
                  Precio unitario: ${offer.price} · {totalAmount} {key === "comida" || key === "agua" ? `min ${key}` : key}
                </p>

                {hasStock && (
                  <>
                    {/* Quantity controls */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={qty <= 1}
                        onClick={() => setSellQty((prev) => ({ ...prev, [key]: Math.max(1, prev[key] - 1) }))}
                        className="size-7 rounded-sm border border-zinc-700 bg-zinc-800 text-sm font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center font-mono text-sm font-bold text-zinc-200">
                        {qty}
                      </span>
                      <button
                        type="button"
                        disabled={qty >= maxQty}
                        onClick={() => setSellQty((prev) => ({ ...prev, [key]: Math.min(maxQty, prev[key] + 1) }))}
                        className="size-7 rounded-sm border border-zinc-700 bg-zinc-800 text-sm font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
                      >
                        +
                      </button>
                      <span className="ml-auto text-[10px] text-subtle">
                        Recibirás: <span className="font-mono font-bold text-amber-400">${totalMoney}</span>
                      </span>
                    </div>

                    <Button
                      size="sm"
                      disabled={qty < 1}
                      onClick={() => {
                        sellResource(key, qty);
                        setSellQty((prev) => ({ ...prev, [key]: 1 }));
                      }}
                      className="mt-2 h-8 w-full border border-amber-500/40 bg-amber-600/90 font-bold uppercase tracking-wider text-black hover:bg-amber-500"
                    >
                      Vender {qty > 1 ? `×${qty}` : ""}
                    </Button>
                  </>
                )}

                {!hasStock && (
                  <p className="mt-2 text-[10px] text-subtle">No tienes este recurso</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-subtle">
          Comida y Agua solo se pueden vender en bloques de 30 minutos.
        </p>
      </section>

      {/* Health snapshot */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3 text-[11px] leading-5 text-subtle">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-300">Salud</p>
        <p>
          Salud actual: <span className="font-mono text-zinc-200">{state.health}/{BALANCE.maxHealth}</span>
          {" · "}Medicinas en mochila:{" "}
          <span className="font-mono text-zinc-200">{Math.floor(state.resources.medicamentos)}</span>
        </p>
        <p className="mt-1 text-[10px] text-subtle">Usa "USAR MEDICINA" desde la pantalla de Explorar.</p>
      </section>
    </div>
  );
}
