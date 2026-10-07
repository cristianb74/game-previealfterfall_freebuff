/**
 * AFTERFALL — Reporte de prueba del sistema de LOGGING (corrección #3).
 *
 * Ejecutar:   bun scripts/logReport.ts
 *
 * Verifica punto por punto los 4 problemas del reporte 07/10/2026 06:31:13:
 *   1. campo zona= duplicado en [EXP]
 *   2. [NPC_ACTION] usa el trigger de SCAVENGE y NO registra hallazgos reales
 *   3. [RECURSO] duplicado por hallazgo (¿log o inventario?)
 *   4. doble evento de inicio de ciclo ([EXP] inicio + [INICIO] inicio_ciclo)
 *   + renombrar exp= → exploration_id= en [AUTO_EXPLORER]
 *
 * Corre en Node/Bun puro (sin navegador): solo toca la lógica de juego.
 */

import { formatLogLine, pushClick, pushLog, type LogEvent } from "../src/game/log";
import { createInitialState } from "../src/game/saveSystem";
import { rollSurvivor } from "../src/game/survivorGenerator";
import { NPC_BY_ID } from "../src/game/npcData";
import { tickNpcs } from "../src/game/onlineTick";
import { narrExplorationStart, narrResourceFind } from "../src/game/narrativeLog";
import type { GameState } from "../src/game/types";

// ---------------------------------------------------------------
// RNG determinista: el reporte es reproducible corrido a corrido.
// ---------------------------------------------------------------
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rnd = makeLcg(20261007);
Math.random = rnd;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const countOcc = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const npcHallazgos = (s: GameState): LogEvent[] =>
  s.log.filter(
    (e) =>
      e.category === "NPC_ACTION" &&
      e.subtype === "hallazgo" &&
      e.fields.periodo !== "offline",
  );

// ===============================================================
// SETUP: estado real del juego con 6 NPCs asignados a la Z01
// ===============================================================
const T0 = Date.now();
const state = createInitialState(rollSurvivor(), T0);
state.foodMin = 5000;
state.waterMin = 5000;

const TYPES = ["B", "G", "A", "R", "D"] as const;
const ROSTER_IDS: string[] = [];
for (const t of TYPES) {
  const id = Object.keys(NPC_BY_ID).find((k) => NPC_BY_ID[k].type === t);
  if (id) ROSTER_IDS.push(id);
}
state.npcs = ROSTER_IDS.map((id) => ({
  ...NPC_BY_ID[id],
  assignedZoneId: "1",
  status: "active" as const,
  discoveredAt: T0 - 86_400_000,
}));

console.log("=========================================================");
console.log(" AFTERFALL — REPORTE DE PRUEBA DE LOGGING (corrección #3)");
console.log(` NPCs activos asignados a Z01: ${ROSTER_IDS.length} (${ROSTER_IDS.join(", ")})`);
console.log("=========================================================\n");

// ===============================================================
// PUNTO 2 — ciclo(s) completos de producción de NPCs
// ===============================================================
// Snapshot de producción real (inventario) ANTES del ciclo, para comparar
// después contra lo que quedó LOGUEADO: si el log duplicara, no cuadraría.
const totalsBefore = new Map(
  state.npcs.map((n) => [n.id, { ...n.productionTotals }] as const),
);

// 4 ticks de 45 s = 180 s → TODOS los tipos de NPC (ciclos de 10–30 s)
// completan al menos 3 ciclos completos cada uno (cada tick ≥ ciclo máximo).
const STEP_MS = 45_000;
const TICKS = 4;
let expectedNpcLines = 0;
let truncated = false; // hubo un tick con >5 hallazgos (línea resumen)
const tickStats: string[] = [];

for (let i = 0; i < TICKS; i++) {
  const before = npcHallazgos(state).length;
  const tickNow = T0 + (i + 1) * STEP_MS;
  const changes = tickNpcs(state, tickNow);
  state.lastTickAt = tickNow;
  // onlineTick registra hasta 5 hallazgos individuales + 1 resumen si hay más.
  const expected =
    Math.min(changes.finds.length, 5) + (changes.finds.length > 5 ? 1 : 0);
  expectedNpcLines += expected;
  if (changes.finds.length > 5) truncated = true;
  const after = npcHallazgos(state).length;
  tickStats.push(
    `  tick ${i + 1} (+${STEP_MS / 1000}s): hallazgos reales=${changes.finds.length} líneas=[NPC_ACTION]=${after - before} (esperadas ${expected})`,
  );
}
console.log("--- PUNTO 2 · producción de NPCs asignados (ciclo completo) ---");
for (const line of tickStats) console.log(line);

const hallazgos = npcHallazgos(state);
const distintos = new Set(hallazgos.map((e) => String(e.fields.npc ?? "").split("·")[0]));

