// Futures point multipliers now live in src/lib/instruments/futures.ts (with the
// forex/CFD table and maths next to them). This file re-exports them so every
// existing import keeps working unchanged.
//
// Reminder: pointMultiplier() is for FUTURES. It returns 1 for anything it does
// not know, which is wrong for forex and CFDs; those go through
// src/lib/instruments/ (pipValue, pnlFromPrices, ...).

export { pointMultiplier, rootSymbol } from "@/lib/instruments/futures";
