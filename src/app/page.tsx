import { publicEnv } from "@/lib/env";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{publicEnv.brandName}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">
        Il menu digitale che lavora con la tua sala e la tua cucina.
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Menu con QR, ordini al tavolo, all you can eat, comande in cucina, conti e statistiche. Tutto in un&apos;unica
        piattaforma, pensata per ristoranti, pizzerie, bar e pub.
      </p>
    </main>
  );
}
