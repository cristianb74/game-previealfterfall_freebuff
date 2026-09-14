// AFTERFALL asset generator (run once with bun or node)
// Generates: /public/icons, /public/assets/stages/*.svg (20), /public/assets/npc/*.svg (104)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
const stagesDir = join(root, "public", "assets", "stages");
const npcDir = join(root, "public", "assets", "npc");
const gameSrcDir = join(root, "src", "game");
mkdirSync(iconsDir, { recursive: true });
mkdirSync(stagesDir, { recursive: true });
mkdirSync(npcDir, { recursive: true });
mkdirSync(gameSrcDir, { recursive: true });

// Mulberry32 PRNG for deterministic variation
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- app icon ----------
function appIcon(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="88" fill="#0a0a0a"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#22c55e" stroke-width="26" opacity="0.9"/>
  <circle cx="256" cy="256" r="88" fill="#0a0a0a" stroke="#22c55e" stroke-width="18"/>
  <circle cx="256" cy="256" r="34" fill="#22c55e"/>
  <path d="M256 106 L256 158" stroke="#22c55e" stroke-width="26"/>
  <path d="M256 406 L256 354" stroke="#22c55e" stroke-width="26"/>
  <path d="M256 106 L256 168 A88 88 0 0 1 256 344" fill="none" stroke="#86efac" stroke-width="14" opacity="0.7"/>
  <rect x="40" y="440" width="432" height="10" fill="#22c55e" opacity="0.55"/>
  <rect x="40" y="62" width="432" height="10" fill="#22c55e" opacity="0.55"/>
</svg>`;
}
writeFileSync(join(iconsDir, "icon.svg"), appIcon(512));

function pngIcon(size) {
  return Buffer.from(
    `P1\n${size} ${size}\n` +
      Array.from({ length: size * size }, (_, i) => {
        const x = i % size, y = (i / size) | 0;
        const c = size / 2;
        const dx = x - c, dy = y - c;
        const r = Math.hypot(dx, dy);
        const on =
          (r < c * 0.62 && (Math.abs(Math.atan2(dy, dx)) < 0.6 || r > c * 0.3)) ||
          (r < c * 0.16 && y < c) ||
          (x % Math.max(6, size / 12) < 2 && (y < size * 0.12 || y > size * 0.88));
        return on ? 1 : 0;
      }).join("") + "\n",
    "ascii",
  );
}
writeFileSync(join(iconsDir, "icon-192.png"), pngIcon(192));
writeFileSync(join(iconsDir, "icon-512.png"), pngIcon(512));

// ---------- zone stage images ----------
const zones = [
  ["Apartamentos Ruinosos", "residential", "city"],
  ["Supermercado Saqueado", "market", "city"],
  ["Gasolinera Abandonada", "industrial", "city"],
  ["Hospital Derruido", "hospital", "city"],
  ["Bloque de Oficinas", "office", "city"],
  ["Colegio en Ruinas", "residential", "city"],
  ["Fabrica de Textil", "industrial", "city"],
  ["Estacion de Tren", "transport", "city"],
  ["Deposito de Agua", "industrial", "city"],
  ["Colonia Cercada", "residential", "city"],
  ["Polyclinica Militar", "hospital", "military"],
  ["Zona Industrial Norte", "industrial", "military"],
  ["Barrios Colapsados", "residential", "city"],
  ["Central Electrica", "industrial", "city"],
  ["Laboratorio Quimico", "lab", "military"],
  ["Deposito Militar", "military", "military"],
  ["Torres Residenciales", "residential", "city"],
  ["Puerto Mercante", "transport", "city"],
  ["Zona de Cuarentena", "lab", "military"],
  ["Base Militar", "military", "military"],
];

function zoneSvg(index, kind, tint) {
  const W = 480, H = 300;
  const rnd = mulberry32(index * 7919 + 13);
  const palettes = {
    city: ["#101314", "#171b1d", "#1e2427", "#262d30"],
    military: ["#0e1112", "#161a19", "#1c211f", "#242b28"],
  };
  const pal = palettes[tint] ?? palettes.city;
  let layers = "";
  // sky gradient + haze
  layers += `<rect width="${W}" height="${H}" fill="url(#sky${index})"/>`;
  // radioactive glow near horizon
  layers += `<ellipse cx="${120 + rnd() * 240}" cy="${H * 0.72}" rx="${170 + rnd() * 90}" ry="46" fill="#22c55e" opacity="0.06"/>`;
  // far skyline
  let far = "";
  for (let x = 0; x < W; ) {
    const w = 26 + rnd() * 42;
    const h = 40 + rnd() * 90;
    far += `<rect x="${x.toFixed(0)}" y="${(H * 0.62 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${pal[1]}"/>`;
    if (rnd() < 0.4) far += `<rect x="${(x + 4).toFixed(0)}" y="${(H * 0.62 - h + 10).toFixed(0)}" width="4" height="5" fill="#22c55e" opacity="0.35"/>`;
    x += w + 4;
  }
  layers += `<g>${far}</g>`;
  // main structure silhouettes by kind
  let structs = "";
  const baseY = H * 0.78;
  if (kind === "residential") {
    for (let i = 0; i < 3; i++) {
      const w = 70 + rnd() * 60, h = 70 + rnd() * 70, x = 20 + i * 140 + rnd() * 20;
      structs += `<rect x="${x}" y="${baseY - h}" width="${w}" height="${h}" fill="${pal[2]}"/>`;
      for (let wy = baseY - h + 12; wy < baseY - 10; wy += 16) {
        for (let wx = x + 8; wx < x + w - 10; wx += 16) {
          if (rnd() < 0.25) structs += `<rect x="${wx}" y="${wy}" width="7" height="8" fill="#22c55e" opacity="${(0.25 + rnd() * 0.4).toFixed(2)}"/>`;
        }
      }
      structs += `<rect x="${(x + w * 0.3).toFixed(0)}" y="${(baseY - h - 12).toFixed(0)}" width="${(w * 0.18).toFixed(0)}" height="12" fill="${pal[1]}"/>`;
    }
  } else if (kind === "industrial") {
    structs += `<rect x="30" y="${baseY - 90}" width="150" height="90" fill="${pal[2]}"/>`;
    structs += `<rect x="60" y="${baseY - 150}" width="24" height="62" fill="${pal[3]}"/>`;
    structs += `<rect x="96" y="${baseY - 130}" width="24" height="42" fill="${pal[3]}"/>`;
    structs += `<rect x="210" y="${baseY - 60}" width="180" height="60" fill="${pal[2]}"/>`;
    structs += `<path d="M240 ${baseY - 60} l30 -34 l30 34 z" fill="${pal[3]}"/>`;
    structs += `<path d="M310 ${baseY - 60} l30 -34 l30 34 z" fill="${pal[3]}"/>`;
    structs += `<circle cx="452" cy="${baseY - 40}" r="20" fill="${pal[3]}" opacity="0.8"/>`;
  } else if (kind === "hospital") {
    structs += `<rect x="40" y="${baseY - 120}" width="200" height="120" fill="${pal[2]}"/>`;
    structs += `<rect x="120" y="${baseY - 150}" width="40" height="30" fill="${pal[3]}"/>`;
    structs += `<rect x="130" y="${baseY - 144}" width="20" height="18" fill="#ef4444" opacity="0.55"/>`;
    for (let wx = 52; wx < 228; wx += 20) for (let wy = baseY - 108; wy < baseY - 12; wy += 18)
      if (rnd() < 0.3) structs += `<rect x="${wx}" y="${wy}" width="9" height="10" fill="#22c55e" opacity="${(0.2 + rnd() * 0.4).toFixed(2)}"/>`;
    structs += `<rect x="270" y="${baseY - 60}" width="150" height="60" fill="${pal[1]}"/>`;
  } else if (kind === "office") {
    structs += `<rect x="60" y="${baseY - 160}" width="110" height="160" fill="${pal[2]}"/>`;
    structs += `<rect x="190" y="${baseY - 110}" width="90" height="110" fill="${pal[3]}"/>`;
    for (let wy = baseY - 150; wy < baseY - 14; wy += 18)
      for (let wx = 70; wx < 160; wx += 16)
        if (rnd() < 0.28) structs += `<rect x="${wx}" y="${wy}" width="8" height="9" fill="#22c55e" opacity="${(0.2 + rnd() * 0.35).toFixed(2)}"/>`;
  } else if (kind === "lab") {
    structs += `<rect x="50" y="${baseY - 70}" width="180" height="70" fill="${pal[2]}"/>`;
    structs += `<rect x="240" y="${baseY - 110}" width="46" height="110" fill="${pal[3]}"/>`;
    structs += `<rect x="300" y="${baseY - 55}" width="120" height="55" fill="${pal[1]}"/>`;
    structs += `<circle cx="263" cy="${baseY - 122}" r="9" fill="#22c55e" opacity="0.8"/>`;
    structs += `<path d="M330 ${baseY - 55} v-26 q0 -14 14 -14 t14 14 v26" fill="none" stroke="${pal[3]}" stroke-width="8"/>`;
  } else if (kind === "transport") {
    structs += `<rect x="0" y="${baseY - 26}" width="${W}" height="26" fill="${pal[3]}"/>`;
    for (let x = 14; x < W; x += 44) structs += `<rect x="${x}" y="${baseY - 42}" width="8" height="18" fill="${pal[2]}"/>`;
    structs += `<rect x="290" y="${baseY - 86}" width="120" height="60" fill="${pal[2]}"/>`;
    structs += `<path d="M290 ${baseY - 86} q60 -36 120 0 z" fill="${pal[3]}"/>`;
    structs += `<rect x="60" y="${baseY - 40}" width="90" height="16" fill="${pal[2]}"/>`;
  } else if (kind === "market") {
    structs += `<path d="M30 ${baseY - 20} L120 ${baseY - 70} L210 ${baseY - 20} z" fill="${pal[2]}"/>`;
    structs += `<rect x="230" y="${baseY - 64}" width="170" height="64" fill="${pal[2]}"/>`;
    structs += `<rect x="252" y="${baseY - 46}" width="34" height="46" fill="#0a0d0e"/>`;
    structs += `<rect x="322" y="${baseY - 46}" width="34" height="46" fill="#0a0d0e"/>`;
    structs += `<rect x="300" y="${baseY - 74}" width="34" height="10" fill="#22c55e" opacity="0.5"/>`;
  } else { // military
    structs += `<path d="M40 ${baseY - 8} L40 ${baseY - 50} L120 ${baseY - 86} L200 ${baseY - 50} L200 ${baseY - 8} z" fill="${pal[2]}"/>`;
    structs += `<rect x="230" y="${baseY - 44}" width="120" height="44" fill="${pal[1]}"/>`;
    structs += `<rect x="240" y="${baseY - 66}" width="14" height="22" fill="${pal[3]}"/>`;
    structs += `<rect x="262" y="${baseY - 66}" width="14" height="22" fill="${pal[3]}"/>`;
    structs += `<rect x="284" y="${baseY - 66}" width="14" height="22" fill="${pal[3]}"/>`;
    structs += `<rect x="392" y="${baseY - 96}" width="10" height="52" fill="${pal[3]}"/>`;
    structs += `<path d="M402 ${baseY - 96} h34 v8 h-34 z" fill="#ef4444" opacity="0.6"/>`;
  }
  layers += structs;
  // rubble + ground
  let rubble = "";
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = baseY + rnd() * (H - baseY - 6);
    const s = 3 + rnd() * 8;
    rubble += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${(s * 0.6).toFixed(0)}" fill="#0c0f10" opacity="0.9" transform="rotate(${(rnd() * 40 - 20).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }
  layers += rubble;
  layers += `<rect x="0" y="${H - 6}" width="${W}" height="6" fill="#22c55e" opacity="0.14"/>`;
  // grain
  let grain = "";
  for (let i = 0; i < 60; i++) {
    grain += `<rect x="${(rnd() * W).toFixed(0)}" y="${(rnd() * H).toFixed(0)}" width="2" height="2" fill="#ffffff" opacity="${(rnd() * 0.05).toFixed(3)}"/>`;
  }
  layers += grain;

  const skyId = `sky${index}`;
  const c0 = tint === "military" ? "#0b0d0e" : "#0c0e10";
  const c1 = tint === "military" ? "#191f1c" : "#171d20";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="${skyId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c0}"/><stop offset="0.7" stop-color="${c1}"/><stop offset="1" stop-color="#0a0c0d"/>
    </linearGradient>
  </defs>
  ${layers}
</svg>`;
}

