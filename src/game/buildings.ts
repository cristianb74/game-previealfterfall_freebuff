import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — buildings (SAVE_VERSION 2 redesign).
//
// TWO building families:
//  1. CORE (BUILDINGS): the 6 classic buildings. GLOBAL — a single shared
//     instance per character lives in GameState.base and its bonus applies
//     in EVERY zone.
//  2. THEMATIC (ZONE_THEMATIC_BUILDINGS): 1–2 per zone, bound to the zone's
//     resource pool. LOCAL — they only boost finds in their own zone.
//     The four former "exclusive" buildings keep their exact keys
//     (invernadero, laboratorio, perforadora, hormigonera) so old
//     investments migrate untouched.
// Levels 0–10 for both families; cost/time curves are shared for now
// (first iteration) so the migration refund maps 1:1 onto paid levels.
// ============================================================

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  description: string;
  icon: string;
  /** Resource boosted by this building (relative bonus). */
  specializes: ResourceKey;
}

export const BUILDINGS: BuildingDef[] = [
  {
    key: "cocina",
    name: "Cocina",
    description: "Raciones calientes y conservas bien aprovechadas. Mejora los hallazgos de Comida en todas las zonas.",
    icon: "🍲",
    specializes: "comida",
  },
  {
    key: "tanque",
    name: "Tanque de Agua",
    description: "Captación y filtrado de agua. Mejora los hallazgos de Agua en todas las zonas.",
    icon: "🚰",
    specializes: "agua",
  },
  {
    key: "almacen",
    name: "Almacén",
    description: "Chatarra ordenada y estanterías reforzadas. Mejora los hallazgos de Materiales en todas las zonas.",
    icon: "📦",
    specializes: "materiales",
  },
  {
    key: "enfermeria",
    name: "Enfermería",
    description: "Vendas, sueros y un camastro limpio. Mejora los hallazgos de Medicamentos en todas las zonas.",
    icon: "🩹",
    specializes: "medicamentos",
  },
  {
    key: "taller",
    name: "Taller",
    description: "Bancos de trabajo y herramientas finas. Mejora los hallazgos de Componentes en todas las zonas.",
    icon: "🔧",
    specializes: "componentes",
  },
  {
    key: "generador",
    name: "Generador",
    description: "Diésel, paneles y cableado recuperado. Mejora los hallazgos de Energía en todas las zonas.",
    icon: "🔌",
    specializes: "energia",
  },
];

export const BUILDING_BY_KEY: Record<BuildingKey, BuildingDef> = BUILDINGS.reduce(
  (acc, b) => {
    acc[b.key] = b;
    return acc;
  },
  {} as Record<BuildingKey, BuildingDef>,
);

/** Core building made available once this zone id is reached/unlocked
 *  (progression gate for the GLOBAL base — same gating the per-zone model
 *  used before v2, so player progression is not thrown away). */
export const CORE_BUILDING_GATE_ZONE: Record<BuildingKey, number> = {
  cocina: 1,
  tanque: 2,
  almacen: 3,
  enfermeria: 5,
  taller: 7,
  generador: 10,
};

// ============================================================
// THEMATIC BUILDINGS — 31 defs across the 20 zones (1–2 per zone).
// `specializes` always belongs to the host zone's `resources` pool.
// ============================================================
export interface ThematicDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  specializes: ResourceKey;
  zone: number;
}

