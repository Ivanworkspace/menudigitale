"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { PinPad } from "@/components/ui/pin-pad";

export function LoginScreen({
  title,
  subtitle,
  logoUrl,
  onSubmit,
  footer,
}: {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  onSubmit: (pin: string) => Promise<string | null>;
  footer?: { href: string; label: string };
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="mb-3 h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200" />
        ) : null}
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <PinPad onSubmit={onSubmit} />
      {footer && (
        <Link href={footer.href} className="mt-8 text-sm font-medium text-slate-600 hover:text-slate-900">
          {footer.label}
        </Link>
      )}
    </main>
  );
}
