import type { Recipe } from "../types";

// ============================================================
// AFTERFALL — CRAFTING recipes (single source of truth).
// UI and logic read ONLY from here: rebalancing means editing
// this file. Costs use the REAL resource keys; comida/agua are
// survival MINUTES (foodMin/waterMin) in this game and energia
// is the 0–24 point scale.
//
// SCALE NOTE: the user's starting values were designed for a test
// scale (Energía ~24 ✓ same, Materiales/Componentes ~80,
// Comida/Agua ~600). Real scales: energía idéntica (24),
// materiales/componentes ≈ ×2.5–3 (hallazgos 1–3 u, curvas de
// construcción hasta 68/32), comida/agua en minutos (arranque
// 1440 min ≈ 24 h, hallazgos 10–30 min). Costs below are the
// original values rescaled: materiales ×~3, componentes ×~2.5,
// comida/agua ×2.5; energía y medicamentos sin cambio (misma
// escala de unidades por hallazgo).
// ============================================================

export const RECIPE_CATEGORIES = [
  { key: "exploracion", label: "Exploración", icon: "🧭" },
  { key: "recoleccion", label: "Recolección", icon: "🎒" },
  { key: "supervivencia", label: "Supervivencia", icon: "🥫" },
  { key: "tecnico", label: "Técnico", icon: "🧰" },
  { key: "proteccion", label: "Protección", icon: "🛡" },
] as const;