export const ZONE_THEMATIC_BUILDINGS: ThematicDef[] = [
  // Z01 — Apartamentos Ruinosos (focus: comida)
  {
    key: "invernadero",
    name: "Invernadero Hidropónico",
    description: "Cultivos protegidos bajo plástico recuperado. Solo posible en la cocina comunitaria de Z01.",
    icon: "🌱",
    specializes: "comida",
    zone: 1,
  },
  // Z02 — Supermercado Saqueado (focus: comida)
  {
    key: "camara_frigorifica",
    name: "Cámara Frigorífica",
    description: "Compresores parcheados que mantienen fría la despensa del supermercado.",
    icon: "🧊",
    specializes: "comida",
    zone: 2,
  },
  {
    key: "fondo_almacen",
    name: "Fondo de Almacén",
    description: "La trastienda que nadie llegó a vaciar: cajas, estibas y cinta de embalar.",
    icon: "📦",
    specializes: "materiales",
    zone: 2,
  },
  // Z03 — Gasolinera Abandonada (focus: materiales)
  {
    key: "bodega_herramientas",
    name: "Bodega de Herramientas",
    description: "Llaves, palancas y un juego de dados intacto tras el mostrador.",
    icon: "🔧",
    specializes: "materiales",
    zone: 3,
  },
  {
    key: "bomba_succion",
    name: "Bomba de Succión",
    description: "Bombea el fondo de los tanques: restos útiles y químicos aprovechables.",
    icon: "⚙",
    specializes: "componentes",
    zone: 3,
  },
  // Z04 — Hospital Derruido (focus: medicamentos)
  {
    key: "laboratorio",
    name: "Laboratorio de Campo",
    description: "Síntesis de sueros a partir de los restos clínicos. Exclusivo del Hospital (Z04).",
    icon: "🧪",
    specializes: "medicamentos",
    zone: 4,
  },
  {
    key: "quirofano",
    name: "Quirófano Improvisado",
    description: "Luz de cirugía a media potencia y instrumental esterilizado a la vieja usanza.",
    icon: "🩺",
    specializes: "medicamentos",
    zone: 4,
  },
  // Z05 — Bloque de Oficinas (focus: componentes)
  {
    key: "sala_servidores",
    name: "Sala de Servidores",
    description: "Racks apagados con oro, cobre y placas que aún sirven.",
    icon: "🖧",
    specializes: "componentes",
    zone: 5,
  },
  // Z06 — Colegio en Ruinas (focus: materiales)
  {
    key: "bodega_mantenimiento",
    name: "Bodega de Mantenimiento",
    description: "El cuarto del conserje: pintura, tornillería y listones rescatables.",
    icon: "🧰",
    specializes: "materiales",
    zone: 6,
  },
  {
    key: "cafeteria_escolar",
    name: "Cafetería Escolar",
    description: "Ollas industriales y despensa de conserva a medio saquear.",
    icon: "🍲",
    specializes: "comida",
    zone: 6,
  },
  // Z07 — Fábrica Textil (focus: materiales)
  {
    key: "linea_ensamblaje",
    name: "Línea de Ensamblaje",
    description: "Cintas y prensas detenidas: chatarra gruesa de alta calidad.",
    icon: "🏭",
    specializes: "materiales",
    zone: 7,
  },
  {
    key: "sala_motores",
    name: "Sala de Motores",
    description: "Motores paso a paso, correas y rodamientos aprovechables.",
    icon: "⚙",
    specializes: "componentes",
    zone: 7,
  },
  // Z08 — Estación de Tren (focus: componentes)
  {
    key: "taller_ferroviario",
    name: "Taller Ferroviario",
    description: "Andén de mantenimiento: instrumental pesado y piezas de precisión.",
    icon: "🚂",
    specializes: "componentes",
    zone: 8,
  },
  {
    key: "vagon_sellado",
    name: "Vagón Sellado",
    description: "Un vagón cerrado desde el Estallido: latas apiladas en la penumbra.",
    icon: "🥫",
    specializes: "comida",
    zone: 8,
  },
  // Z09 — Depósito de Agua (focus: agua)
  {
    key: "perforadora",
    name: "Perforadora de Pozos",
    description: "Taladra el acuífero profundo del depósito. Solo construible en Z09.",
    icon: "🕳",
    specializes: "agua",
    zone: 9,
  },
  {
    key: "filtro_potabilizador",
    name: "Filtro Potabilizador",
    description: "Lechos de arena y carbón activo: limpia el agua de las cisternas.",
    icon: "🚿",
    specializes: "agua",
    zone: 9,
  },
  // Z10 — Colonia Cercada (focus: agua)
  {
    key: "aljibe_comunitario",
    name: "Aljibe Comunitario",
    description: "El aljibe que la colonia cavó antes de abandonar los muros.",
    icon: "🪣",
    specializes: "agua",
    zone: 10,
  },
  {
    key: "huerto_comunitario",
    name: "Huerto Comunitario",
    description: "Bancales entre las casas: alguien sembró para quedarse.",
    icon: "🌿",
    specializes: "comida",
    zone: 10,
  },
  // Z11 — Policlínica Militar (focus: medicamentos)
  {
    key: "esterilizador_campo",
    name: "Esterilizador de Campo",
    description: "Autoclave militar que aún sostiene presión: material médico limpio.",
    icon: "🧫",
    specializes: "medicamentos",
    zone: 11,
  },
  // Z12 — Zona Industrial Norte (focus: materiales)
  {
    key: "hormigonera",
    name: "Hormigonera Industrial",
    description: "Produce bloques prefabricados de alta resistencia. Exclusiva de la Zona Industrial (Z12).",
    icon: "🧱",
    specializes: "materiales",
    zone: 12,
  },
  {
    key: "cinta_transportadora",
    name: "Cinta Transportadora",
    description: "Motores, sensores y rodillos de la línea de expedición.",
    icon: "📟",
    specializes: "componentes",
    zone: 12,
  },
  // Z13 — Barrios Colapsados (focus: materiales)
  {
    key: "punto_acopio",
    name: "Punto de Acopio",
    description: "Un cruce defendido con barricadas: todo lo útil acaba aquí.",
    icon: "🪙",
    specializes: "materiales",
    zone: 13,
  },
  {
    key: "huerto_azotea",
    name: "Huerto en Azotea",
    description: "Macetones y regaderas sobre una azotea que aún aguanta.",
    icon: "🌱",
    specializes: "comida",
    zone: 13,
  },
  // Z14 — Central Eléctrica (focus: componentes)
  {
    key: "turbina_auxiliar",
    name: "Turbina Auxiliar",
    description: "La turbina de arranque: bobinados y válvulas en buen estado.",
    icon: "⚡",
    specializes: "componentes",
    zone: 14,
  },
  {
    key: "red_cableado",
    name: "Red de Cableado",
    description: "Kilómetros de cobre entre canalizaciones y barras de distribución.",
    icon: "🔌",
    specializes: "materiales",
    zone: 14,
  },
  // Z15 — Laboratorio Químico (focus: medicamentos)
  {
    key: "campana_sintesis",
    name: "Campana de Síntesis",
    description: "Reactivos y vidrio de laboratorio para destilar compuestos útiles.",
    icon: "🧪",
    specializes: "medicamentos",
    zone: 15,
  },
  {
    key: "boveda_reactivos",
    name: "Bóveda de Reactivos",
    description: "Armario certificado que guarda precursores y electrónica calibrada.",
    icon: "🔒",
    specializes: "componentes",
    zone: 15,
  },
  // Z16 — Depósito Militar (focus: medicamentos)
  {
    key: "contenedor_medico",
    name: "Contenedor Médico",
    description: "Suministros médicos estandarizados, sellados y apilados por lote.",
    icon: "💉",
    specializes: "medicamentos",
    zone: 16,
  },
  {
    key: "bodega_logistica",
    name: "Bodega Logística",
    description: "Estibas militares: cajones reforzados y material de embalaje.",
    icon: "📦",
    specializes: "materiales",
    zone: 16,
  },
  // Z17 — Torres Residenciales (focus: agua)
  {
    key: "cisterna_azotea",
    name: "Cisterna de Azotea",
    description: "Las cisternas altas de las torres: gravedad hace el trabajo.",
    icon: "💧",
    specializes: "agua",
    zone: 17,
  },
  // Z18 — Puerto Mercante (focus: componentes)
  {
    key: "grua_muelle",
    name: "Grúa del Muelle",
    description: "La grúa pórtico: motores, mandos y cable de acero rescatable.",
    icon: "🏗",
    specializes: "componentes",
    zone: 18,
  },
  {
    key: "chatarra_contenedores",
    name: "Chatarra de Contenedores",
    description: "Pilas de contenedores oxidados: acero a granel para llevar.",
    icon: "⚓",
    specializes: "materiales",
    zone: 18,
  },
  // Z19 — Zona de Cuarentena (focus: medicamentos)
  {
    key: "estacion_descontaminacion",
    name: "Estación de Descontaminación",
    description: "Lonas, filtros HEPA y duchas químicas de la cuarentena abandonada.",
    icon: "☣",
    specializes: "medicamentos",
    zone: 19,
  },
  // Z20 — Base Militar (focus: componentes)
  {
    key: "taller_comunicaciones",
    name: "Taller de Comunicaciones",
    description: "Radioensayo del comando: placas, antenas y equipos de precisión.",
    icon: "📡",
    specializes: "componentes",
    zone: 20,
  },
  {
    key: "deposito_raciones",
    name: "Depósito de Raciones",
    description: "El almacén de víveres de la base: raciones por años, ordenadas.",
    icon: "🥫",
    specializes: "comida",
    zone: 20,
  },

  // ---------------------------------------------------------------
  // Expansión a 4 instalaciones por zona (aprobadа por el jugador).
  // Cada specializes pertenece al pool de recursos de su zona en
  // zones.ts (no solo el focus). Los saves viejos obtienen las claves
  // nuevas a N0 por el backfill de normalizeState.
  // ---------------------------------------------------------------
  // Z01 — Apartamentos Ruinosos (pool: materiales, comida, agua, medicamentos)
  {
    key: "desvan_compartido",
    name: "Desván Compartido",
    description: "Décadas de trastos entre áticos sellados: madera, chapas y útiles.",
    icon: "📦",
    specializes: "materiales",
    zone: 1,
  },
  {
    key: "depositos_escalera",
    name: "Depósitos de Escalera",
    description: "Garrafas y tanques domésticos en rellanos que nadie revisó.",
    icon: "💧",
    specializes: "agua",
    zone: 1,
  },
  {
    key: "botiquines_vecinales",
    name: "Botiquines Vecinales",
    description: "Botiquines de baño olvidados: vendas, analgésicos, antisépticos.",
    icon: "🩹",
    specializes: "medicamentos",
    zone: 1,
  },
  // Z02 — Supermercado Saqueado (pool: comida, agua, materiales, componentes)
  {
    key: "chatarra_gondolas",
    name: "Chatarra de Góndolas",
    description: "Carritos y repisas metálicas: acero liviano a granel.",
    icon: "🛒",
    specializes: "materiales",
    zone: 2,
  },
  {
    key: "circuitos_seguridad",
    name: "Circuitos de Seguridad",
    description: "Cámaras, sensores y la central antirrobo intacta en la trastienda.",
    icon: "📹",
    specializes: "componentes",
    zone: 2,
  },
  // Z03 — Gasolinera Abandonada (pool: materiales, componentes, dinero)
  {
    key: "caja_administrador",
    name: "Caja del Administrador",
    description: "La recaudación quedó tras el mostrador el día que todo paró.",
    icon: "🪙",
    specializes: "dinero",
    zone: 3,
  },
  {
    key: "patio_bidones",
    name: "Patio de Bidones",
    description: "Bidones, mangueras y chapa galvanizada acumulada en el patio.",
    icon: "🛢",
    specializes: "materiales",
    zone: 3,
  },
  // Z04 — Hospital Derruido (pool: medicamentos, materiales)
  {
    key: "farmacia_central",
    name: "Farmacia Central",
    description: "Anaqueles sellados de la farmacia del hospital: lotes enteros.",
    icon: "💊",
    specializes: "medicamentos",
    zone: 4,
  },
  {
    key: "camillas_rieles",
    name: "Camillas y Rieles",
    description: "Acero inoxidable de camillas y rieles de transferencia.",
    icon: "🛏",
    specializes: "materiales",
    zone: 4,
  },
  // Z05 — Bloque de Oficinas (pool: componentes, dinero, materiales)
  {
    key: "boveda_nominas",
    name: "Bóveda de Nóminas",
    description: "La cámara acorazada del piso 12 guarda el efectivo de las nóminas.",
    icon: "🪙",
    specializes: "dinero",
    zone: 5,
  },
  {
    key: "planta_archivo",
    name: "Planta de Archivo",
    description: "Archivadores metálicos de oficinas enteras, piso por piso.",
    icon: "🗄",
    specializes: "materiales",
    zone: 5,
  },
  {
    key: "sala_hvac",
    name: "Sala de Máquinas HVAC",
    description: "Compresoras y ventilación central: electrónica pesada rescatable.",
    icon: "🌀",
    specializes: "componentes",
    zone: 5,
  },
  // Z06 — Colegio en Ruinas (pool: comida, materiales, medicamentos)
  {
    key: "almacen_aseo",
    name: "Almacén de Aseo",
    description: "Alcoholes, lavandina y antisépticos del depósito de limpieza.",
    icon: "🧴",
    specializes: "medicamentos",
    zone: 6,
  },
  {
    key: "taller_tecnologia",
    name: "Taller de Tecnología",
    description: "El aula-taller: herramientas, bancos y estanterías de cargas.",
    icon: "🔧",
    specializes: "materiales",
    zone: 6,
  },
  // Z07 — Fábrica Textil (pool: materiales, componentes)
  {
    key: "bobinas_lona",
    name: "Bobinas y Lona",
    description: "Rollos impermeables y lona industrial, intactos en el galpón.",
    icon: "🧵",
    specializes: "materiales",
    zone: 7,
  },
  {
    key: "cuadros_mando",
    name: "Cuadros de Mando",
    description: "La sala eléctrica de la fábrica: PLCs, relés y cableado etiquetado.",
    icon: "🎛",
    specializes: "componentes",
    zone: 7,
  },
  // Z08 — Estación de Tren (pool: comida, componentes, dinero)
  {
    key: "enclavamientos",
    name: "Enclavamientos",
    description: "Semáforos, desvíos y relés del enclavamiento ferroviario.",
    icon: "🚦",
    specializes: "componentes",
    zone: 8,
  },
  {
    key: "taquilla_consignas",
    name: "Taquilla y Consignas",
    description: "Monedas de taquilla y bultos nunca reclamados en las consignas.",
    icon: "🪙",
    specializes: "dinero",
    zone: 8,
  },
  // Z09 — Depósito de Agua (pool: agua, materiales)
  {
    key: "sala_bombas",
    name: "Sala de Bombas",
    description: "Bombeo presurizado: la red de distribución aún responde aquí.",
    icon: "🚰",
    specializes: "agua",
    zone: 9,
  },
  {
    key: "planchas_deposito",
    name: "Planchas del Depósito",
    description: "Chapas y remaches de los tanques viejos: acero fácil de llevar.",
    icon: "📦",
    specializes: "materiales",
    zone: 9,
  },
  // Z10 — Colonia Cercada (pool: comida, agua, materiales, medicamentos)
  {
    key: "enfermeria_trinchera",
    name: "Enfermería de Trinchera",
    description: "El botiquín de campaña de la colonia: lo básico, bien organizado.",
    icon: "🩹",
    specializes: "medicamentos",
    zone: 10,
  },
  {
    key: "muro_chatarra",
    name: "Muro de Chatarra",
    description: "Placas reforzadas del perímetro: material probado en combate.",
    icon: "🛡",
    specializes: "materiales",
    zone: 10,
  },
  // Z11 — Policlínica Militar (pool: medicamentos, componentes)
  {
    key: "banco_sangre",
    name: "Banco de Sangre",
    description: "Refrigeradores de hemoderivados con generador de respaldo.",
    icon: "🩸",
    specializes: "medicamentos",
    zone: 11,
  },
  {
    key: "sala_radiologia",
    name: "Sala de Radiología",
    description: "Tubos de rayos X, capacitores y paneles de plomo aprovechables.",
    icon: "☢",
    specializes: "componentes",
    zone: 11,
  },
  {
    key: "kits_campana",
    name: "Kits de Campaña",
    description: "Lotes médicos militares sellados, apilados por fecha de vencimiento.",
    icon: "💉",
    specializes: "medicamentos",
    zone: 11,
  },
  // Z12 — Zona Industrial Norte (pool: materiales, componentes, dinero)
  {
    key: "horno_fundicion",
    name: "Horno de Fundición",
    description: "El horno aún funde chatarra: lingotes y vigas a medida.",
    icon: "🔥",
    specializes: "materiales",
    zone: 12,
  },
  {
    key: "gerencia_caja",
    name: "Gerencia y Caja",
    description: "Contratos, cheques y la caja fuerte de la administración de la nave.",
    icon: "🪙",
    specializes: "dinero",
    zone: 12,
  },
  // Z13 — Barrios Colapsados (pool: materiales, comida)
  {
    key: "escombros_selectos",
    name: "Escombros Selectos",
    description: "Ladrillo entero y fierro de fachadas caídas, apilado por manos amigas.",
    icon: "🧱",
    specializes: "materiales",
    zone: 13,
  },
  {
    key: "ollas_comunitarias",
    name: "Ollas Comunitarias",
    description: "Alguien las sigue alimentando: conservas compartidas a la brasa.",
    icon: "🍲",
    specializes: "comida",
    zone: 13,
  },
  // Z14 — Central Eléctrica (pool: componentes, dinero, materiales)
  {
    key: "sala_control",
    name: "Sala de Control",
    description: "Consolas e instrumentación de la central: precisión industrial.",
    icon: "🎚",
    specializes: "componentes",
    zone: 14,
  },
  {
    key: "caja_sueldos",
    name: "Caja de Sueldos",
    description: "La paga de la empresa quedó adentro el mes del colapso.",
    icon: "🪙",
    specializes: "dinero",
    zone: 14,
  },
  // Z15 — Laboratorio Químico (pool: componentes, medicamentos)
  {
    key: "destileria_solventes",
    name: "Destilería de Solventes",
    description: "Columnas de destilación para purificar compuestos medicinales.",
    icon: "⚗",
    specializes: "medicamentos",
    zone: 15,
  },
  {
    key: "ups_laboratorio",
    name: "UPS del Laboratorio",
    description: "Baterías de respaldo con una última carga dentro.",
    icon: "🔋",
    specializes: "componentes",
    zone: 15,
  },
  // Z16 — Depósito Militar (pool: materiales, comida, medicamentos)
  {
    key: "cocinas_campana",
    name: "Cocinas de Campaña",
    description: "Cocinas móviles del contingente: raciones calientes garantizadas.",
    icon: "🥫",
    specializes: "comida",
    zone: 16,
  },
  {
    key: "sacos_terreos",
    name: "Sacos Terreros",
    description: "Alambradas, postes y sacos: el arsenal logístico del depósito.",
    icon: "📦",
    specializes: "materiales",
    zone: 16,
  },
  // Z17 — Torres Residenciales (pool: materiales, componentes, agua)
  {
    key: "cuarto_bombas_torres",
    name: "Cuarto de Bombas",
    description: "Bombeo presurizado de las torres: presión constante para arriba.",
    icon: "💧",
    specializes: "agua",
    zone: 17,
  },
  {
    key: "repetidores_azotea",
    name: "Repetidores de Azotea",
    description: "Antenas con cableado intacto y gabinetes sellados.",
    icon: "📡",
    specializes: "componentes",
    zone: 17,
  },
  {
    key: "puertas_parque",
    name: "Puertas y Parqué",
    description: "Marcos de acero y maderas de los portales, piso por piso.",
    icon: "🚪",
    specializes: "materiales",
    zone: 17,
  },
  // Z18 — Puerto Mercante (pool: materiales, componentes, dinero)
  {
    key: "aduana_puerto",
    name: "Aduana",
    description: "Aranceles pagados y olvidados, junto a manifiestos sin abrir.",
    icon: "🪙",
    specializes: "dinero",
    zone: 18,
  },
  {
    key: "radio_capitania",
    name: "Radio de Capitanía",
    description: "El equipo de radio del puerto: bandas marinas y repuestos.",
    icon: "📻",
    specializes: "componentes",
    zone: 18,
  },
  // Z19 — Zona de Cuarentena (pool: medicamentos, componentes, dinero)
  {
    key: "archivo_muestras",
    name: "Archivo de Muestras",
    description: "Muestras clínicas nunca incineradas, refrigeradas por error.",
    icon: "🧫",
    specializes: "medicamentos",
    zone: 19,
  },
  {
    key: "circuito_perimetro",
    name: "Circuito Cerrado del Perímetro",
    description: "Cámaras y monitores del control fronterizo, aún cableados.",
    icon: "📹",
    specializes: "componentes",
    zone: 19,
  },
  {
    key: "deposito_incautados",
    name: "Depósito de Incautados",
    description: "Bienes retenidos en la frontera: nadie fue a reclamarlos.",
    icon: "🪙",
    specializes: "dinero",
    zone: 19,
  },
  // Z20 — Base Militar (pool: todos)
  {
    key: "desalinizadora_puerto",
    name: "Desalinizadora de Puerto",
    description: "La planta del muelle militar: agua potable por toneladas.",
    icon: "🌊",
    specializes: "agua",
    zone: 20,
  },
  {
    key: "comisariado",
    name: "Comisariado",
    description: "El fondo de pagos en efectivo del comisario de la base.",
    icon: "🪙",
    specializes: "dinero",
    zone: 20,
  },
];

