"use client";
import { cn } from "@/lib/cn";
import { Checkbox, Input } from "@/components/ui/field";
import type { Visibility } from "@/domain/menu";

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Weekdays + time window editor ("visibile solo dalle 7 alle 11"). */
export function VisibilityEditor({
  value,
  onChange,
  label = "Limita per orario",
}: {
  value: Visibility | null;
  onChange: (v: Visibility | null) => void;
  label?: string;
}) {
  const v = value ?? { weekdays: [], from: null, to: null };
  return (
    <div className="space-y-3">
      <Checkbox
        label={label}
        description="Fuori da giorni e orari indicati non viene mostrato"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked ? { weekdays: [], from: "07:00", to: "11:00" } : null)}
      />
      {value && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, i) => {
              const day = i + 1;
              const on = v.weekdays.includes(day);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    onChange({ ...v, weekdays: on ? v.weekdays.filter((x) => x !== day) : [...v.weekdays, day].sort() })
                  }
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium ring-1",
                    on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300",
                  )}
                >
                  {d}
                </button>
              );
            })}
            <span className="self-center pl-1 text-xs text-slate-500">{v.weekdays.length ? "" : "tutti i giorni"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            dalle
            <Input type="time" className="w-32" value={v.from ?? ""} onChange={(e) => onChange({ ...v, from: e.target.value || null })} />
            alle
            <Input type="time" className="w-32" value={v.to ?? ""} onChange={(e) => onChange({ ...v, to: e.target.value || null })} />
          </div>
        </div>
      )}
    </div>
  );
}
