// TradeOS — AI coaching limits and fixed labels. Server-side maps only: the model
// is only ever sent these fixed labels, never anything a user typed.

import { effectivePlan } from "@/lib/billing/plans";
import type { Plan } from "@/lib/types";
import { FOCUS_AREAS, TONES, type CoachingTone, type FocusArea } from "./types";

export { FOCUS_AREAS, TONES };
export type { FocusArea, CoachingTone };

export function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const PLAN_DEFAULTS: Record<Plan, { env: string; fallback: number }> = {
  free: { env: "AI_DAILY_CAP_FREE", fallback: 3 },
  pro: { env: "AI_DAILY_CAP_PRO", fallback: 10 },
  elite: { env: "AI_DAILY_CAP_ELITE", fallback: 25 },
};

/**
 * Notes a day for a user. Plan used = effectivePlan (a trial gets Pro's cap, a
 * canceled / past_due account the free cap). AI_DAILY_CAP_PER_USER, when SET, is
 * a hard ceiling for every plan. 0 means "this plan gets no coaching".
 */
export function coachingDailyCapFor(plan: Plan, billingStatus: string): number {
  const def = PLAN_DEFAULTS[effectivePlan(plan, billingStatus)];
  const planCap = envInt(def.env, def.fallback);
  const ceiling = Number.parseInt(process.env.AI_DAILY_CAP_PER_USER ?? "", 10);
  return Number.isFinite(ceiling) && ceiling >= 0 ? Math.min(planCap, ceiling) : planCap;
}

/** How long an identical request is served from the saved note. */
export function aiCacheHours(): number {
  return envInt("AI_CACHE_HOURS", 24);
}

export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  rules: "Following my own rules",
  sizing: "Position-sizing discipline",
  emotions: "Emotional control",
  journaling: "Journaling habits",
  consistency: "Consistency",
};

export const TONE_LINES: Record<CoachingTone, string> = {
  gentle: "Tone: warm and encouraging, still honest.",
  direct: "Tone: blunt, concise, no padding.",
};
