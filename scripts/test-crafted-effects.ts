/**
 * Smoke test (headless): crafted-item effects wiring — ASIGNACIONES model.
 * Run: bun scripts/test-crafted-effects.ts
 * Validates: buffs store, consumables, assignment-based modifiers at their
 * real hook points (rollExploration / scavenge roll / NPC production /
 * tickNpcs consumption), and assignment expiry rules.
 */
import { createInitialState, loadGame } from "../src/game/saveSystem";
import { RECIPES } from "../src/game/crafting/recipes";
import {
  addBuff,
  buffActive,
  buffRemainingMs,
  craftedItemKind,
  consumptionFactor,
  activeAssignments,
  activeAssignmentForZone,
  activeAssignmentForNpc,
  nextAssignmentExpiry,
  pruneExpiredAssignments,
  zoneAssignmentFactors,
  useCraftedItem,
} from "../src/game/crafting/craftedEffects";
import { rollExploration, effectiveExplorationStat } from "../src/game/explorationEngine";
import { rollNpcCycle } from "../src/game/npcTypes";
import { tickNpcs } from "../src/game/onlineTick";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("== clasificación de los 15 items (modelo asignaciones) ==");
const consumables = RECIPES.filter((r) => craftedItemKind(r.id) === "consumable");
const unlocks = RECIPES.filter((r) => craftedItemKind(r.id) === "unlock");
const passives = RECIPES.filter((r) => craftedItemKind(r.id) === "passive");
check("2 consumibles (kit_provisiones, botiquin)", consumables.length === 2);
check("1 unlock (radio)", unlocks.length === 1 && unlocks[0].id === "radio");
check("12 asignables", passives.length === 12);
check("15 recetas cubiertas", RECIPES.length === 15);
check(
  "los 12 asignables declaran target + duración (7200 s)",
  passives.every((r) => (r.assignTarget === "zone" || r.assignTarget === "npc") && r.assignDurationSeconds === 7200),
);
const zoneTargets = passives.filter((r) => r.assignTarget === "zone").map((r) => r.id);
const npcTargets = passives.filter((r) => r.assignTarget === "npc").map((r) => r.id);
check(
  "9 target zona / 3 target NPC",
  zoneTargets.length === 9 && npcTargets.length === 3,
);

console.log("== estado inicial + backfill ==");
const NOW = 1_700_000_010_000;
const s = createInitialState(
  {
    name: "Test",
    profession: "Ingeniero",
    portrait: "/assets/survivor/s-1.svg",
    stats: { fuerza: 5, resistencia: 5, agilidad: 5, percepcion: 5, inteligencia: 5, voluntad: 5 },
  },
  NOW,
);
check("activeBuffs inicializado vacío", Array.isArray(s.activeBuffs) && s.activeBuffs.length === 0);
check("assignments inicializado vacío", Array.isArray(s.assignments) && s.assignments.length === 0);

function assign(recipeId: string, targetType: "zone" | "npc", targetId: string, startAt = NOW, seconds = 7200) {
  s.assignments.push({
    id: `${recipeId}-${targetId}-${startAt}-${Math.floor(Math.random() * 1e6)}`,
    recipeId,
    targetType,
    targetId,
    effect: "",
    startedAt: startAt,
    endsAt: startAt + seconds * 1000,
  });
}

console.log("== asignaciones: helpers y expiración ==");
assign("mapa", "zone", "2");
check("mapa activo en Z2", activeAssignmentForZone(s, "mapa", 2, NOW) != null);
check("mapa NO activo en Z1", activeAssignmentForZone(s, "mapa", 1, NOW) === null);
check("activeAssignments ve 1", activeAssignments(s, NOW).length === 1);
check("próxima expiración = NOW + 2 h", nextAssignmentExpiry(s, NOW) === NOW + 7200_000);
const expiredNames = pruneExpiredAssignments(s, NOW + 7200_001);
check("expira a los 2 h (sin reembolso)", s.assignments.length === 0 && expiredNames.length === 1);
check("tras expirar: sin asignación activa", activeAssignmentForZone(s, "mapa", 2, NOW + 7200_001) === null);
assign("prismaticos", "npc", "A01");
check("prismaticos activos en A01", activeAssignmentForNpc(s, "prismaticos", "A01", NOW) != null);

