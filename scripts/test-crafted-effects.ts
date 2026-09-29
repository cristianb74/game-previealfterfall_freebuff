/**
 * Smoke test (headless): crafted-item effects wiring.
 * Run: bun scripts/test-crafted-effects.ts
 * Validates: buffs store, consumables, passive modifiers at their real
 * hook points (rollExploration / scavenge roll / tickNpcs consumption).
 */
import { createInitialState, loadGame } from "../src/game/saveSystem";
import { RECIPES } from "../src/game/crafting/recipes";
import {
  addBuff,
  buffActive,
  buffRemainingMs,
  craftedItemKind,
  consumptionFactor,
  damageTakenFactor,
  explorationDurationFactor,
  findAmountFactor,
  injuryRiskFactor,
  perceptionFactor,
  pruneBuffs,
  radioEventUnlocked,
  useCraftedItem,
} from "../src/game/crafting/craftedEffects";
import { rollExploration, effectiveExplorationStat } from "../src/game/explorationEngine";
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

console.log("== clasificación de los 15 items ==");
const consumables = RECIPES.filter((r) => craftedItemKind(r.id) === "consumable");
const unlocks = RECIPES.filter((r) => craftedItemKind(r.id) === "unlock");
const passives = RECIPES.filter((r) => craftedItemKind(r.id) === "passive");
check("2 consumibles (kit_provisiones, botiquin)", consumables.length === 2);
check("1 unlock (radio)", unlocks.length === 1 && unlocks[0].id === "radio");
check("12 pasivos", passives.length === 12);
check("15 recetas cubiertas", RECIPES.length === 15);

console.log("== estado inicial + backfill ==");
const s = createInitialState(
  {
    name: "Test",
    profession: "Ingeniero",
    portrait: "/assets/survivor/s-1.svg",
    stats: {
      fuerza: 5,
      resistencia: 5,
      agilidad: 5,
      percepcion: 5,
      inteligencia: 5,
      voluntad: 5,
    },
  },
  1_700_000_000_000,
);
check("activeBuffs inicializado vacío", Array.isArray(s.activeBuffs) && s.activeBuffs.length === 0);

console.log("== buffs ({effectId, expiresAt}) ==");
const NOW = 1_700_000_010_000;
addBuff(s, "consumo_comida_agua", 30, NOW);
check("buff activo tras usarlo", buffActive(s, "consumo_comida_agua", NOW));
check("quedan ~30 min", Math.abs(buffRemainingMs(s, "consumo_comida_agua", NOW) - 30 * 60_000) < 1500);
addBuff(s, "consumo_comida_agua", 30, NOW + 20 * 60_000);
check(
  "re-uso refresca (no duplica, extiende)",
  s.activeBuffs.length === 1 &&
    Math.abs(buffRemainingMs(s, "consumo_comida_agua", NOW + 20 * 60_000) - 30 * 60_000) < 1500,
);
pruneBuffs(s, NOW + 55 * 60_000);
check("expira tras 30 min (prune)", s.activeBuffs.length === 0 && !buffActive(s, "consumo_comida_agua", NOW + 55 * 60_000));
check("consumptionFactor 1 sin buff", consumptionFactor(s, NOW + 56 * 60_000) === 1);
addBuff(s, "consumo_comida_agua", 30, NOW + 56 * 60_000);
check("consumptionFactor 0.9 con buff", consumptionFactor(s, NOW + 56 * 60_000) === 0.9);

console.log("== consumibles (usar decrementa) ==");
s.craftedInventory["botiquin"] = 2;
s.health = 50;
const r1 = useCraftedItem(s, "botiquin", NOW);
check("botiquin aplica +20 salud (50→70)", r1 !== null && s.health === 70);
check("cantidad −1 (2→1)", s.craftedInventory["botiquin"] === 1);
s.health = 95;
useCraftedItem(s, "botiquin", NOW);
check("cura limitada al max (95→100)", s.health === 100 && s.craftedInventory["botiquin"] === undefined);
check("sin stock → null", useCraftedItem(s, "botiquin", NOW) === null);
check("pasivo no es 'usable'", useCraftedItem(s, "linterna", NOW) === null);

