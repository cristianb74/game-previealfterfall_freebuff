import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useGame, MERCHANT_OFFERS } from "@/game/GameProvider";
import { BALANCE, MERCHANT_SELL_PRICES, MERCHANT_BATTERY_OFFER } from "@/game/balance";
import { currentEnergy } from "@/game/energySystem";
import { vnow } from "@/game/virtualClock";
import type { ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

const OFFER_ORDER = ["materiales", "medicamentos", "componentes", "comida", "agua"] as const;
type OfferKey = (typeof OFFER_ORDER)[number];

const SELL_ORDER = ["materiales", "medicamentos", "componentes", "comida", "agua"] as const;
type SellKey = (typeof SELL_ORDER)[number];

const QTY_SHORTCUTS = [10, 100, 1000] as const;

/** Accent tone of a trade card: green = buy, amber = sell. */
type Tone = "green" | "amber";

const TONE_STYLES: Record<
  Tone,
  { section: string; heading: string; amount: string; confirm: string; shortcut: string }
> = {
  green: {
    section: "border-green-500/30",
    heading: "text-green-500",
    amount: "text-green-500",
    confirm: "border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-wider text-black hover:bg-green-500",
    shortcut: "border-green-500/30 bg-green-950/40 text-green-400 hover:bg-green-900/50",
  },
  amber: {
    section: "border-amber-800/40",
    heading: "text-amber-400",
    amount: "text-amber-400",
    confirm: "border border-amber-500/40 bg-amber-600/90 font-bold uppercase tracking-wider text-black hover:bg-amber-500",
    shortcut: "border-amber-500/30 bg-amber-950/40 text-amber-400 hover:bg-amber-900/50",
  },
};

function getMaxSellQty(
  key: SellKey,
  state: { resources: Record<ResourceKey, number>; foodMin: number; waterMin: number },
): number {
  const offer = MERCHANT_SELL_PRICES[key];
  if (!offer) return 0;
  if (key === "comida") return Math.floor(state.foodMin / offer.amount);
  if (key === "agua") return Math.floor(state.waterMin / offer.amount);
  return Math.floor(state.resources[key] / offer.amount);
}

/** Quantity selector row: −/+ plus optional ×10/×100/×1000 shortcuts
 *  (each jumps the qty to that multiple, clamped to maxQty). */
function QtyControls({
  qty,
  maxQty,
  onChange,
  total,
  tone,
  withShortcuts,
}: {
  qty: number;
  maxQty: number;
  onChange: (next: number) => void;
  total: string;
  tone: Tone;
  withShortcuts: boolean;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={qty <= 1}
        onClick={() => onChange(Math.max(1, qty - 1))}
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
        onClick={() => onChange(Math.min(maxQty, qty + 1))}
        className="size-7 rounded-sm border border-zinc-700 bg-zinc-800 text-sm font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
      >
        +
      </button>
      {withShortcuts &&
        QTY_SHORTCUTS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={maxQty < 1}
            onClick={() => onChange(Math.min(maxQty, m))}
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider disabled:opacity-30",
              s.shortcut,
            )}
          >
            ×{m}
          </button>
        ))}
      <span className="ml-auto text-[10px] text-subtle">
        {totalLabelPrefix[tone]}{" "}
        <span className={cn("font-mono font-bold", TONE_STYLES[tone].amount)}>{total}</span>
      </span>
    </div>
  );
}

const totalLabelPrefix: Record<Tone, string> = { green: "Pagarás:", amber: "Recibirás:" };

/** One trade card: name + unit price, qty controls with running total and a
 *  confirm button. Shared by Comprar (verde) and Vender (ámbar). */
function TradeCard({
  name,
  unitLine,
  qty,
  maxQty,
  total,
  confirmLabel,
  confirmDisabled,
  onQtyChange,
  onConfirm,
  tone,
  withShortcuts,
}: {
  name: string;
  unitLine: string;
  qty: number;
  maxQty: number;
  total: string;
  confirmLabel: string;
  confirmDisabled: boolean;
  onQtyChange: (next: number) => void;
  onConfirm: () => void;
  tone: Tone;
  withShortcuts: boolean;
}) {
  const hasStock = maxQty > 0;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        hasStock ? "border-zinc-700 bg-[#0d0f10]" : "border-zinc-800/50 bg-[#0d0f10]/50 opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-200">{name}</span>
        <span className={cn("font-mono text-sm font-black", TONE_STYLES[tone].amount)}>
          {unitLine}
        </span>
      </div>

      {hasStock ? (
        <>
          <QtyControls
            qty={qty}
            maxQty={maxQty}
            onChange={onQtyChange}
            tone={tone}
            withShortcuts={withShortcuts}
            total={total}
          />
          <Button
            size="sm"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={cn("mt-2 h-8 w-full", TONE_STYLES[tone].confirm)}
          >
            {confirmLabel}
          </Button>
        </>
      ) : (
        <p className="mt-2 text-[10px] text-subtle">{emptyLabel[tone]}</p>
      )}
    </div>
  );
}

const emptyLabel: Record<Tone, string> = {
  green: "Sin dinero suficiente",
  amber: "No tienes este recurso",
};