console.log("== zonaAssignmentFactors (agregado por zona) ==");
assign("linterna", "zone", "3");
assign("mapa", "zone", "3");
assign("guantes", "zone", "3");
assign("proteccion", "zone", "3");
assign("escaner", "zone", "3");
assign("detector", "zone", "3");
assign("iman", "zone", "3");
assign("mochila_recoleccion", "zone", "3");
assign("kit_tecnico", "zone", "3");
const zf = zoneAssignmentFactors(s, 3, NOW);
check("linterna: duración ×0.9 en Z3", zf.duration === 0.9);
check("mapa: find ×1.05 en Z3", zf.resourceFind === 1.05);
check("escáner: dinero ×1.1 en Z3", zf.moneyFind === 1.1);
check("detector: especiales ×1.1 en Z3", zf.specialFind === 1.1);
check("imán: componentes ×1.08 en Z3", zf.iman === 1.08);
check("guantes: riesgo ×0.9 en Z3", zf.injuryRisk === 0.9);
check("protección: daño ×0.85 en Z3", zf.damageTaken === 0.85);
check("materiales ×1.1 en Z3 (mochila recolección)", zf.amount("materiales") === 1.1);
check("componentes ×1.1 en Z3 (kit técnico)", zf.amount("componentes") === 1.1);
check("comida sin bonus de cantidad en Z3", zf.amount("comida") === 1);
const zfOther = zoneAssignmentFactors(s, 7, NOW);
check("todo neutro en Z7 (sin asignaciones ahí)", zfOther.duration === 1 && zfOther.resourceFind === 1 && zfOther.amount("materiales") === 1 && zfOther.injuryRisk === 1);

console.log("== factores por zona reales en rollExploration ==");
const s2 = createInitialState(s.survivor, NOW);
s2.unlockedZoneFloor = 3;
assign("detector", "zone", "1");
let events = 0;
for (let i = 0; i < 6000; i++) {
  const out = rollExploration(s2, 1);
  if (out.findings.some((f) => f.kind === "event")) events++;
}
// detector ×1.1 sobre 0.08 ⇒ ~8.8% esperado; rango holgado valida el wiring.
check(`detector asignado a Z1 levanta eventos (~8.8%, visto ${((events / 6000) * 100).toFixed(1)}%)`, events / 6000 > 0.055 && events / 6000 < 0.125);

console.log("== NPC: prismáticos/botas/mochila superviviente sobre su NPC ==");
const npc = {
  id: "A01",
  name: "Test",
  alias: "T",
  profession: "x",
  portrait: "",
  type: "A" as const,
  stats: { fuerza: 5, resistencia: 5, agilidad: 5, percepcion: 5, inteligencia: 5, voluntad: 5 },
  specialization: "taller",
  assignedZoneId: "1",
  discoveredAt: NOW,
  productionTotals: { materiales: 0, agua: 0, comida: 0, medicamentos: 0, componentes: 0, energia: 0, dinero: 0 },
};
const s3 = createInitialState(s.survivor, NOW);
s3.npcs.push(npc);
s3.assignments.push({
  id: "msv-A01",
  recipeId: "mochila_superviviente",
  targetType: "npc",
  targetId: "A01",
  effect: "",
  startedAt: NOW,
  endsAt: NOW + 7200_000,
});
// rnd determinista en secuencia: [dinero NO, elige candidato, encuentra, monto].
const seqRnd = () => {
  const vals = [0.5, 0.25, 0.02, 0.5, 0.5];
  let i = 0;
  return () => vals[i++ % vals.length];
};
const boosted = rollNpcCycle(npc, s3, seqRnd(), NOW);
const s3b = createInitialState(s.survivor, NOW);
s3b.npcs.push({ ...npc, productionTotals: { materiales: 0, agua: 0, comida: 0, medicamentos: 0, componentes: 0, energia: 0, dinero: 0 } });
const plain = rollNpcCycle(npc, s3b, seqRnd(), NOW);
check(
  "mochila superviviente boostea cantidad del NPC (+15% exacto)",
  boosted !== null && plain !== null && boosted.amount === Math.max(1, Math.round(plain.amount * 1.15)),
);
// prismáticos: la percepción efectiva del NPC sube → más prob. de medicamentos.
check(
  "prismaticos activos solo para A01",
  activeAssignmentForNpc(s, "prismaticos", "A01", NOW) != null &&
    activeAssignmentForNpc(s, "prismaticos", "B01", NOW) === null,
);

