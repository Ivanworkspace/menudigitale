export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">📡</p>
      <h1 className="mt-4 text-2xl font-bold">Connessione assente</h1>
      <p className="mt-2 max-w-sm text-slate-600">
        Controlla il Wi-Fi o la rete dati. Gli ordini già inseriti verranno inviati automaticamente appena torna la connessione.
      </p>
      <p className="mt-1 text-sm text-slate-500">You are offline.</p>
    </main>
  );
}