export function MercaderTab() {
  const { state, buyResource, buyBattery, sellResource } = useGame();
  const [, force] = useState(0);
  const [buyQty, setBuyQty] = useState<Record<OfferKey, number>>({
    materiales: 1, medicamentos: 1, componentes: 1, comida: 1, agua: 1,
  });
  const [sellQty, setSellQty] = useState<Record<SellKey, number>>({
    materiales: 1, medicamentos: 1, componentes: 1, comida: 1, agua: 1,
  });

  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const money = Math.floor(state.resources.dinero);
  const energy = currentEnergy(state, vnow());
  const batteryMax = Math.floor((BALANCE.maxEnergy - energy) / MERCHANT_BATTERY_OFFER.energy);

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

      {/* Buy section (green) */}
      <section className={cn("rounded-lg border bg-[#101213] p-3", TONE_STYLES.green.section)}>
        <p className={cn("mb-2 text-xs font-bold uppercase tracking-widest", TONE_STYLES.green.heading)}>
          Comprar
        </p>
        <div className="flex flex-col gap-3">
          {OFFER_ORDER.map((key) => {
            const offer = MERCHANT_OFFERS[key];
            if (!offer) return null;
            const maxQty = Math.floor(money / offer.price);
            const qty = Math.max(1, Math.min(buyQty[key], maxQty));
            const totalMoney = offer.price * qty;
            return (
              <TradeCard
                key={key}
                name={offer.label}
                unitLine={`$${offer.price}`}
                qty={qty}
                maxQty={maxQty}
                total={`$${totalMoney}`}
                confirmLabel={`Comprar ${qty > 1 ? `×${qty}` : ""}`}
                confirmDisabled={money < totalMoney}
                onQtyChange={(next) => setBuyQty((prev) => ({ ...prev, [key]: next }))}
                onConfirm={() => {
                  buyResource(key, qty);
                  setBuyQty((prev) => ({ ...prev, [key]: 1 }));
                }}
                tone="green"
                withShortcuts
              />
            );
          })}

          {/* Battery: energy item — no ×10/×100/×1000 shortcuts, qty always 1.
              Blocked entirely when the +10 would not fit under maxEnergy. */}
          <div
            className={cn(
              "rounded-md border px-3 py-2.5",
              batteryMax >= 1 ? "border-zinc-700 bg-[#0d0f10]" : "border-zinc-800/50 bg-[#0d0f10]/50 opacity-60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">⚡ {MERCHANT_BATTERY_OFFER.label}</span>
              <span className={cn("font-mono text-sm font-black", TONE_STYLES.green.amount)}>
                ${MERCHANT_BATTERY_OFFER.price}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-subtle">
              +{MERCHANT_BATTERY_OFFER.energy} Energía · {Math.floor(energy)}/{BALANCE.maxEnergy} ahora
            </p>
            {batteryMax >= 1 ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="ml-auto text-[10px] text-subtle">
                    {totalLabelPrefix.green}{" "}
                    <span className={cn("font-mono font-bold", TONE_STYLES.green.amount)}>
                      ${MERCHANT_BATTERY_OFFER.price}
                    </span>
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={money < MERCHANT_BATTERY_OFFER.price}
                  onClick={() => buyBattery(1)}
                  className={cn("mt-2 h-8 w-full", TONE_STYLES.green.confirm)}
                >
                  Comprar
                </Button>
              </>
            ) : (
              <p className="mt-2 text-[10px] text-subtle">
                Sin margen: la batería da +{MERCHANT_BATTERY_OFFER.energy} y tienes {Math.floor(energy)}/{BALANCE.maxEnergy}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Sell section (amber) */}
      <section className={cn("rounded-lg border bg-[#101213] p-3", TONE_STYLES.amber.section)}>
        <p className={cn("mb-2 text-xs font-bold uppercase tracking-widest", TONE_STYLES.amber.heading)}>
          Vender
        </p>
        <div className="flex flex-col gap-3">
          {SELL_ORDER.map((key) => {
            const offer = MERCHANT_SELL_PRICES[key];
            if (!offer) return null;
            const maxQty = getMaxSellQty(key, state);
            const qty = Math.max(1, Math.min(sellQty[key], maxQty));
            const totalMoney = offer.price * qty;
            const totalAmount = offer.amount * qty;
            const unit = key === "comida" || key === "agua" ? `min ${key}` : key;
            const currentStock = key === "comida"
              ? `${Math.floor(state.foodMin)} min`
              : key === "agua"
                ? `${Math.floor(state.waterMin)} min`
                : `${Math.floor(state.resources[key])}`;

            return (
              <TradeCard
                key={key}
                name={offer.label}
                unitLine={`$${offer.price} · ${offer.amount} ${unit}`}
                qty={qty}
                maxQty={maxQty}
                total={`$${totalMoney}`}
                confirmLabel={`Vender ${qty > 1 ? `×${qty}` : ""}`}
                confirmDisabled={qty < 1}
                onQtyChange={(next) => setSellQty((prev) => ({ ...prev, [key]: next }))}
                onConfirm={() => {
                  sellResource(key, qty);
                  setSellQty((prev) => ({ ...prev, [key]: 1 }));
                }}
                tone="amber"
                withShortcuts
              />
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-subtle">
          Comida y Agua solo se pueden vender en bloques de 30 minutos.
        </p>
      </section>
    </div>
  );
}