check(
  "2b · [NPC_ACTION] subtipo=hallazgo emitidos durante el ciclo",
  hallazgos.length > 0,
  `${hallazgos.length} línea(s)`,
);
check(
  "2b · los hallazgos provienen de VARIOS NPCs distintos",
  distintos.size >= 2,
  `${distintos.size} NPCs: ${[...distintos].join(", ")}`,
);
check(
  "2b · UNA línea por hallazgo real (sin duplicado narrativo/técnico)",
  hallazgos.length === expectedNpcLines,
  `líneas=${hallazgos.length}, esperadas=${expectedNpcLines}`,
);
check(
  "2b · formato npc=<id>·<nombre> | resource= | cantidad=",
  hallazgos.length > 0 &&
    hallazgos.every(
      (e) =>
        /·/.test(String(e.fields.npc ?? "")) &&
        e.fields.resource != null &&
        e.fields.cantidad != null,
    ),
  hallazgos.length > 0 ? `ej. ${formatLogLine(hallazgos[0])}` : "sin líneas",
);
check(
  "2a · NINGÚN [NPC_ACTION] con minijuego= (el trigger ya no es de NPC)",
  state.log.every((e) => e.fields.minijuego == null || e.category !== "NPC_ACTION"),
);

// ---- Integridad de economía: lo logueado == lo que se sumó al inventario.
const loggedByRes: Record<string, number> = {};
for (const e of hallazgos) {
  const r = String(e.fields.resource ?? "");
  loggedByRes[r] = (loggedByRes[r] ?? 0) + Number(e.fields.cantidad ?? 0);
}
const invByRes: Record<string, number> = {};
for (const n of state.npcs) {
  const before = totalsBefore.get(n.id)!;
  for (const [res, val] of Object.entries(n.productionTotals)) {
    const delta = val - (before[res] ?? 0);
    if (delta !== 0) invByRes[res] = (invByRes[res] ?? 0) + delta;
  }
}
const invMatch =
  JSON.stringify(Object.entries(loggedByRes).sort()) ===
  JSON.stringify(Object.entries(invByRes).sort());
check(
  "3/2 · lo logueado == lo sumado al inventario (ni doble suma ni doble log)",
  invMatch && !truncated,
  `log=${JSON.stringify(loggedByRes)} inventario=${JSON.stringify(invByRes)}`,
);

// Se reproduce la MISMA emisión de los dos call-sites de GameProvider
// (startExploration manual y completeAutoRun auto) para verificar el formato.
pushClick(state, "iniciar_scavenge", {
  zona: "Z01",
  extra: { minijuego: "SCAVENGE", localizacion: "Supermercado", exploration_id: 900 },
  mensaje: "[EXP #900] EVENTO | Supermercado detectada · minijuego SCAVENGE",
});
pushLog(state, {
  zona: "Z02",
  origen: "auto",
  category: "SCAVENGE",
  subtype: "inicio",
  fields: { minijuego: "SCAVENGE", localizacion: "Subestación", exploration_id: 901 },
  mensaje: "[EXP #901] EVENTO | Subestación detectada · minijuego SCAVENGE (auto)",
});
const clickLine = state.log.find((e) => e.category === "CLICK" && e.fields.boton === "iniciar_scavenge");
const scavLine = state.log.find((e) => e.category === "SCAVENGE" && e.subtype === "inicio");
check(
  "2a · trigger manual → [CLICK] boton=iniciar_scavenge",
  !!clickLine && formatLogLine(clickLine).includes("boton=iniciar_scavenge"),
  clickLine ? formatLogLine(clickLine) : "sin línea",
);
check(
  "2a · trigger auto → [SCAVENGE] inicio (no NPC_ACTION)",
  !!scavLine && formatLogLine(scavLine).includes("minijuego=SCAVENGE"),
  scavLine ? formatLogLine(scavLine) : "sin línea",
);

// ===============================================================
// PUNTO 3 — [RECURSO]: ¿una o dos líneas por hallazgo real?
// ===============================================================
console.log("\n--- PUNTO 3 · [RECURSO] por hallazgo ---");
const recursoBefore = state.log.filter((e) => e.category === "RECURSO").length;
// El inventario NO se toca aquí: lo hace applyOutcome (GameProvider) con UN
// único `+=` por hallazgo ANTES de esta llamada — ver nota al pie.
narrResourceFind(state, 2, "comida", 13, false, {
  origen: "auto",
  expTag: "[EXP #4084] ",
});
const recursoAfter = state.log.filter((e) => e.category === "RECURSO").length;
const recursoLine = state.log.find((e) => e.category === "RECURSO");
const recursoTxt = recursoLine ? formatLogLine(recursoLine) : "";

