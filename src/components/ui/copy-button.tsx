"use client";
import { useState } from "react";
import { Button } from "./button";
import { Icon } from "./icon";

export function CopyButton({ value, label = "Copia" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Icon name={done ? "check" : "copy"} className="h-4 w-4" />
      {done ? "Copiato" : label}
    </Button>
  );
}
