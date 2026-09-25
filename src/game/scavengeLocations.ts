import type { ResourceKey, ScavengePointId } from "./types";
import { getZone } from "./zones";

export type { ScavengePointId };

// ============================================================
// AFTERFALL — SCAVENGE locations.
// The 5 thematic locations share ONE board layout: the same 8
// search points (x/y in % of the image) land on the same spots
// of every background (same base composition: central crack,
// left junk pile, ⊗ "zona de peligro" bottom-right). Only the
// background image, point labels and flavor texts change.
// Images: /assets/scavenge/<focus>.jpg (real art) with an
// /assets/scavenge/<focus>.svg vector fallback rendered by the
// modal when the JPG is not present.
// ============================================================

/** The 8 shared search points, in board order. Same coordinates
 *  for ALL locations (the 5 images share the same composition).
 *  User-calibrated (x/y in % of the real 1253×847 artwork). */
export const SCAVENGE_PINS: { id: ScavengePointId; x: number; y: number }[] = [
  { id: "p1", x: 43, y: 10 },
  { id: "p2", x: 10, y: 47 },
  { id: "p3", x: 35, y: 25 },
  { id: "p4", x: 35, y: 43 },
  { id: "p5", x: 31, y: 74 },
  { id: "p6", x: 87, y: 25 },
  { id: "p7", x: 87, y: 62 },
  { id: "p8", x: 68, y: 75 },
];

export type ScavengeFocus = "materiales" | "comida" | "componentes" | "medicamentos" | "agua";

export interface ScavengePointDef {
  /** Short label of the object at this spot (shown under the pin). */
  label: string;
  /** Weighted outcome table: loot / nada / daño (weights are relative). */
  weights: { loot: number; nada: number; dano: number };
  /** Weighted loot table for this point (resources incl. dinero). */
  loot: { resource: ResourceKey; weight: number }[];
  /** Flavor lines. Placeholders: {amount} {res} in loot, {damage} in dano. */
  texts: { loot: string[]; nada: string[]; dano: string[] };
}

export interface ScavengeLocationDef {
  focus: ScavengeFocus;
  name: string;
  subtitle: string;
  /** Real art (JPG). The modal falls back to `fallbackImage` on error. */
  image: string;
  fallbackImage: string;
  points: Record<ScavengePointId, ScavengePointDef>;
}

// Reusable outcome weights (tuned per point below, these are the bases).
const W = {
  /** Balanced spot. */
  normal: { loot: 50, nada: 30, dano: 20 },
  /** Rich but risky. */
  rich: { loot: 55, nada: 20, dano: 25 },
  /** Safe but poor. */
  safe: { loot: 45, nada: 45, dano: 10 },
  /** The marked ⊗ danger zone: best loot, worst odds of walking away clean. */
  danger: { loot: 60, nada: 15, dano: 25 },
} as const;

const M = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "materiales", weight });
const C = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "comida", weight });
const A = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "agua", weight });
const MD = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "medicamentos", weight });
const CP = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "componentes", weight });
const D = (weight: number): { resource: ResourceKey; weight: number } => ({ resource: "dinero", weight });

