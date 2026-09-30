// TradeOS — one way to show an account, everywhere.
//
// Accounts, Prop and every trade header read an account's name, status and
// broker label through this helper, so the three screens can never disagree.
// The account's own `kind` is the status (the owner's rule: the account is the
// truth). A prop tracker's `phase` is NOT a status — it is shown only as
// "Eval progress: …". Pure and client-safe.

export type BadgeVariant = "profit" | "info" | "warning" | "secondary";

/** One spelling per stored broker key. */
export const BROKER_LABELS: Readonly<Record<string, string>> = {
  topstepx: "TopstepX",
  tradovate: "Tradovate",
  ninjatrader: "NinjaTrader",
  rithmic: "Rithmic",
  ibkr: "Interactive Brokers",
  generic: "Generic CSV",
  manual: "Manual",
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  live: "Live",
  funded: "Funded",
  evaluation: "Evaluation",
  demo: "Demo",
};

const STATUS_VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  funded: "profit",
  live: "info",
  evaluation: "warning",
  demo: "secondary",
};

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function brokerLabel(broker: string | null | undefined): string {
  if (!broker) return "Manual";
  return BROKER_LABELS[broker] ?? titleCase(broker);
}

export function accountStatusLabel(kind: string | null | undefined): string {
  if (!kind) return "Live";
  return STATUS_LABELS[kind] ?? titleCase(kind);
}

export function accountStatusVariant(kind: string | null | undefined): BadgeVariant {
  return (kind && STATUS_VARIANTS[kind]) || "secondary";
}

export interface AccountDisplay {
  name: string;
  /** The account's own status (from `TradingAccount.kind`). */
  status: string;
  statusVariant: BadgeVariant;
  broker: string;
}

/** The single name / status / broker label a screen shows for an account. */
export function accountDisplay(account: {
  name: string;
  kind: string;
  broker: string;
}): AccountDisplay {
  return {
    name: account.name,
    status: accountStatusLabel(account.kind),
    statusVariant: accountStatusVariant(account.kind),
    broker: brokerLabel(account.broker),
  };
}

/** Hover hint on the prop tracker's progress chip. */
export const EVAL_PROGRESS_HINT =
  "Your progress through the evaluation rules. This isn't your account's status.";

/** "Eval progress: Evaluation" — the tracker's phase, never read as a status. */
export function evalProgressLabel(phase: string | null | undefined): string {
  const words = phase && phase.trim() ? titleCase(phase.trim()) : "Not started";
  return `Eval progress: ${words}`;
}