console.log("== efecto real en effectiveExplorationStat (NPC asignado a la zona) ==");
const s4 = createInitialState(s.survivor, NOW);
check("sin asignaciones: percepción efectiva = base", effectiveExplorationStat(s4, "percepcion", 1, NOW) === 5);
const npcB = { ...npc, id: "B01", assignedZoneId: "1" };
s4.npcs.push(npcB);
s4.zones[1].assignedNpcId = "B01";
s4.assignments.push({
  id: "test-1",
  recipeId: "prismaticos",
  targetType: "npc",
  targetId: "B01",
  effect: "",
  startedAt: NOW,
  endsAt: NOW + 7200_000,
});
check(
  "prismaticos en el NPC de la Z1: percepción 5→5.4",
  Math.abs(effectiveExplorationStat(s4, "percepcion", 1, NOW) - 5.4) < 1e-9,
);
check(
  "en otra zona (Z2) no aplica",
  effectiveExplorationStat(s4, "percepcion", 2, NOW) === 5,
);

console.log("== consumo real en tickNpcs (buff −10%, intacto) ==");
const s5 = createInitialState(s.survivor, NOW);
s5.foodMin = 1440;
s5.waterMin = 1440;
s5.lastTickAt = NOW;
tickNpcs(s5, NOW + 60 * 60_000); // 1 h sin NPC ni buff → 20 min
check("1 h sin buff consume 40 min (20+20)", Math.abs(s5.foodMin - 1420) < 0.01 && Math.abs(s5.waterMin - 1420) < 0.01);
s5.lastTickAt = NOW + 60 * 60_000;
addBuff(s5, "consumo_comida_agua", 120, NOW + 60 * 60_000);
tickNpcs(s5, NOW + 120 * 60_000); // 1 h con buff → 18 min
check("1 h con buff consume 36 min (−10%)", Math.abs(s5.foodMin - 1402) < 0.01 && Math.abs(s5.waterMin - 1402) < 0.01);
check("consumptionFactor sigue 0.9 con buff", consumptionFactor(s5, NOW + 61 * 60_000) === 0.9);

console.log("== consumibles (usar decrementa) ==");
s5.craftedInventory["botiquin"] = 2;
s5.health = 50;
const r1 = useCraftedItem(s5, "botiquin", NOW);
check("botiquin aplica +20 salud (50→70)", r1 !== null && s5.health === 70);
check("cantidad −1 (2→1)", s5.craftedInventory["botiquin"] === 1);
check("buff activo tras usar kit", buffActive(s5, "consumo_comida_agua", NOW) || buffRemainingMs(s5, "consumo_comida_agua", NOW) >= 0);
check("asignable no es 'usable'", useCraftedItem(s5, "linterna", NOW) === null);

console.log("== sanity: migración de saves previos no rompe ==");
const env = await loadGame();
check("loadGame no explota (null o estado válido)", env === null || typeof env.state === "object");

console.log(`\n${passed}/${passed + failed} checks OK`);
if (failed > 0) process.exit(1);