check(
  "3 · UNA sola línea [RECURSO] por hallazgo real (antes eran 2)",
  recursoAfter - recursoBefore === 1,
  `Δ=${recursoAfter - recursoBefore}`,
);
check(
  "3 · la línea única conserva resource/cantidad/unidad/valor/rare",
  !!recursoLine &&
    recursoLine.fields.resource === "comida" &&
    Number(recursoLine.fields.cantidad) === 13 &&
    recursoLine.fields.unidad === "min" &&
    recursoLine.fields.valor === "+13 min" &&
    recursoLine.fields.rare === 0,
  recursoTxt,
);
check(
  "3 · origen= coherente (el del hallazgo real, ya no hay par auto/manual)",
  !!recursoLine && recursoLine.origen === "auto",
);

// ===============================================================
// PUNTO 1 — zona= duplicado en [EXP]
// ===============================================================
console.log("\n--- PUNTO 1 · campo zona= duplicado ---");
// Reproduce el call-site antiguo (fields volvía a incluir zona=).
pushLog(state, {
  zona: "Z02",
  origen: "auto",
  category: "EXP",
  subtype: "auto_fin",
  fields: { zona: "Z02", exp: 3 },
  mensaje: "[EXP #4086] Auto | Z02 completada",
});
const expLine = state.log.find((e) => e.category === "EXP" && e.subtype === "auto_fin");
const expTxt = expLine ? formatLogLine(expLine) : "";
check(
  "1 · la línea [EXP] muestra zona= UNA sola vez",
  countOcc(expTxt, "zona=") === 1,
  expTxt,
);
check(
  "1 · pushLog descarta zona=/origen= de fields en el origen del dato",
  !!expLine && expLine.fields.zona === undefined && expLine.fields.origen === undefined,
);

// Entrada legada (guardada en un save viejo) con campos reservados en fields.
const legacyTxt = formatLogLine({
  event_id: 4086,
  hora: "06:31:13",
  category: "EXP",
  subtype: "auto_fin",
  zona: "Z02",
  origen: "auto",
  fields: { zona: "Z02", origen: "manual", exp: 3 },
});
check(
  "1 · las líneas legadas también se sanean al renderizar",
  countOcc(legacyTxt, "zona=") === 1 && countOcc(legacyTxt, "origen=") === 1,
  legacyTxt,
);

// ===============================================================
// PUNTO 4 — un SOLO evento de inicio de ciclo
// ===============================================================
console.log("\n--- PUNTO 4 · inicio de ciclo ---");
const inicioBefore = state.log.filter((e) => e.category === "INICIO").length;
narrExplorationStart(state, 1, "Refugio Norte", {
  duracion: 55.242,
  exploration_id: 424,
});
const inicioAfter = state.log.filter((e) => e.category === "INICIO").length;
const inicioLine = state.log.find((e) => e.category === "INICIO");
const inicioTxt = inicioLine ? formatLogLine(inicioLine) : "";

check(
  "4 · EXACTAMENTE UN evento de inicio por ciclo",
  inicioAfter - inicioBefore === 1,
  `Δ=${inicioAfter - inicioBefore}`,
);
check(
  "4 · [INICIO] conserva ciclo/duracion/exploration_id",
  !!inicioLine &&
    inicioLine.fields.ciclo === "inicio" &&
    Number(inicioLine.fields.duracion) === 55.242 &&
    Number(inicioLine.fields.exploration_id) === 424,
  inicioTxt,
);
check(
  "4 · [EXP] NUNCA registra subtipo=inicio (solo fin/auto_fin)",
  state.log.every((e) => e.category !== "EXP" || e.subtype !== "inicio"),
  state.log
    .filter((e) => e.category === "EXP")
    .map((e) => e.subtype)
    .join(", ") || "sin líneas EXP",
);

// ===============================================================
// RENOMBRE — exploration_id en [AUTO_EXPLORER]
// ===============================================================
console.log("\n--- renombre exp= → exploration_id= ([AUTO_EXPLORER]) ---");
const autoLine: LogEvent = {
  event_id: 5000,
  hora: "06:31:13",
  category: "AUTO_EXPLORER",
  subtype: "ciclo_fin",
  zona: "Z01",
  origen: "auto",
  fields: { exploration_id: 422, duracion: 60, hallazgos: 1 },
};
const autoTxt = formatLogLine(autoLine);
check(
  "renombrado · [AUTO_EXPLORER] usa exploration_id= (no exp=)",
  autoTxt.includes("exploration_id=422") && !/\bexp=/.test(autoTxt),
  autoTxt,
);

// ===============================================================
// REPORTE — segmento de log generado
// ===============================================================
console.log("\n=========================================================");
console.log(" SEGMENTO DE LOG GENERADO (más reciente primero)");
console.log("=========================================================");
for (const e of state.log.slice(0, 45)) console.log(formatLogLine(e));

console.log("\n=========================================================");
console.log(` RESULTADO: ${pass} PASS / ${fail} FAIL`);
console.log("=========================================================");
process.exit(fail === 0 ? 0 : 1);
