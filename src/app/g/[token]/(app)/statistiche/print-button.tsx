"use client";
import { Button } from "@/components/ui/button";

export function PrintStatsButton() {
  return (
    <Button size="sm" variant="secondary" onClick={() => window.print()}>
      PDF / Stampa
    </Button>
  );
}
