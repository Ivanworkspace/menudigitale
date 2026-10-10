import { publicEnv } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-slate-500">
          {publicEnv.brandName} · Amministrazione
        </p>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">{children}</div>
      </div>
    </main>
  );
}