zones.forEach(([name, kind, tint], i) => {
  const num = String(i + 1).padStart(2, "0");
  writeFileSync(join(stagesDir, `stage-${num}.svg`), zoneSvg(i + 1, kind, tint));
});

// ---------- NPC portraits (104) ----------
// 1-40 B (blanco), 41-70 G (gris), 71-90 A (azul), 91-100 R (rojo), 101-104 D (dorado)
const firstNames = [
  "Alba","Bruno","Carla","Diego","Elena","Fabian","Gloria","Hugo","Irene","Joel",
  "Karla","Lucas","Marta","Nico","Olga","Pablo","Rocio","Sergio","Tania","Ulises",
  "Vera","Walter","Ximena","Yago","Zoe","Adrian","Berta","Cesar","Diana","Emilio",
];
const lastNames = [
  "Vega","Serra","Duarte","Rios","Campos","Ibarra","Molina","Ortiz","Pardo","Reyes",
  "Salas","Trillo","Ulloa","Vidal","Zamora","Aral","Bosch","Cifuentes","Davalos","Etxarte",
];
const professions = [
  "Medico","Ingeniero","Bombero","Mecanico","Enfermero","Piloto","Cocinero","Guardia","Quimico","Topografo",
  "Soldador","Fontanero","Electricista","Agricultor","Cazador","Carpintero","Paramedico","Operador","Minero","Rescatista",
];

