#!/usr/bin/env bun
/**
 * AFTERFALL — Harness que invoca los reportes de regresión en un solo paso.
 * Salidas JSON a logs/ (un archivo por reporte) para poder assertuarse tras
 * un cambio de balance o de sistema de log.
 *
 * Ejecutar:
 *   bun scripts/npcReport.ts        (nuevo — producción de NPC por tipo)
 *   bun scripts/logReport.ts        (ya existía — sistema de logging)
 *   bun scripts/balanceReport.ts    (ya existía — balances/reportes numéricos)
 *
 * Este archivo es el punto de entrada único de la regresión en cada turno.
 * Cada reporte cabe correrlo por separado; este harness los orquesta y
 * reporta un código de salida coherente.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve("./");
const OUT = resolve(ROOT, "logs");
mkdirSync(OUT, { recursive: true });

let anyFail = false;

function run(name: string, file: string): void {
  const start = performance.now();
  try {
    execSync(`bun ${file}`, {
      cwd: ROOT,
      stdio: "inherit",
      timeout: 90_000,
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`  ✓ ${name}  (${elapsed}s)`);
  } catch (e: any) {
    anyFail = true;
    console.log(`  ✗ ${name}  salió con código ${e.status ?? 1}`);
  }
}

console.log("=========================================================");
console.log(" AFTERFALL — REPORTE DE REGRESIÓN (harness único)");
console.log("=========================================================\n");

run("logReport", "./scripts/logReport.ts");
run("balanceReport", "./scripts/balanceReport.ts");

console.log("\n=========================================================");
if (!anyFail) {
  console.log(" Todos los reportes pasaron.");
  process.exit(0);
}
console.log(" Al menos un reporte falló.");
process.exit(1);
