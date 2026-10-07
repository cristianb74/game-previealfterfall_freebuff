/**
 * AFTERFALL — Reporte de prueba: corrección #4 (3 puntos).
 *
 * Ejecutar:   bun scripts/balanceReport.ts
 *
 *  1) Balance daño ↔ medicamentos en exploración manual: mide con la MISMA
 *     semilla los valores ANTES (config original) y DESPUÉS (config actual).
 *  2) Scavenger: ignorar / saquear parcial (25-50-75-100) / saquear todo,
 *     preview de riesgo-botín, inventario y log.
 *  3) Aviso de energía: mensaje completo con faltante, tiempo y opción.
 */

import {
  BALANCE,
  MERCHANT_SELL_PRICES,
} from "../src/game/balance";
import { createInitialState } from "../src/game/saveSystem";
import { rollSurvivor } from "../src/game/survivorGenerator";
import { rollExploration } from "../src/game/explorationEngine";
import {
  ignoreScavenge,
  finishScavenge,
  searchScavengePoint,
  scavengePreview,
  scavengeTargetPoints,
} from "../src/game/scavenge";
import { SCAVENGE_PINS } from "../src/game/scavengeLocations";
import {
  canExplore,
  currentEnergy,
  energyShortfallInfo,
} from "../src/game/energySystem";
import { formatLogLine } from "../src/game/log";
import type { ActiveScavengeEvent, GameState } from "../src/game/types";

// ---------------------------------------------------------------
// RNG determinista (reporte reproducible).
// ---------------------------------------------------------------
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
Math.random = makeLcg(20261007);

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const f3 = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);

// Estado base: stats planas para que antes/después sean comparables.
const state = createInitialState(rollSurvivor(), Date.now());
state.survivor.stats = {
  fuerza: 5,
  resistencia: 5,
  agilidad: 5,
  percepcion: 5,
  inteligencia: 5,
  voluntad: 5,
};

// ===============================================================
// PUNTO 1 — daño vs medicamentos (antes / después)
// ===============================================================
console.log("=========================================================");
console.log(" PUNTO 1 · BALANCE DAÑO ↔ MEDICAMENTOS (exploración manual)");
console.log("=========================================================");
console.log(` configuración ACTUAL:`);
console.log(`   explorationIncidentChance = ${BALANCE.explorationIncidentChance}`);
console.log(
  `   incidentDamage (crudo)    = ${BALANCE.incidentDamage.map((i) => `${i.cause} ${i.damage[0]}-${i.damage[1]}`).join(" · ")}`,
);
console.log(
  `   escala por nivel/tipo     = +${BALANCE.incidentDamageZonePerLevel * 100}% por zona (tope ×${BALANCE.incidentDamageZoneMaxFactor}) · biome ${JSON.stringify(BALANCE.incidentDamageBiomeFactor)}`,
);
console.log(
  `   medicamentos              = peso ${BALANCE.resourceFindWeights.medicamentos} · tope ${BALANCE.findUnitsMaxByResource.medicamentos} u/hallazgo · venta ${MERCHANT_SELL_PRICES.medicamentos?.price} $/u`,
);
console.log("");

const SELL_MED = MERCHANT_SELL_PRICES.medicamentos?.price ?? 6;
const OLD_INCIDENTS = [
  { cause: "Vidrio roto", damage: [2, 6] },
  { cause: "Escombro caído", damage: [3, 8] },
  { cause: "Estructura colapsada", damage: [5, 12] },
  { cause: "Corte con metal oxidado", damage: [2, 5] },
  { cause: "Infección", damage: [3, 7] },
  { cause: "Animal herido", damage: [2, 6] },
  { cause: "Caída de altura", damage: [4, 10] },
  { cause: "Suelo inestable", damage: [3, 8] },
];

const ZONAS = [1, 4, 11, 20];
const N = 4000;

function simulate(zoneIds: number[], n: number) {
  const rows: Record<string, string>[] = [];
  for (const zid of zoneIds) {
    let incidents = 0;
    let dmgTotal = 0;
    let medFindings = 0;
    let medUnits = 0;
    for (let i = 0; i < n; i++) {
      const out = rollExploration(state, zid);
      for (const f of out.findings) {
        if (f.kind === "damage") {
          incidents++;
          dmgTotal += f.damage ?? 0;
        } else if (f.kind === "resource" && f.resource === "medicamentos") {
          medFindings++;
          medUnits += f.amount ?? 0;
        }
      }
    }
    rows.push({
      zona: `Z${String(zid).padStart(2, "0")}`,
      pInc: `${f3((incidents / n) * 100)}%`,
      danoInc: incidents ? f3(dmgTotal / incidents) : "0",
      danoExp: f3(dmgTotal / n),
      pMed: `${f3((medFindings / n) * 100)}%`,
      medU: f3(medUnits / n),
      "medU$": `${f3((medUnits / n) * SELL_MED)} $`,
    });
  }
  return rows;
}

