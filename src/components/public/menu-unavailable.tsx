export function MenuUnavailable({ name }: { name: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
      <p className="mt-2 text-slate-600">Il menu non è al momento disponibile.</p>
      <p className="text-sm text-slate-500">The menu is currently unavailable.</p>
    </main>
  );
}
