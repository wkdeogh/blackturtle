export interface XCollectionSettingsInput {
  lookbackDays: number;
  perAccountPostLimit: number | null;
  totalPostLimit: number | null;
}

function normalizeLookbackDays(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30 ? value : null;
}

function normalizeOptionalLimit(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : "invalid";
}

export function normalizeXCollectionSettings(value: unknown): XCollectionSettingsInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const lookbackDays = normalizeLookbackDays(input.lookbackDays);
  const perAccountPostLimit = normalizeOptionalLimit(input.perAccountPostLimit);
  const totalPostLimit = normalizeOptionalLimit(input.totalPostLimit);
  if (!lookbackDays || perAccountPostLimit === "invalid" || totalPostLimit === "invalid") return null;
  return { lookbackDays, perAccountPostLimit, totalPostLimit };
}
