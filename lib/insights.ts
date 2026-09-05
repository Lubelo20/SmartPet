/**
 * The pure half of the AI insights feature: validating what the browser sends
 * and building the prompt the server forwards to Gemini.
 *
 * Kept out of the route so both are testable without a network. The sanitiser
 * is the security boundary of the feature: the route forwards NOTHING that
 * did not survive it, so a hostile client can neither balloon the prompt nor
 * smuggle arbitrary text lengths through to a metered API.
 */

const MAX_PETS = 12;
const MAX_DAILY = 14;
const MAX_ALERTS = 10;
const MAX_NAME = 60;

export type InsightsInput = {
  pets: { name: string; portionG: number; mealsPerDay: number }[];
  analytics: {
    accuracyPct: number;
    successRate: number;
    meanErr: number;
    daily: { label: string; grams: number; cycles: number }[];
    perPet: { name: string; grams: number; cycles: number; avg: number }[];
  };
  unreadAlerts: { severity: string; title: string }[];
};

const str = (v: unknown, max = MAX_NAME): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function sanitiseInsightsInput(raw: unknown): InsightsInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pets) || !Array.isArray(r.unreadAlerts)) return null;
  if (typeof r.analytics !== "object" || r.analytics === null) return null;
  const a = r.analytics as Record<string, unknown>;
  if (!Array.isArray(a.daily) || !Array.isArray(a.perPet)) return null;

  const pets = r.pets.slice(0, MAX_PETS).flatMap((p) => {
    const o = p as Record<string, unknown>;
    const name = str(o.name);
    const portionG = num(o.portionG);
    const mealsPerDay = num(o.mealsPerDay);
    return name !== null && portionG !== null && mealsPerDay !== null
      ? [{ name, portionG, mealsPerDay }] : [];
  });
  if (pets.length === 0) return null;

  const accuracyPct = num(a.accuracyPct);
  const successRate = num(a.successRate);
  const meanErr = num(a.meanErr);
  if (accuracyPct === null || successRate === null || meanErr === null) return null;

  const daily = a.daily.slice(0, MAX_DAILY).flatMap((d) => {
    const o = d as Record<string, unknown>;
    const label = str(o.label, 20);
    const grams = num(o.grams);
    const cycles = num(o.cycles);
    return label !== null && grams !== null && cycles !== null ? [{ label, grams, cycles }] : [];
  });

  const perPet = a.perPet.slice(0, MAX_PETS).flatMap((d) => {
    const o = d as Record<string, unknown>;
    const name = str(o.name);
    const grams = num(o.grams);
    const cycles = num(o.cycles);
    const avg = num(o.avg);
    return name !== null && grams !== null && cycles !== null && avg !== null
      ? [{ name, grams, cycles, avg }] : [];
  });

  const unreadAlerts = r.unreadAlerts.slice(0, MAX_ALERTS).flatMap((al) => {
    const o = al as Record<string, unknown>;
    const severity = str(o.severity, 12);
    const title = str(o.title, 80);
    return severity !== null && title !== null ? [{ severity, title }] : [];
  });

  return { pets, analytics: { accuracyPct, successRate, meanErr, daily, perPet }, unreadAlerts };
}

export function buildInsightsPrompt(input: InsightsInput): string {
  const pets = input.pets
    .map((p) => `- ${p.name}: target ${p.portionG} g per meal, ${p.mealsPerDay} meals/day`)
    .join("\n");
  const daily = input.analytics.daily
    .map((d) => `- ${d.label}: ${d.grams} g over ${d.cycles} feedings`)
    .join("\n");
  const perPet = input.analytics.perPet
    .map((d) => `- ${d.name}: ${d.grams} g across ${d.cycles} feedings (avg ${d.avg} g)`)
    .join("\n");
  const alerts = input.unreadAlerts.length
    ? input.unreadAlerts.map((al) => `- [${al.severity}] ${al.title}`).join("\n")
    : "- none";

  return `You are the summary writer for a smart pet feeder dashboard.
Write a short summary (3 to 5 sentences) of how feeding has gone recently,
in plain prose a pet owner reads at a glance. No markdown, no headings, no
bullet points, no preamble — just the sentences.

Use only the data below. Do not invent feedings, amounts or events that are
not in it. If something looks off — a pet trending under its target, a run of
failed cycles, an unread warning — say so plainly; if all is well, say that.

Pets and their plans:
${pets}

Portion accuracy: ${input.analytics.accuracyPct}% · cycle success rate: ${input.analytics.successRate}% · mean portion error: ${input.analytics.meanErr} g

Daily totals (most recent days):
${daily}

Per pet:
${perPet}

Unread alerts:
${alerts}`;
}