export const THEMATIC_BY_KEY: Record<string, ThematicDef> = ZONE_THEMATIC_BUILDINGS.reduce(
  (acc, b) => {
    acc[b.key] = b;
    return acc;
  },
  {} as Record<string, ThematicDef>,
);

/** zoneId → thematic defs of that zone (ordered as declared). */
export const THEMATIC_BY_ZONE: Record<number, ThematicDef[]> = ZONE_THEMATIC_BUILDINGS.reduce(
  (acc, b) => {
    (acc[b.zone] ??= []).push(b);
    return acc;
  },
  {} as Record<number, ThematicDef[]>,
);

// ============================================================
// BONUSES
// ============================================================

/** Relative bonus of a GLOBAL core building at a given level: N5 → +25 %.
 *  Applies in every zone. */
export function buildingBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.buildingBonusPerLevel;
}

/** Relative bonus of a zone THEMATIC building at a given level
 *  (LOCAL to its zone). Same curve as core in this first iteration —
 *  their extra power comes from stacking with the global base bonus on
 *  the zone's focus resource. */
export function thematicBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.thematicBonusPerLevel;
}

// ============================================================
// COSTS / TIMES — shared curve for both families in this first
// iteration (tunable via playtest; a differentiated curve can hook in
// here later without touching callers).
// ============================================================