export const SCAVENGE_LOCATIONS: Record<ScavengeFocus, ScavengeLocationDef> = {
  // ----------------------------------------------------------
  // MATERIALES — desguace / estacionamiento con autos oxidados
  // ----------------------------------------------------------
  materiales: {
    focus: "materiales",
    name: "Desguace Municipal",
    subtitle: "Estacionamiento · autos oxidados",
    image: "/assets/scavenge/materiales.jpg",
    fallbackImage: "/assets/scavenge/materiales.svg",
    points: {
      p1: {
        label: "Auto entre la maleza",
        weights: { ...W.normal },
        loot: [M(6), CP(2)],
        texts: {
          loot: ["Bajo la maleza, un auto con el baúl intacto: {amount} de {res}."],
          nada: ["El auto está vacío. Alguien pasó antes que vos."],
          dano: ["El vidrio del parabrisas cede y te corta al meter la mano: -{damage} Salud."],
        },
      },
      p2: {
        label: "Carritos y sistema de tracción",
        weights: { ...W.rich },
        loot: [M(6), D(2)],
        texts: {
          loot: ["Entre los carritos y el arrancador naranja: {amount} de {res}."],
          nada: ["Los carritos están enredados y vacíos. Nada."],
          dano: ["Una chapa del arrancador oxidado te corta: -{damage} Salud."],
        },
      },
      p3: {
        label: "Camioneta oxidada",
        weights: { ...W.safe },
        loot: [M(5), CP(1)],
        texts: {
          loot: ["La camioneta aún guardaba {amount} de {res} detrás del asiento."],
          nada: ["Guantera vacía, asientos podridos. Nada."],
          dano: ["La puerta oxidada se desploma y te golpea: -{damage} Salud."],
        },
      },
      p4: {
        label: "Auto enterrado en la maleza",
        weights: { ...W.normal },
        loot: [CP(3), M(4)],
        texts: {
          loot: ["Entre la maleza que traga el auto: {amount} de {res}."],
          nada: ["El auto está vacío por dentro. Solo hojas."],
          dano: ["Una rama escondida te araña al meterte: -{damage} Salud."],
        },
      },
      p5: {
        label: "Berlina con árbol encima",
        weights: { ...W.normal },
        loot: [M(5), D(1)],
        texts: {
          loot: ["Bajo la berlina ocupada por el árbol: {amount} de {res}."],
          nada: ["Habitáculo vaciado hace años. Nada."],
          dano: ["La rama cede y descarga el peso del auto: -{damage} Salud."],
        },
      },
      p6: {
        label: "Fila de autos estacionados",
        weights: { ...W.normal },
        loot: [M(4), CP(3)],
        texts: {
          loot: ["Entre los autos en fila, {amount} de {res}."],
          nada: ["Todos saqueados. Ni una moneda."],
          dano: ["Un espejo roto te araña al pasar: -{damage} Salud."],
        },
      },
      p7: {
        label: "Auto calcinado · NO SALIDA",
        weights: { ...W.rich },
        loot: [M(5), D(2)],
        texts: {
          loot: ["En el cajón del calcinado, {amount} de {res}."],
          nada: ["Ceniza y metal fundido. Nada."],
          dano: ["Chapa caliente y afilada como un cuchillo: -{damage} Salud."],
        },
      },
      p8: {
        label: "⊗ Zona de peligro",
        weights: { ...W.danger },
        loot: [D(3), CP(2), M(2)],
        texts: {
          loot: ["Alguien marcó este escondite con una ⊗: dentro había {amount} de {res}."],
          nada: ["La marca ⊗ señalaba una trampa vieja y ya vaciada."],
          dano: ["El piso marcado cede bajo tu peso: -{damage} Salud."],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // COMIDA — supermercado con góndolas
  // ----------------------------------------------------------
  comida: {
    focus: "comida",
    name: "Supermercado Saqueado",
    subtitle: "Góndolas · pasillos colapsados",
    image: "/assets/scavenge/comida.jpg",
    fallbackImage: "/assets/scavenge/comida.svg",
    points: {
      p1: {
        label: "Derrumbe del techo",
        weights: { ...W.normal },
        loot: [C(6), A(2)],
        texts: {
          loot: ["Entre los escombros del derrumbe: {amount} de {res}."],
          nada: ["El derrumbe fue registrado hace tiempo. Nada."],
          dano: ["Una losa del derrumbe se corre al moverla: -{damage} Salud."],
        },
      },
      p2: {
        label: "Pila de carritos apilados",
        weights: { ...W.rich },
        loot: [C(5), M(2), D(1)],
        texts: {
          loot: ["Entre los carritos apilados quedó un cajón atrapado: {amount} de {res}."],
          nada: ["Los carritos están soldados por el óxido. Nada aprovechable."],
          dano: ["Un carrito se desprende de la pila y te golpea: -{damage} Salud."],
        },
      },
      p3: {
        label: "Estantería lateral",
        weights: { ...W.safe },
        loot: [C(5), A(2)],
        texts: {
          loot: ["Fondo de estantería: {amount} de {res}."],
          nada: ["Revisaste doble fondo: nada."],
          dano: ["Un frasco roto en el estante te corta: -{damage} Salud."],
        },
      },
      p4: {
        label: "Pasillo junto a la grieta",
        weights: { ...W.normal },
        loot: [C(4), A(3)],
        texts: {
          loot: ["Un paquete sellado entre escombros: {amount} de {res}."],
          nada: ["La grieta se tragó lo que había en el pasillo."],
          dano: ["El piso del pasillo cruje y cede unos centímetros: -{damage} Salud."],
        },
      },
      p5: {
        label: "Góndola inferior",
        weights: { ...W.safe },
        loot: [C(4), D(2)],
        texts: {
          loot: ["En el fondo de la góndola inferior, {amount} de {res}."],
          nada: ["Góndola pelada hasta el cierre. Nada."],
          dano: ["El estante inferior se derrumba de golpe: -{damage} Salud."],
        },
      },
      p6: {
        label: "Góndola derecha",
        weights: { ...W.normal },
        loot: [C(4), CP(2)],
        texts: {
          loot: ["Entre electrodomésticos muertos y latas: {amount} de {res}."],
          nada: ["Sección vaciada hasta el estante."],
          dano: ["Un vidrio del exhibidor te sorprende: -{damage} Salud."],
        },
      },
      p7: {
        label: "Fondo · NO SALIDA",
        weights: { ...W.rich },
        loot: [C(4), D(2)],
        texts: {
          loot: ["Un depósito sin inventario al fondo: {amount} de {res}."],
          nada: ["El depósito del fondo fue lo primero que saquearon."],
          dano: ["El techo del pasillo de fondo dice basta: -{damage} Salud."],
        },
      },
      p8: {
        label: "⊗ Zona de peligro",
        weights: { ...W.danger },
        loot: [D(3), C(3)],
        texts: {
          loot: ["La ⊗ marcaba una despensa escondida: {amount} de {res}."],
          nada: ["La marca ⊗ está vieja. El escondite, vacío."],
          dano: ["Las baldosas marcadas caen al vacío contigo encima: -{damage} Salud."],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // COMPONENTES — sala de máquinas / reactor
  // ----------------------------------------------------------
  componentes: {
    focus: "componentes",
    name: "Sala de Máquinas",
    subtitle: "Reactor · cañerías · electrónica",
    image: "/assets/scavenge/componentes.jpg",
    fallbackImage: "/assets/scavenge/componentes.svg",
    points: {
      p1: {
        label: "Panel de control",
        weights: { ...W.normal },
        loot: [CP(6), M(2)],
        texts: {
          loot: ["El panel aún guarda placas y fusibles: {amount} de {res}."],
          nada: ["Panel vaciado. Solo testigos quemados."],
          dano: ["Un condensador del panel descarga al tocarlo: -{damage} Salud."],
        },
      },
      p2: {
        label: "Montón de electrónica",
        weights: { ...W.rich },
        loot: [CP(5), D(2)],
        texts: {
          loot: ["Desenterraste placas y cables del montón: {amount} de {res}."],
          nada: ["Todo el montón está calcinado. Nada rescatable."],
          dano: ["Una lámina de metal del montón te corta: -{damage} Salud."],
        },
      },
      p3: {
        label: "Cañerías superiores",
        weights: { ...W.safe },
        loot: [CP(4), M(3)],
        texts: {
          loot: ["Abrazaderas y válvulas de las cañerías: {amount} de {res}."],
          nada: ["Cañerías peladas, sin una pieza suelta."],
          dano: ["Un tramo de cañería oxidada se desprende: -{damage} Salud."],
        },
      },
      p4: {
        label: "Cruce de cañerías oeste",
        weights: { ...W.rich },
        loot: [CP(6), M(2)],
        texts: {
          loot: ["Desmontando el cruce de cañerías salieron {amount} de {res}."],
          nada: ["Tuberías peladas y soldadas. Nada suelto."],
          dano: ["Un tramo presurizado revienta al tocarlo: -{damage} Salud."],
        },
      },
      p5: {
        label: "Bobinas del reactor",
        weights: { ...W.normal },
        loot: [CP(4), M(4)],
        texts: {
          loot: ["Entre las bobinas de cobre del reactor: {amount} de {res}."],
          nada: ["El cobre fue arrancado hace años. Nada."],
          dano: ["El soporte de las bobinas cede bajo tu peso: -{damage} Salud."],
        },
      },
      p6: {
        label: "Consola · ACCESO DENEGADO",
        weights: { ...W.rich },
        loot: [CP(4), D(3)],
        texts: {
          loot: ["La consola sellada escondía {amount} de {res}."],
          nada: ["ACCESO DENEGADO — y sin energía, seguirá así."],
          dano: ["El marco de la consola cae al abrirla: -{damage} Salud."],
        },
      },
      p7: {
        label: "Motor de comunicaciones",
        weights: { ...W.normal },
        loot: [CP(5), M(2)],
        texts: {
          loot: ["Del motor desarmado salieron {amount} de {res}."],
          nada: ["Motor despiezado y saqueado. Nada."],
          dano: ["El rotor del motor gira al tocarlo y te golpea: -{damage} Salud."],
        },
      },
      p8: {
        label: "⊗ Zona de peligro",
        weights: { ...W.danger },
        loot: [D(3), CP(3)],
        texts: {
          loot: ["La ⊗ marcaba un cajón de herramientas sellado: {amount} de {res}."],
          nada: ["La zona marcada con ⊗ fue vaciada con antelación."],
          dano: ["El piso marcado con ⊗ está carcomido: -{damage} Salud."],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // MEDICAMENTOS — sala médica
  // ----------------------------------------------------------
  medicamentos: {
    focus: "medicamentos",
    name: "Enfermería Abandonada",
    subtitle: "Camas · instrumental · botiquines",
    image: "/assets/scavenge/medicamentos.jpg",
    fallbackImage: "/assets/scavenge/medicamentos.svg",
    points: {
      p1: {
        label: "Cama superior",
        weights: { ...W.normal },
        loot: [MD(6), C(1)],
        texts: {
          loot: ["Bajo el colchón podrido: {amount} de {res}."],
          nada: ["Colchón vacío. Solo olores que no querés identificar."],
          dano: ["El somier cede y te atrapa la pierna: -{damage} Salud."],
        },
      },
      p2: {
        label: "Silla de ruedas y camilla volcada",
        weights: { ...W.rich },
        loot: [MD(5), M(2)],
        texts: {
          loot: ["El bolso colgado de la camilla volcada guardaba {amount} de {res}."],
          nada: ["La camilla fue revisada mil veces. Nada."],
          dano: ["El tubo roto de la camilla te daña la mano: -{damage} Salud."],
        },
      },
      p3: {
        label: "Camilla lateral",
        weights: { ...W.safe },
        loot: [MD(5), CP(1)],
        texts: {
          loot: ["En los cajones de la camilla: {amount} de {res}."],
          nada: ["Cajones abiertos de par en par. Vacíos."],
          dano: ["Una aguja olvidada en el cajón: -{damage} Salud."],
        },
      },
      p4: {
        label: "Camas junto a la grieta",
        weights: { ...W.normal },
        loot: [MD(4), M(2)],
        texts: {
          loot: ["Entre las camas inclinadas hacia la grieta: {amount} de {res}."],
          nada: ["La grieta se llevó lo que había entre las camas."],
          dano: ["El piso entre las camas cede un momento: -{damage} Salud."],
        },
      },
      p5: {
        label: "Cama con pertenencias",
        weights: { ...W.rich },
        loot: [MD(5), CP(2)],
        texts: {
          loot: ["Entre las pertenencias de la cama: {amount} de {res}."],
          nada: ["Solo ropa podrida y ojos que prefieren no mirar."],
          dano: ["El riel de la cama cede y te golpea: -{damage} Salud."],
        },
      },
      p6: {
        label: "Filas de camas derecha",
        weights: { ...W.normal },
        loot: [MD(4), M(2)],
        texts: {
          loot: ["Una mochila olvidada entre las camas: {amount} de {res}."],
          nada: ["Todas las camas, registradas. Nada."],
          dano: ["Un riel de la cama te araña al agacharte: -{damage} Salud."],
        },
      },
      p7: {
        label: "Camas · sector NO SALIDA",
        weights: { ...W.rich },
        loot: [MD(5), D(2)],
        texts: {
          loot: ["Bajo la cama marcada con NO SALIDA: {amount} de {res}."],
          nada: ["Esa fila fue lo primero que se registró. Nada."],
          dano: ["La cama se vuelca al moverla y te aplasta el pie: -{damage} Salud."],
        },
      },
      p8: {
        label: "⊗ Zona de peligro",
        weights: { ...W.danger },
        loot: [D(3), MD(3)],
        texts: {
          loot: ["La ⊗ señalaba un stock escondido: {amount} de {res}."],
          nada: ["La marca ⊗ es vieja. El escondite, vacío."],
          dano: ["El piso marcado con ⊗ se hunde: -{damage} Salud."],
        },
      },
    },
  },

  // ----------------------------------------------------------
  // AGUA — planta de agua
  // ----------------------------------------------------------
  agua: {
    focus: "agua",
    name: "Planta Potabilizadora",
    subtitle: "Tanques · cañerías · registros",
    image: "/assets/scavenge/agua.jpg",
    fallbackImage: "/assets/scavenge/agua.svg",
    points: {
      p1: {
        label: "Vigas caídas del techo",
        weights: { ...W.normal },
        loot: [A(6), M(2)],
        texts: {
          loot: ["Entre las vigas y tablones caídos: {amount} de {res}."],
          nada: ["Madera podrida sin nada escondido. Nada."],
          dano: ["Una viga se desliza del montón: -{damage} Salud."],
        },
      },
      p2: {
        label: "Montón de piezas y válvulas",
        weights: { ...W.rich },
        loot: [A(3), CP(3), M(2)],
        texts: {
          loot: ["Entre válvulas y piezas hallaste {amount} de {res}."],
          nada: ["Piezas inútiles, todas servidas. Nada."],
          dano: ["Una brida del montón te corta la palma: -{damage} Salud."],
        },
      },
      p3: {
        label: "Cañerías superiores",
        weights: { ...W.safe },
        loot: [A(4), CP(2)],
        texts: {
          loot: ["Una cañería aún goteaba: {amount} de {res}."],
          nada: ["Cañerías vacías y cortadas. Nada."],
          dano: ["Un codo de cañería oxidada cae desde arriba: -{damage} Salud."],
        },
      },
      p4: {
        label: "Cisterna junto a la grieta",
        weights: { ...W.rich },
        loot: [A(5), M(2)],
        texts: {
          loot: ["Al fondo de la cisterna quedó {amount} de {res}."],
          nada: ["La cisterna está seca y rajada. Nada."],
          dano: ["El borde de la grieta se desmorona bajo tus pies: -{damage} Salud."],
        },
      },
      p5: {
        label: "Unión de cañerías inferior",
        weights: { ...W.normal },
        loot: [CP(4), A(3)],
        texts: {
          loot: ["Desmontar la unión de cañerías dio {amount} de {res}."],
          nada: ["Cañerías cortadas y vaciadas. Nada."],
          dano: ["Un tramo de cañería oxidada cede al pisarlo: -{damage} Salud."],
        },
      },
      p6: {
        label: "Tanques derecha",
        weights: { ...W.normal },
        loot: [A(5), M(2)],
        texts: {
          loot: ["Uno de los tanques aún sellaba: {amount} de {res}."],
          nada: ["Todos los tanques abiertos y vacíos."],
          dano: ["Una escalerilla suelta te hace caer: -{damage} Salud."],
        },
      },
      p7: {
        label: "Registros de agua · NO SALIDA",
        weights: { ...W.rich },
        loot: [A(4), D(2)],
        texts: {
          loot: ["En los registros del archivo: {amount} de {res}."],
          nada: ["Registros quemados. Nada legible, nada útil."],
          dano: ["El estante de registros colapsa: -{damage} Salud."],
        },
      },
      p8: {
        label: "⊗ Zona de peligro",
        weights: { ...W.danger },
        loot: [D(3), A(3)],
        texts: {
          loot: ["La ⊗ marcaba un pozo de suministros: {amount} de {res}."],
          nada: ["El pozo marcado con ⊗ ya fue limpiado por otro."],
          dano: ["El piso sobre el pozo marcado cede: -{damage} Salud."],
        },
      },
    },
  },
};

/** Location for a zone, derived from the zone's thematic focus. */
export function scavengeLocationForZone(zoneId: number): ScavengeLocationDef {
  const focus = getZone(zoneId).focus;
  return SCAVENGE_LOCATIONS[(focus as ScavengeFocus) in SCAVENGE_LOCATIONS ? (focus as ScavengeFocus) : "materiales"];
}
