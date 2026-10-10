/* eslint-disable @next/next/no-img-element */
import QRCode from "qrcode";
import { requireStaffPage } from "@/server/auth/require-staff";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { publicEnv } from "@/lib/env";

export const metadata = { title: "QR del menu" };

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "menu.edit" });
  const url = `${publicEnv.appUrl}/m/${ctx.tenant.slug}`;
  const preview = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  const file = `${ctx.basePath}/menu/qr/file`;
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="flex flex-col items-center p-6">
        <img src={preview} alt="QR del menu" className="h-64 w-64" />
        <div className="mt-4 flex w-full items-center gap-2">
          <code className="flex-1 truncate rounded bg-slate-50 px-2 py-1.5 text-xs ring-1 ring-slate-200">{url}</code>
          <CopyButton value={url} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Scarica e stampa" description="QR generale del menu (solo consultazione). I QR dei tavoli per ordinare sono nella sezione Sala." />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <a className={buttonClass("secondary")} href={`${file}?format=png`}>Immagine PNG</a>
          <a className={buttonClass("secondary")} href={`${file}?format=svg`}>Vettoriale SVG (tipografia)</a>
          <a className={buttonClass("secondary")} href={`${file}?format=pdf&layout=poster`}>PDF locandina A5</a>
          <a className={buttonClass("secondary")} href={`${file}?format=pdf&layout=tent`}>PDF segnaposto da piegare</a>
          <a className={buttonClass("secondary")} href={`${file}?format=pdf&layout=sticker`}>PDF adesivi (12 per foglio A4)</a>
        </div>
      </Card>
    </div>
  );
}
