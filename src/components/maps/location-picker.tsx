"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const Map = dynamic(() => import("./location-picker-map"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-lg bg-slate-100" />,
});

export function LocationPicker({
  lat,
  lng,
  radius,
  defaultQuery,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  defaultQuery?: string;
  onChange: (v: { lat: number | null; lng: number | null; radius: number }) => void;
}) {
  const [query, setQuery] = useState(defaultQuery ?? "");
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setMsg(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (!hit) setMsg("Indirizzo non trovato: clicca sulla mappa per posizionare il locale.");
      else onChange({ lat: Number(hit.lat), lng: Number(hit.lon), radius });
    } catch {
      setMsg("Ricerca non disponibile: clicca sulla mappa.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Via, numero civico, città"
        />
        <Button variant="secondary" onClick={search} disabled={searching}>
          {searching ? "…" : "Cerca"}
        </Button>
      </div>
      {msg && <p className="text-xs text-amber-700">{msg}</p>}
      <Map lat={lat} lng={lng} radius={radius} onPick={(la, ln) => onChange({ lat: la, lng: ln, radius })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Latitudine">
          <Input
            inputMode="decimal"
            value={lat ?? ""}
            onChange={(e) => onChange({ lat: e.target.value === "" ? null : Number(e.target.value), lng, radius })}
          />
        </Field>
        <Field label="Longitudine">
          <Input
            inputMode="decimal"
            value={lng ?? ""}
            onChange={(e) => onChange({ lat, lng: e.target.value === "" ? null : Number(e.target.value), radius })}
          />
        </Field>
        <Field label={`Raggio consentito: ${radius} m`} hint="Consigliato 50–150 m">
          <input
            type="range"
            min={20}
            max={500}
            step={10}
            value={radius}
            onChange={(e) => onChange({ lat, lng, radius: Number(e.target.value) })}
            className="mt-3 w-full accent-slate-900"
          />
        </Field>
      </div>
    </div>
  );
}
