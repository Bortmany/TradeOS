"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Wallet, Tag, LineChart, Trophy, Radio, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface AccountOption {
  id: string;
  name: string;
  kind: string;
}

const ALL = "all";

/**
 * URL-driven journal filter bar. Each Select writes/clears a search param
 * (`account`, `strategy`, `symbol`, `outcome`, `source`) and resets the page.
 */
export function JournalFilters({
  accounts,
  strategies,
  symbols,
  sources,
}: {
  accounts: AccountOption[];
  strategies: string[];
  symbols: string[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const account = params.get("account") ?? ALL;
  const strategy = params.get("strategy") ?? ALL;
  const symbol = params.get("symbol") ?? ALL;
  const outcome = params.get("outcome") ?? ALL;
  const source = params.get("source") ?? ALL;

  const hasFilters =
    account !== ALL ||
    strategy !== ALL ||
    symbol !== ALL ||
    outcome !== ALL ||
    source !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={account} onValueChange={(v) => setParam("account", v)}>
        <SelectTrigger className="h-9 w-[160px] gap-2">
          <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={symbol} onValueChange={(v) => setParam("symbol", v)}>
        <SelectTrigger className="h-9 w-[130px] gap-2">
          <LineChart className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All symbols" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All symbols</SelectItem>
          {symbols.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={strategy} onValueChange={(v) => setParam("strategy", v)}>
        <SelectTrigger className="h-9 w-[150px] gap-2">
          <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All strategies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All strategies</SelectItem>
          {strategies.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={outcome} onValueChange={(v) => setParam("outcome", v)}>
        <SelectTrigger className="h-9 w-[130px] gap-2">
          <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All outcomes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All outcomes</SelectItem>
          <SelectItem value="win">Winners</SelectItem>
          <SelectItem value="loss">Losers</SelectItem>
        </SelectContent>
      </Select>

      <Select value={source} onValueChange={(v) => setParam("source", v)}>
        <SelectTrigger className="h-9 w-[130px] gap-2">
          <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="All sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sources</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