function npcSvg(slot, typeCode) {
  const W = 96, H = 96;
  const rnd = mulberry32(slot * 104729 + 7);
  const palette = {
    B: { bg: "#141414", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][Math.floor(rnd() * 5)], accent: "#d4d4d4", cloth: ["#2a2a2a", "#333333", "#3a3a3a"][Math.floor(rnd() * 3)] },
    G: { bg: "#17181a", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][Math.floor(rnd() * 5)], accent: "#9ca3af", cloth: ["#2e3033", "#383b3f", "#42464b"][Math.floor(rnd() * 3)] },
    A: { bg: "#11161b", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][Math.floor(rnd() * 5)], accent: "#60a5fa", cloth: ["#1e2c3d", "#24374e", "#2c4661"][Math.floor(rnd() * 3)] },
    R: { bg: "#1a1112", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][Math.floor(rnd() * 5)], accent: "#f87171", cloth: ["#3d2224", "#4a2a2c", "#573234"][Math.floor(rnd() * 3)] },
    D: { bg: "#171408", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][Math.floor(rnd() * 5)], accent: "#fbbf24", cloth: ["#3a3010", "#463a14", "#524618"][Math.floor(rnd() * 3)] },
  }[typeCode];

  const cx = W / 2;
  const headR = 14 + rnd() * 3;
  const headY = 38 + rnd() * 4;
  const shoulderY = headY + headR + 12 + rnd() * 6;
  const hairStyle = Math.floor(rnd() * 4);
  const hasMask = rnd() < 0.35;
  const hasHood = rnd() < 0.3;

  let hair = "";
  if (hairStyle === 0) hair = `<path d="M${cx - headR} ${headY - headR * 0.35} a${headR} ${headR} 0 0 1 ${headR * 2} 0 l0 -4 a${headR} ${headR} 0 0 0 -${headR * 2} 0 z" fill="#1c1c1c"/>`;
  else if (hairStyle === 1) hair = `<path d="M${cx - headR - 2} ${headY} a${headR + 2} ${headR + 2} 0 0 1 ${2 * (headR + 2)} 0 l0 ${headR * 0.7} q-${headR} ${headR * 0.5} -${2 * (headR + 2)} 0 z" fill="#151515"/>`;
  else if (hairStyle === 2) hair = `<rect x="${cx - headR - 1}" y="${headY - headR - 3}" width="${2 * headR + 2}" height="7" rx="2" fill="#181818"/>`;
  // style 3: bald

  const hood = hasHood
    ? `<path d="M${cx - headR - 8} ${headY + headR} q0 -${headR + 10} ${headR + 8} -${headR + 10} q${headR + 8} 0 ${headR + 8} ${headR + 10} l0 6 q-${headR + 8} -4 -${2 * (headR + 8)} 0 z" fill="${palette.cloth}" opacity="0.9"/>`
    : "";

  const mask = hasMask
    ? `<rect x="${cx - headR * 0.8}" y="${headY + headR * 0.25}" width="${headR * 1.6}" height="${headR * 0.75}" rx="3" fill="#3f4a3f" opacity="0.95"/>`
    : "";

  const eyes = hasMask ? "" : `<rect x="${cx - headR * 0.55}" y="${headY - 2}" width="4" height="3" fill="#0a0a0a"/><rect x="${cx + headR * 0.2}" y="${headY - 2}" width="4" height="3" fill="#0a0a0a"/>`;

  const body = `<path d="M${cx - 30} ${H} q2 -${H - shoulderY - 4} 30 -${H - shoulderY} q28 2 30 ${H - shoulderY} z" fill="${palette.cloth}"/>`;
  const strap = `<path d="M${cx - 22} ${shoulderY + 6} L${cx + 24} ${H}" stroke="#0f0f0f" stroke-width="5" opacity="0.85"/>`;
  const collar = `<rect x="${cx - 10}" y="${shoulderY - 4}" width="20" height="6" rx="2" fill="${palette.accent}" opacity="0.85"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${palette.bg}"/>
  <rect width="${W}" height="4" fill="${palette.accent}" opacity="0.25"/>
  ${body}
  ${strap}
  ${collar}
  ${hood}
  <circle cx="${cx}" cy="${headY}" r="${headR}" fill="${palette.skin}"/>
  ${hair}
  ${eyes}
  ${mask}
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#000000" opacity="0.6"/>
</svg>`;
}

