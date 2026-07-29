"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountOption {
  id: string;
  name: string;
  kind: string;
}

/** URL-driven account filter. Writes `?account=<id>` (or clears it for "All"). */
export function AccountSwitcher({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("account") ?? "all";

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("account");
    else next.set("account", value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-[180px] gap-2">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="All accounts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