export function buildingUpgradeCost(level: number): {
  materiales: number;
  componentes: number;
} {
  const raw = {
    materiales: BALANCE.buildingCostMaterialBase + BALANCE.buildingCostMaterialPerLevel * level,
    componentes: BALANCE.buildingCostComponentBase + BALANCE.buildingCostComponentPerLevel * level,
  };
  // Opción B: multiplicador por tramos de nivel sobre la curva lineal
  // (bandas ajustables en BALANCE.buildingCostBands). L1–3 quedan exactos.
  let multiplier = 1;
  for (const band of BALANCE.buildingCostBands) {
    if (level >= band.minLevel) multiplier = band.multiplier;
  }
  return {
    materiales: Math.round(raw.materiales * multiplier),
    componentes: Math.round(raw.componentes * multiplier),
  };
}

/** Upgrade duration in minutes for level → level+1. Always under ~30 min. */
export function buildingUpgradeMinutes(level: number): number {
  return BALANCE.buildingBaseMinutes + BALANCE.buildingMinutesPerLevel * level;
}

export function buildingCostLabel(cost: { materiales: number; componentes: number }): string {
  return `${cost.materiales} MAT · ${cost.componentes} CMP`;
}

/** Cumulative cost of bringing a building from N0 to Nlevel (for the
 *  save-v2 migration refund of duplicate core-building copies). */
export function cumulativeUpgradeCost(level: number): {
  materiales: number;
  componentes: number;
} {
  let materiales = 0;
  let componentes = 0;
  for (let l = 0; l < level; l++) {
    const c = buildingUpgradeCost(l);
    materiales += c.materiales;
    componentes += c.componentes;
  }
  return { materiales, componentes };
}

// ============================================================
// CONCURRENCY QUOTAS
// ============================================================

/** How many THEMATIC buildings of a zone are currently under construction. */
export function activeThematicConstructions(z: {
  thematic: Record<string, { upgradeFinishAt: number | null }>;
}): number {
  let n = 0;
  for (const b of Object.values(z.thematic ?? {})) {
    if (b.upgradeFinishAt != null) n += 1;
  }
  return n;
}

/** How many CORE (global base) buildings are currently under construction. */
export function activeConstructionsInBase(base: {
  [key in BuildingKey]: { upgradeFinishAt: number | null };
} | Record<string, { upgradeFinishAt: number | null; level: number; key: BuildingKey }>): number {
  let n = 0;
  for (const b of Object.values(base)) {
    if (b?.upgradeFinishAt != null) n += 1;
  }
  return n;
}
