"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser print dialog — users "Save as PDF" for a clean export. */
export function PrintButton() {
  return (
    <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
      <FileDown className="h-4 w-4" />
      Export PDF
    </Button>
  );
}
