"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { PinPad } from "@/components/ui/pin-pad";
import { ROLE_LABELS, type StaffRole } from "@/domain/permissions";
import { loginStaff } from "../actions";

type Staff = { id: string; displayName: string; role: string; color: string };

export function StaffLogin({ token, name, logoUrl, staff }: { token: string; name: string; logoUrl: string | null; staff: Staff[] }) {
  const [selected, setSelected] = useState<Staff | null>(null);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-slate-100 px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        {logoUrl && <img src={logoUrl} alt="" className="mb-3 h-14 w-14 rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200" />}
        <h1 className="text-xl font-bold text-slate-900">{name}</h1>
        <p className="mt-1 text-sm text-slate-500">{selected ? `Ciao ${selected.displayName}, inserisci il tuo PIN` : "Chi sei?"}</p>
      </div>

      {selected ? (
        <>
          <PinPad onSubmit={(pin) => loginStaff(token, selected.id, pin)} />
          <button onClick={() => setSelected(null)} className="mt-8 text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Cambia utente
          </button>
        </>
      ) : (
        <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-95"
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white"
                style={{ background: s.color }}
              >
                {s.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-slate-900">{s.displayName}</span>
              <span className="text-xs text-slate-500">{ROLE_LABELS[s.role as StaffRole]}</span>
            </button>
          ))}
          {staff.length === 0 && <p className="col-span-full text-center text-sm text-slate-500">Nessun utente attivo.</p>}
        </div>
      )}
      {!selected && (
        <Link href={`/g/${token}`} className="mt-10 text-sm font-medium text-slate-600 hover:text-slate-900">
          Accesso titolare
        </Link>
      )}
    </main>
  );
}