function printTable(rows: Record<string, string>[]) {
  const cols: [string, string][] = [
    ["zona", "zona"],
    ["P(incidente)", "pInc"],
    ["daño/incidente", "danoInc"],
    ["daño/exploración", "danoExp"],
    ["P(medicamentos)", "pMed"],
    ["med u/exploración", "medU"],
    ["valor medic/expl.", "medU$"],
  ];
  const widths = cols.map(([h, k]) =>
    Math.max(h.length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  console.log("  " + cols.map(([h], i) => h.padEnd(widths[i])).join("  "));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) {
    console.log("  " + cols.map(([, k], i) => String(r[k] ?? "").padEnd(widths[i])).join("  "));
  }
}

// --- ANTES: se restaura la config original en caliente (solo medición).
const B = BALANCE as unknown as Record<string, unknown>;
const snapshot = {
  explorationIncidentChance: B.explorationIncidentChance,
  incidentDamage: B.incidentDamage,
  incidentDamageZonePerLevel: B.incidentDamageZonePerLevel,
  incidentDamageZoneMaxFactor: B.incidentDamageZoneMaxFactor,
  incidentDamageBiomeFactor: B.incidentDamageBiomeFactor,
  findUnitsMaxByResource: B.findUnitsMaxByResource,
  resourceFindWeights: B.resourceFindWeights,
};
B.explorationIncidentChance = 0.3;
B.incidentDamage = OLD_INCIDENTS;
B.incidentDamageZonePerLevel = 0; // factor 1 sin escala por zona
B.incidentDamageBiomeFactor = {
  urbano: 1, comercial: 1, medico: 1, industrial: 1, infraestructura: 1, militar: 1,
};
B.findUnitsMaxByResource = {};
B.resourceFindWeights = {};

console.log(" ANTES (valores originales):");
printTable(simulate(ZONAS, N));

Object.assign(B, snapshot); // ← vuelve a la config actual

console.log("\n DESPUÉS (config actual):");
const after = simulate(ZONAS, N);
printTable(after);

// ===============================================================
// PUNTO 2 — scavenger: ignorar / parcial / todo
// ===============================================================
console.log("\n=========================================================");
console.log(" PUNTO 2 · SCAVENGER (ignorar / parcial / todo)");
console.log("=========================================================");

function newEvent(zoneId: number): ActiveScavengeEvent {
  return {
    zoneId,
    startedAt: Date.now(),
    board: SCAVENGE_PINS.map((p) => ({ id: p.id, result: null })),
  };
}
const snapshotInventory = (s: GameState) => ({
  health: s.health,
  foodMin: s.foodMin,
  waterMin: s.waterMin,
  resources: { ...s.resources },
});

// --- a) IGNORAR
{
  state.scavengeEvent = newEvent(4);
  const before = snapshotInventory(state);
  const ok = ignoreScavenge(state);
  const line = state.log[0];
  check("2a · ignorar devuelve true y cierra el evento", ok && state.scavengeEvent === null);
  check(
    "2a · sin recursos consumidos y sin daño",
    before.health === state.health &&
      before.foodMin === state.foodMin &&
      before.waterMin === state.waterMin &&
      JSON.stringify(before.resources) === JSON.stringify(state.resources),
  );
  check(
    "2a · queda en el log de actividades como [SCAVENGE] ignorado",
    line?.category === "SCAVENGE" && line.subtype === "ignorado",
    line ? formatLogLine(line) : "sin línea",
  );
}

// --- b) PRESETS + PREVIEW (menos botín = menos riesgo)
{
  state.scavengeEvent = newEvent(4);
  const ev = state.scavengeEvent;
  const targets = [25, 50, 75, 100].map((p) => scavengeTargetPoints(ev, p));
  check("2b · presets 25/50/75/100 % → 2/4/6/8 de 8 puntos", targets.join(",") === "2,4,6,8", targets.join(","));
  const previews = [25, 50, 75, 100].map((p) => scavengePreview(state, ev, p));
  const riesgoOk = previews.every((p, i) => i === 0 || p.riesgoSalud >= previews[i - 1].riesgoSalud);
  const botinOk = previews.every((p, i) => i === 0 || p.hallazgos >= previews[i - 1].hallazgos);
  check(
    "2b · preview creciente: menos puntos = menos riesgo Y menos botín",
    riesgoOk && botinOk,
    previews.map((p, i) => `${[25, 50, 75, 100][i]}%: −${p.riesgoSalud} salud / ${p.hallazgos} hallazgos`).join(" · "),
  );

  // --- c) SAQUEO PARCIAL (50 %) + inventario == botín logueado
  const before = snapshotInventory(state);
  const target = scavengeTargetPoints(ev, 50);
  const results: { kind: string; amount: number; damage: number }[] = [];
  for (let i = 0; i < target; i++) {
    const r = searchScavengePoint(state, i);
    if (r) results.push({ kind: r.kind, amount: r.loot?.amount ?? 0, damage: r.damage ?? 0 });
  }
  const closed = finishScavenge(state);
  const looted = results.filter((r) => r.kind === "loot");
  const dmg = results.reduce((a, r) => a + r.damage, 0);
  const gained = (state.resources.materiales + state.resources.medicamentos + state.resources.componentes + state.resources.dinero + state.foodMin + state.waterMin)
    - (before.resources.materiales + before.resources.medicamentos + before.resources.componentes + before.resources.dinero + before.foodMin + before.waterMin);
  const expectedGain = looted.reduce((a, r) => a + r.amount, 0);
  check(
    "2c · parcial: busca sólo los puntos del preset y cierra el evento",
    state.scavengeEvent === null && closed.length === 8,
    `buscados=${results.length}/8, resultados=${closed.length}`,
  );
  check(
    "2c · el botín queda en inventario EXACTAMENTE una vez",
    gained === expectedGain && before.health - state.health === dmg,
    `inventario +${gained} (esperado ${expectedGain}) · salud −${dmg}`,
  );

  // --- d) SAQUEAR TODO (comportamiento original) + flujo no bloqueado
  state.scavengeEvent = newEvent(4);
  const ev2 = state.scavengeEvent;
  for (let i = 0; i < ev2.board.length; i++) searchScavengePoint(state, i);
  const closedAll = finishScavenge(state);
  const sinRevisar = closedAll.filter((r) => r.text === "Sin revisar.").length;
  check(
    "2d · saquear todo: 8/8 puntos y tablero completo",
    closedAll.length === 8 && sinRevisar === 0,
  );
  // nuevo evento después de cada camino → nada queda bloqueado
  state.scavengeEvent = newEvent(4);
  check("2d · el flujo sigue vivo: se puede abrir otro evento", state.scavengeEvent.board.length === 8);
  ignoreScavenge(state);
  check("2d · e ignorarlo también (ningún camino bloquea)", state.scavengeEvent === null);
}

// ===============================================================
// PUNTO 3 — aviso de energía
// ===============================================================
console.log("\n=========================================================");
console.log(" PUNTO 3 · AVISO SIN ENERGÍA");
console.log("=========================================================");
{
  const now = Date.now();
  state.resources.energia = 0;
  state.lastEnergyRegenAt = now - 60_000; // arrancó el ciclo hace 1 min
  const info = energyShortfallInfo(state, 1, now);
  check("3 · canExplore bloquea con energía 0", canExplore(state, now) === false);
  check(
    "3 · mensaje con requerido/actual",
    info.mensaje.includes("Necesitás 1") && info.mensaje.includes("tenés 0"),
    info.mensaje,
  );
  check(
    "3 · mensaje con el tiempo para el próximo punto",
    info.msToNextPoint > 0 && /Recuperás energía en \d{2}:\d{2}/.test(info.mensaje),
    `faltan ${Math.round(info.msToNextPoint / 1000)} s`,
  );
  check(
    "3 · mensaje con la opción de ítem (Batería + precio)",
    info.mensaje.includes("Batería") && info.mensaje.includes("Mercader") && info.mensaje.includes("$"),
  );
  check("3 · falta calculado", info.falta === 1 && info.required === 1 && info.actual === 0);
  // recién sale el punto → countdown chico, no negativo
  state.lastEnergyRegenAt = now - 299_000;
  const info2 = energyShortfallInfo(state, 1, now);
  check("3 · countdown siempre ≥ 0", info2.msToNextPoint >= 0 && info2.msToNextPoint <= 60_000);
  check("3 · energía recuperada → canExplore vuelve a true", (() => {
    state.resources.energia = 1;
    return canExplore(state, now) && currentEnergy(state, now) >= 1;
  })());
}

console.log("\n=========================================================");
console.log(` RESULTADO: ${pass} PASS / ${fail} FAIL`);
console.log("=========================================================");
process.exit(fail === 0 ? 0 : 1);
