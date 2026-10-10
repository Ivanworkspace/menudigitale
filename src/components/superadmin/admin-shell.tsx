"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { publicEnv } from "@/lib/env";
import { signOutAdmin } from "@/app/superadmin/(panel)/actions";

const NAV = [
  { href: "/superadmin", label: "Panoramica", icon: "home", exact: true },
  { href: "/superadmin/clienti", label: "Clienti", icon: "store" },
  { href: "/superadmin/piani", label: "Piani", icon: "layers" },
  { href: "/superadmin/log", label: "Registro attività", icon: "list" },
  { href: "/superadmin/impostazioni", label: "Impostazioni", icon: "settings" },
];

export function AdminShell({ adminName, children }: { adminName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-white/10 pt-3">
        <p className="px-3 text-xs text-slate-400">{adminName}</p>
        <form action={signOutAdmin}>
          <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
            <Icon name="logout" className="h-4 w-4" /> Esci
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 lg:flex">
        <div className="flex h-14 items-center gap-2 px-6 text-sm font-semibold text-white">
          <Icon name="shield" className="h-4 w-4 text-brand-500" /> {publicEnv.brandName} Admin
        </div>
        {nav}
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-slate-900 px-4 text-white lg:hidden">
        <span className="text-sm font-semibold">{publicEnv.brandName} Admin</span>
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="p-2">
          <Icon name={open ? "x" : "menu"} />
        </button>
      </header>
      {open && <div className="fixed inset-x-0 top-14 z-20 flex flex-col bg-slate-900 lg:hidden">{nav}</div>}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
