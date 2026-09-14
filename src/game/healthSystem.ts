import { BALANCE } from "./balance";

// ============================================================
// AFTERFALL — health system. No battles: damage comes from
// survival incidents during exploration. 1 Medicamento = 1 Salud.
// ============================================================

export function clampHealth(h: number): number {
  return Math.max(0, Math.min(BALANCE.maxHealth, h));
}

export function applyDamage(h: number, amount: number): number {
  return clampHealth(h - amount);
}

/** How many medicines would be used to heal to full. */
export function medicinesNeeded(health: number, medicines: number): number {
  const missing = BALANCE.maxHealth - health;
  return Math.max(0, Math.min(medicines, missing));
}

export function medicineHealAmount(): number {
  return BALANCE.medicineHealthPerUnit;
}
