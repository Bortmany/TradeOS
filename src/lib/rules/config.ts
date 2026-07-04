// TradeOS — Rule config parsing & validation.
// A `Rule.config` is stored in the DB as a JSON *string* whose shape depends on
// the rule's `type`. This module is the single boundary that turns that opaque
// blob into a validated, strongly-typed config object using the zod schemas
// declared in `@/lib/types`.

import { z } from "zod";
import {
  RULE_CONFIG_SCHEMAS,
  TimeWindowConfig,
  RiskLimitConfig,
  MaxTradesConfig,
  MaxContractsConfig,
  MaxDailyLossConfig,
  BehavioralConfig,
  IndicatorConfig,
  SetupValidationConfig,
  type RuleType,
} from "@/lib/types";

// Typed views of each config schema (post-validation, defaults applied).
export type TimeWindowCfg = z.infer<typeof TimeWindowConfig>;
export type RiskLimitCfg = z.infer<typeof RiskLimitConfig>;
export type MaxTradesCfg = z.infer<typeof MaxTradesConfig>;
export type MaxContractsCfg = z.infer<typeof MaxContractsConfig>;
export type MaxDailyLossCfg = z.infer<typeof MaxDailyLossConfig>;
export type BehavioralCfg = z.infer<typeof BehavioralConfig>;
export type IndicatorCfg = z.infer<typeof IndicatorConfig>;
export type SetupValidationCfg = z.infer<typeof SetupValidationConfig>;

/**
 * Normalize a raw config value into a plain object. Accepts either a JSON string
 * (as stored in `Rule.config`) or an already-parsed object (as carried by
 * `RuleLike.config`). Never throws — a malformed string yields `{}` so the
 * schema layer produces a deterministic validation error instead.
 */
export function coerceConfig(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

/**
 * Validate a raw config against the schema for `type`. Throws a ZodError when
 * the config does not match (callers that want soft-failure use the safe
 * variant below).
 */
export function parseRuleConfig(type: RuleType, raw: unknown): unknown {
  const schema = RULE_CONFIG_SCHEMAS[type];
  return schema.parse(coerceConfig(raw));
}

/** Non-throwing validation — useful when persisting/importing rulebooks. */
export function safeParseRuleConfig(
  type: RuleType,
  raw: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = RULE_CONFIG_SCHEMAS[type];
  const result = schema.safeParse(coerceConfig(raw));
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => i.message).join("; ") };
}

// --------------------------------------------------------------------------
// Typed accessors — parse+validate to a concrete config type. Each throws on
// invalid input; the engine wraps evaluation in a guard so a broken rule config
// degrades to `not_applicable` rather than crashing a whole recompute.
// --------------------------------------------------------------------------

export const timeWindowConfig = (raw: unknown): TimeWindowCfg =>
  TimeWindowConfig.parse(coerceConfig(raw));

export const riskLimitConfig = (raw: unknown): RiskLimitCfg =>
  RiskLimitConfig.parse(coerceConfig(raw));

export const maxTradesConfig = (raw: unknown): MaxTradesCfg =>
  MaxTradesConfig.parse(coerceConfig(raw));

export const maxContractsConfig = (raw: unknown): MaxContractsCfg =>
  MaxContractsConfig.parse(coerceConfig(raw));

export const maxDailyLossConfig = (raw: unknown): MaxDailyLossCfg =>
  MaxDailyLossConfig.parse(coerceConfig(raw));

export const behavioralConfig = (raw: unknown): BehavioralCfg =>
  BehavioralConfig.parse(coerceConfig(raw));

export const indicatorConfig = (raw: unknown): IndicatorCfg =>
  IndicatorConfig.parse(coerceConfig(raw));

export const setupValidationConfig = (raw: unknown): SetupValidationCfg =>
  SetupValidationConfig.parse(coerceConfig(raw));