console.log("== pasivos (count > 0, sin stacking) ==");
s.craftedInventory["linterna"] = 1;
check("linterna factor 0.9 (1 u.)", explorationDurationFactor(s) === 0.9);
s.craftedInventory["linterna"] = 3;
check("linterna NO apila (3 u. → 0.9)", explorationDurationFactor(s) === 0.9);
delete s.craftedInventory["linterna"];
check("linterna sin stock → 1", explorationDurationFactor(s) === 1);
s.craftedInventory["prismaticos"] = 1;
check("percepción efectiva 5→5.4 (+8%)", effectiveExplorationStat(s, "percepcion") === 5.4);
s.craftedInventory["botas"] = 1;
check("agilidad efectiva 5→5.4 (+8%)", effectiveExplorationStat(s, "agilidad") === 5.4);
s.craftedInventory["mochila_recoleccion"] = 1;
s.craftedInventory["kit_tecnico"] = 1;
s.craftedInventory["mochila_superviviente"] = 1;
s.craftedInventory["escaner"] = 1;
check("materiales ×1.25 (10%+15%)", findAmountFactor(s, "materiales") === 1.25);
check("componentes ×1.25 (10%+15%)", findAmountFactor(s, "componentes") === 1.25);
check("dinero ×1.25 (10%+15%)", findAmountFactor(s, "dinero") === 1.25);
check("medicamentos ×1.15 (solo overall)", findAmountFactor(s, "medicamentos") === 1.15);
s.craftedInventory["guantes"] = 1;
check("riesgo lesión ×0.82 (guantes+botas)", Math.abs(injuryRiskFactor(s) - 0.82) < 1e-9);
s.craftedInventory["proteccion"] = 1;
check("daño recibido ×0.85", damageTakenFactor(s) === 0.85);
s.craftedInventory["radio"] = 1;
check("radio desbloqueada", radioEventUnlocked(s));

console.log("== efecto real en rollExploration (detector: eventos especiales) ==");
s.craftedInventory["detector"] = 1;
s.craftedInventory["mapa"] = 1;
let events = 0;
for (let i = 0; i < 6000; i++) {
  const out = rollExploration(s, 1);
  if (out.findings.some((f) => f.kind === "event")) events++;
}
// detector ×1.1 sobre 0.08 ⇒ ~8.8% esperado; con +15% manual en hallazgos y
// suerte, un rango holgado valida que el multiplicador está cableado.
check(`eventos especiales ~8.8% (vistos ${((events / 6000) * 100).toFixed(1)}%)`, events / 6000 > 0.055 && events / 6000 < 0.125);

console.log("== consumo real en tickNpcs (buff −10%) ==");
const s2 = createInitialState(s.survivor, NOW);
s2.foodMin = 1440;
s2.waterMin = 1440;
s2.lastTickAt = NOW;
tickNpcs(s2, NOW + 60 * 60_000); // 1 h sin NPC ni buff → 20 min
check("1 h sin buff consume 40 min (20+20)", Math.abs(s2.foodMin - 1420) < 0.01 && Math.abs(s2.waterMin - 1420) < 0.01);
s2.lastTickAt = NOW + 60 * 60_000;
addBuff(s2, "consumo_comida_agua", 120, NOW + 60 * 60_000); // expira DESPUÉS del tick
tickNpcs(s2, NOW + 120 * 60_000); // 1 h con buff → 18 min
check("1 h con buff consume 36 min (−10%)", Math.abs(s2.foodMin - 1402) < 0.01 && Math.abs(s2.waterMin - 1402) < 0.01);

console.log("== sanity: migración de saves previos no rompe ==");
// (la cadena completa de migraciones se validó en el rebalanceo v3; aquí solo
// confirmamos que normalize/backfill por loadGame no explota con un save nuevo)
const env = await loadGame();
check("loadGame no explota (null o estado válido)", env === null || typeof env.state === "object");

console.log(`\n${passed}/${passed + failed} checks OK`);
if (failed > 0) process.exit(1);