for (let slot = 1; slot <= 104; slot++) {
  const code = slot <= 40 ? "B" : slot <= 70 ? "G" : slot <= 90 ? "A" : slot <= 100 ? "R" : "D";
  const idx = slot <= 40 ? slot : slot <= 70 ? slot - 40 : slot <= 90 ? slot - 70 : slot <= 100 ? slot - 90 : slot - 100;
  const id = `${code}${String(idx).padStart(2, "0")}`;
  writeFileSync(join(npcDir, `${id}.svg`), npcSvg(slot, code));
}

// ---------- survivor portraits (5) ----------
for (let s = 1; s <= 5; s++) {
  const slot = 104 + s;
  const survDir = join(root, "public", "assets", "survivor");
  mkdirSync(survDir, { recursive: true });
  const paletteS = { bg: "#101410", skin: ["#c9a68a", "#a97e5f", "#8a5f42", "#6d4a33", "#e0bfa2"][s - 1], accent: "#22c55e", cloth: ["#26301f", "#2b3526", "#22301f", "#2e3a28", "#1f2b1d"][s - 1] };
  const rndS = mulberry32(slot * 7919 + 5);
  const cx = 48, headR = 15, headY = 40, shoulderY = 68;
  const hairStyle = s % 4;
  let hair = "";
  if (hairStyle === 0) hair = `<path d="M${cx - headR} ${headY - headR * 0.35} a${headR} ${headR} 0 0 1 ${headR * 2} 0 l0 -4 a${headR} ${headR} 0 0 0 -${headR * 2} 0 z" fill="#1c1c1c"/>`;
  else if (hairStyle === 1) hair = `<path d="M${cx - headR - 2} ${headY} a${headR + 2} ${headR + 2} 0 0 1 ${2 * (headR + 2)} 0 l0 ${headR * 0.7} q-${headR} ${headR * 0.5} -${2 * (headR + 2)} 0 z" fill="#151515"/>`;
  else if (hairStyle === 2) hair = `<rect x="${cx - headR - 1}" y="${headY - headR - 3}" width="${2 * headR + 2}" height="7" rx="2" fill="#181818"/>`;
  const body = `<path d="M${cx - 30} 96 q2 -${96 - shoulderY - 4} 30 -${96 - shoulderY} q28 2 30 ${96 - shoulderY} z" fill="${paletteS.cloth}"/>`;
  const strap = `<path d="M${cx - 22} ${shoulderY + 6} L${cx + 24} 96" stroke="#0f0f0f" stroke-width="5" opacity="0.85"/>`;
  const collar = `<rect x="${cx - 10}" y="${shoulderY - 4}" width="20" height="6" rx="2" fill="${paletteS.accent}" opacity="0.85"/>`;
  const eyes = `<rect x="${cx - headR * 0.55}" y="${headY - 2}" width="4" height="3" fill="#0a0a0a"/><rect x="${cx + headR * 0.2}" y="${headY - 2}" width="4" height="3" fill="#0a0a0a"/>`;
  writeFileSync(join(survDir, `s-${s}.svg`), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${paletteS.bg}"/>
  <rect width="96" height="4" fill="${paletteS.accent}" opacity="0.3"/>
  ${body}
  ${strap}
  ${collar}
  <circle cx="${cx}" cy="${headY}" r="${headR}" fill="${paletteS.skin}"/>
  ${hair}
  ${eyes}
  <rect x="0.5" y="0.5" width="95" height="95" fill="none" stroke="#000000" opacity="0.6"/>
</svg>`);
}

// ---------- npc-data.json for runtime ----------
const npcSeed = [];
for (let slot = 1; slot <= 104; slot++) {
  const code = slot <= 40 ? "B" : slot <= 70 ? "G" : slot <= 90 ? "A" : slot <= 100 ? "R" : "D";
  const idx = slot <= 40 ? slot : slot <= 70 ? slot - 40 : slot <= 90 ? slot - 70 : slot <= 100 ? slot - 90 : slot - 100;
  const id = `${code}${String(idx).padStart(2, "0")}`;
  const rnd = mulberry32(slot * 68917 + 101);
  npcSeed.push({
    id,
    name: `${pick(rnd, firstNames)} ${pick(rnd, lastNames)}`,
    alias: pick(rnd, [
      "El Fanta","Zarpa","Ceniza","Tuercas","La Chispa","Muro","Vigia","Trébol","Susurro","Ciclón",
      "Punto","Racha","Casco","Brasa","Témpano","Gas","Mecha","Radar","Eco","Lima",
    ]),
    profession: pick(rnd, professions),
    type: code,
  });
}
writeFileSync(join(root, "public", "assets", "npc-data.json"), JSON.stringify(npcSeed, null, 1));

// ---------- src/game/npcSeed.ts (bundled at compile time) ----------
const ts = `// AUTO-GENERATED by scripts/generate-assets.mjs — do not edit by hand.
export type NpcSeed = { id: string; name: string; alias: string; profession: string; type: "B" | "G" | "A" | "R" | "D" };

export const NPC_SEED: NpcSeed[] = ${JSON.stringify(npcSeed)};
`;
writeFileSync(join(root, "src", "game", "npcSeed.ts"), ts);

console.log("Assets generated: app icons, 20 stages, 104 npc portraits, 5 survivor portraits, npc-data.json, npcSeed.ts");
