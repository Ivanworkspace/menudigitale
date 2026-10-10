import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenantBySlug } from "@/server/tenancy/resolve";

export const metadata = { title: "Privacy" };

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href={`/m/${slug}`} className="text-sm text-slate-600 hover:underline">← {tenant.displayName}</Link>
      <h1 className="mt-4 text-2xl font-bold">Informativa privacy</h1>
      <div className="mt-4 whitespace-pre-line text-slate-700">{tenant.settings.privacyText || "Informativa non ancora disponibile."}</div>
      {tenant.settings.cookieText && (
        <>
          <h2 className="mt-8 text-xl font-bold">Cookie</h2>
          <div className="mt-3 whitespace-pre-line text-slate-700">{tenant.settings.cookieText}</div>
        </>
      )}
    </main>
  );
}
