"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { ConnectionBanner } from "./connection-banner";
import { logout } from "@/app/g/[token]/actions";

type Item = { href: string; label: string; icon: string };

export function StaffShell({
  token,
  tenantName,
  staffName,
  roleLabel,
  impersonating,
  nav,
  notice,
  children,
}: {
  token: string;
  tenantName: string;
  staffName: string;
  roleLabel: string;
  impersonating: boolean;
  nav: Item[];
  notice: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/g/${token}`;
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-0.5 p-3">
      {nav.map((item) => {
        const href = `${base}/${item.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="border-t border-slate-200 p-3">
      <p className="px-3 text-sm font-medium text-slate-900">{staffName}</p>
      <p className="px-3 text-xs text-slate-500">{roleLabel}</p>
      <form action={logout.bind(null, token)}>
        <button className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <Icon name="logout" className="h-4 w-4" /> {impersonating ? "Termina assistenza" : "Esci"}
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <ConnectionBanner />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-6">
          <span className="truncate text-sm font-semibold text-slate-900">{tenantName}</span>
        </div>
        <div className="flex-1 overflow-y-auto">{links}</div>
        {userBox}
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <span className="truncate text-sm font-semibold">{tenantName}</span>
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="p-2">
          <Icon name={open ? "x" : "menu"} />
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col overflow-y-auto bg-white lg:hidden">
          <div className="flex-1">{links}</div>
          {userBox}
        </div>
      )}
      {impersonating && (
        <div className="bg-violet-600 px-4 py-2 text-center text-sm font-medium text-white">
          Modalità assistenza: stai operando come titolare. Ogni azione viene registrata.
        </div>
      )}
      {notice && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">{notice}</div>}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