export const RECIPES: Recipe[] = [
  {
    id: "linterna",
    name: "Linterna rústica",
    category: "exploracion",
    icon: "🔦",
    description: "Tubo de metal, lente rayada y cables trenzados. Algo de luz entra.",
    effect: "+10% tiempo efectivo de exploración nocturna",
    timeSeconds: 45,
    costs: { materiales: 10, componentes: 5 },
    effectData: { type: "exploracion_tiempo_nocturna", value: 0.1 },
  },
  {
    id: "mapa",
    name: "Mapa improvisado",
    category: "exploracion",
    icon: "🗺️",
    description: "Papeles viejos y carbón: calles marcadas a ojo por quien pasó hambre.",
    effect: "+5% probabilidad de encontrar recursos",
    timeSeconds: 40,
    costs: { materiales: 8, componentes: 3 },
    effectData: { type: "prob_recurso", value: 0.05 },
  },
  {
    id: "prismaticos",
    name: "Prismáticos",
    category: "exploracion",
    icon: "🔭",
    description: "Dos lentes alineadas con cinta aislante. Alcanzan más lejos que la fe.",
    effect: "+8% Percepción efectiva durante exploración",
    timeSeconds: 75,
    costs: { materiales: 15, componentes: 10 },
    effectData: { type: "stat_percepcion", value: 0.08 },
  },
  {
    id: "mochila_recoleccion",
    name: "Mochila de recolección",
    category: "recoleccion",
    icon: "🎒",
    description: "Bolsas de supermercado cosidas a un marco de carrito robado.",
    effect: "+10% Materiales encontrados",
    timeSeconds: 90,
    costs: { materiales: 25, componentes: 5 },
    effectData: { type: "recurso_materiales", value: 0.1 },
  },
  {
    id: "kit_provisiones",
    name: "Kit de provisiones",
    category: "supervivencia",
    icon: "🥫",
    description: "Raciones porcionadas y agua medida: cada bocado cuenta doble.",
    effect: "−10% consumo de Comida y Agua durante 30 min",
    timeSeconds: 60,
    costs: { materiales: 8, comida: 75, agua: 75 },
    effectData: { type: "consumo_comida_agua", value: 0.1, duracionMin: 30 },
  },
  {
    id: "kit_tecnico",
    name: "Kit técnico",
    category: "tecnico",
    icon: "🧰",
    description: "Destornilladores, pinzas y cinta: la caja que todo refugio envidia.",
    effect: "+10% Componentes encontrados",
    timeSeconds: 110,
    costs: { materiales: 15, componentes: 15 },
    effectData: { type: "recurso_componentes", value: 0.1 },
  },
  {
    id: "iman",
    name: "Imán recuperador",
    category: "recoleccion",
    icon: "🧲",
    description: "Bobina de un motor rearmada: arrastra metal de donde nadie mira.",
    effect: "+8% probabilidad de encontrar Componentes",
    timeSeconds: 80,
    costs: { materiales: 12, componentes: 10 },
    effectData: { type: "prob_componentes", value: 0.08 },
  },
  {
    id: "detector",
    name: "Detector de objetos",
    category: "tecnico",
    icon: "📡",
    description: "Radio cascabelera convertida en antena de rastreo. Chisporrotea, funciona.",
    effect: "+10% hallazgos especiales",
    timeSeconds: 120,
    costs: { materiales: 18, componentes: 20, energia: 2 },
    effectData: { type: "hallazgos_especiales", value: 0.1 },
  },
  {
    id: "escaner",
    name: "Escáner de valores",
    category: "tecnico",
    icon: "📟",
    description: "Pantalla de un cajero y ojo entrenado: detecta lo que todavía vale.",
    effect: "+10% dinero encontrado",
    timeSeconds: 140,
    costs: { materiales: 15, componentes: 25, energia: 3 },
    effectData: { type: "recurso_dinero", value: 0.1 },
  },
  {
    id: "guantes",
    name: "Guantes reforzados",
    category: "proteccion",
    icon: "🧤",
    description: "Cuero forrado con lona de saco. Los dedos valen más que la destreza.",
    effect: "−10% riesgo de heridas por búsqueda",
    timeSeconds: 55,
    costs: { materiales: 18, componentes: 3 },
    effectData: { type: "riesgo_heridas", value: 0.1 },
  },
  {
    id: "proteccion",
    name: "Protección improvisada",
    category: "proteccion",
    icon: "🛡️",
    description: "Placas de chapa sobre lona atada: fea, pesada, y salva.",
    effect: "−15% daño recibido por eventos menores",
    timeSeconds: 100,
    costs: { materiales: 30, componentes: 8 },
    effectData: { type: "dano_eventos_menores", value: 0.15 },
  },
  {
    id: "botiquin",
    name: "Botiquín",
    category: "supervivencia",
    icon: "🩹",
    description: "Vendas ordenadas, alcohol y esperanza en una caja de galletas.",
    effect: "Recupera hasta 20 puntos de Salud",
    timeSeconds: 70,
    costs: { materiales: 6, medicamentos: 8 },
    effectData: { type: "salud", value: 20 },
  },
  {
    id: "mochila_superviviente",
    name: "Mochila de superviviente",
    category: "supervivencia",
    icon: "🧳",
    description: "La maleta de quien ya lo perdió todo y salió a empezar de nuevo.",
    effect: "+15% capacidad general de recolección",
    timeSeconds: 150,
    costs: { materiales: 35, componentes: 13 },
    effectData: { type: "capacidad_recoleccion", value: 0.15 },
  },
  {
    id: "radio",
    name: "Radio portátil",
    category: "tecnico",
    icon: "📻",
    description: "Cajón de madera, válvulas y una antena: alguien habla en la banda corta.",
    effect: "Habilita el evento de Radio semanal",
    timeSeconds: 180,
    costs: { materiales: 20, componentes: 30, energia: 4 },
    effectData: { type: "evento_radio_semanal" },
  },
  {
    id: "botas",
    name: "Botas reforzadas",
    category: "proteccion",
    icon: "🥾",
    description: "Suela de neumático cosida al cuero: kilómetros que ya no duelen.",
    effect: "+8% Agilidad efectiva y −8% riesgo de lesión",
    timeSeconds: 130,
    costs: { materiales: 25, componentes: 10 },
    effectData: { type: "stat_agilidad", value: 0.08, riesgo_lesion: 0.08 },
  },
];

export const RECIPE_BY_ID: Record<string, Recipe> = RECIPES.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<string, Recipe>,
);
