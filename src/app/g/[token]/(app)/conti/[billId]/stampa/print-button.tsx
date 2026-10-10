"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <Button onClick={() => window.print()}>Stampa</Button>
      <Button variant="secondary" onClick={() => window.close()}>Chiudi</Button>
    </>
  );
}
