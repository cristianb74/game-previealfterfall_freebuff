import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGame, MERCHANT_OFFERS } from "@/game/GameProvider";
import { BALANCE } from "@/game/balance";
import { cn } from "@/lib/utils";

const OFFER_ORDER = ["materiales", "medicamentos", "componentes", "comida", "agua"] as const;
type OfferKey = (typeof OFFER_ORDER)[number];

export function MercaderTab() {
  const { state, buyResource } = useGame();
  const [, force] = useState(0);

  // Money counter re-renders the moment a purchase lands.
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const money = Math.floor(state.resources.dinero);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Comercio de supervivencia · sin dinero premium
      </p>

      {/* Wallet */}
      <section className="rounded-lg border border-green-500/30 bg-[#101213] p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Tu dinero</p>
        <p className="mt-1 font-mono text-3xl font-black text-green-500">$ {money}</p>
        <p className="mt-1 text-[10px] text-zinc-600">
          Se encuentra explorando zonas. No existe dinero premium ni compras reales.
        </p>
      </section>

      {/* Offers */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Mercancías</p>
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
        <p className="mt-3 text-[10px] leading-4 text-zinc-600">
          La comida y el agua compradas se suman a tu tiempo de supervivencia. Los materiales,
          medicamentos y componentes van al almacén de la mochila.
        </p>
      </section>

      {/* Health snapshot so "USAR MEDICINA" stays reachable from the merchant too */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3 text-[11px] leading-5 text-zinc-500">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-300">Salud</p>
        <p>
          Salud actual: <span className="font-mono text-zinc-200">{state.health}/{BALANCE.maxHealth}</span>
          {" · "}Medicinas en mochila:{" "}
          <span className="font-mono text-zinc-200">{Math.floor(state.resources.medicamentos)}</span>
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">Usa "USAR MEDICINA" desde la pantalla de Explorar.</p>
      </section>
    </div>
  );
}
