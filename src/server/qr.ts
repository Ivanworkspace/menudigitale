import "server-only";
import QRCode from "qrcode";
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { adminBucket } from "@/server/firebase";

export type QrItem = { title: string; subtitle?: string; url: string; code?: string };
export type QrLayout = "tent" | "sticker" | "poster";

const MM = 72 / 25.4;

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function qrPng(url: string, size = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png", width: size, margin: 1, errorCorrectionLevel: "M" });
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

/** Loads a Storage image and converts it to PNG for embedding in PDFs. */
async function loadLogoPng(path: string | null): Promise<Buffer | null> {
  if (!path) return null;
  try {
    const [buf] = await adminBucket().file(path).download();
    return await sharp(buf).resize({ width: 300, height: 300, fit: "inside" }).png().toBuffer();
  } catch {
    return null;
  }
}

function centerText(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, color = rgb(0.1, 0.1, 0.12)) {
  let s = text;
  while (font.widthOfTextAtSize(s, size) > 160 * MM && s.length > 3) s = s.slice(0, -2);
  if (s !== text) s = s.trimEnd() + "…";
  page.drawText(s, { x: cx - font.widthOfTextAtSize(s, size) / 2, y, size, font, color });
}

/**
 * Printable QR PDF:
 *  - tent:    A4 portrait, 2 cards per page (fold in half → table tent)
 *  - sticker: A4, 3×4 grid of 60 mm stickers
 *  - poster:  one A5-sized QR per page (counter, window)
 */
export async function qrPdf(opts: {
  items: QrItem[];
  layout: QrLayout;
  venueName: string;
  primaryColor: string;
  logoPath: string | null;
  footer?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`QR · ${opts.venueName}`);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const color = hexToRgb(opts.primaryColor);
  const logoBuf = await loadLogoPng(opts.logoPath);
  const logo = logoBuf ? await pdf.embedPng(logoBuf) : null;
  const qrImages = await Promise.all(opts.items.map(async (i) => pdf.embedPng(await qrPng(i.url, 800))));
  const A4: [number, number] = [210 * MM, 297 * MM];

  const drawCard = (page: PDFPage, i: number, x: number, y: number, w: number, h: number, scale = 1) => {
    const item = opts.items[i];
    const cx = x + w / 2;
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.85, 0.85, 0.88), borderWidth: 0.5 });
    page.drawRectangle({ x, y: y + h - 6 * MM * scale, width: w, height: 6 * MM * scale, color });
    let top = y + h - 10 * MM * scale;
    if (logo) {
      const lh = 14 * MM * scale;
      const lw = (logo.width / logo.height) * lh;
      page.drawImage(logo, { x: cx - lw / 2, y: top - lh, width: lw, height: lh });
      top -= lh + 3 * MM * scale;
    }
    centerText(page, item.title, bold, 16 * scale, cx, top - 16 * scale);
    top -= 16 * scale + 3 * MM * scale;
    const qs = Math.min(w - 16 * MM * scale, top - y - 22 * MM * scale);
    page.drawImage(qrImages[i], { x: cx - qs / 2, y: top - qs, width: qs, height: qs });
    top -= qs + 5 * MM * scale;
    centerText(page, item.subtitle ?? "Inquadra per il menu", regular, 10 * scale, cx, top - 10 * scale, rgb(0.3, 0.3, 0.35));
    if (item.code) centerText(page, `Codice tavolo: ${item.code}`, bold, 10 * scale, cx, top - 24 * scale);
    if (opts.footer) centerText(page, opts.footer, regular, 7 * scale, cx, y + 4 * MM * scale, rgb(0.55, 0.55, 0.6));
  };

  if (opts.layout === "sticker") {
    const cols = 3, rows = 4, w = 60 * MM, h = 66 * MM;
    const mx = (A4[0] - cols * w) / 2, my = (A4[1] - rows * h) / 2;
    for (let i = 0; i < opts.items.length; i++) {
      if (i % (cols * rows) === 0) pdf.addPage(A4);
      const page = pdf.getPages()[pdf.getPageCount() - 1];
      const k = i % (cols * rows);
      drawCard(page, i, mx + (k % cols) * w, A4[1] - my - (Math.floor(k / cols) + 1) * h, w, h, 0.62);
    }
  } else if (opts.layout === "tent") {
    // Two halves: top is upside-down so the card reads correctly when folded.
    for (let i = 0; i < opts.items.length; i++) {
      const page = pdf.addPage(A4);
      const h = A4[1] / 2;
      drawCard(page, i, 25 * MM, 10 * MM, A4[0] - 50 * MM, h - 20 * MM);
      // Mirrored top half: draw on a temporary page, then embed rotated.
      const tmp = await PDFDocument.create();
      const tpage = tmp.addPage([A4[0] - 50 * MM, h - 20 * MM]);
      const tBold = await tmp.embedFont(StandardFonts.HelveticaBold);
      const tQr = await tmp.embedPng(await qrPng(opts.items[i].url, 800));
      const qs = Math.min(tpage.getWidth() - 30 * MM, tpage.getHeight() - 40 * MM);
      tpage.drawRectangle({ x: 0, y: tpage.getHeight() - 6 * MM, width: tpage.getWidth(), height: 6 * MM, color });
      tpage.drawText(opts.items[i].title, {
        x: tpage.getWidth() / 2 - tBold.widthOfTextAtSize(opts.items[i].title, 16) / 2,
        y: tpage.getHeight() - 20 * MM,
        size: 16,
        font: tBold,
      });
      tpage.drawImage(tQr, { x: tpage.getWidth() / 2 - qs / 2, y: 12 * MM, width: qs, height: qs });
      const [embedded] = await pdf.embedPdf(await tmp.save());
      page.drawPage(embedded, { x: A4[0] - 25 * MM, y: A4[1] - 10 * MM, rotate: degrees(180) });
      page.drawLine({ start: { x: 0, y: h }, end: { x: A4[0], y: h }, dashArray: [4, 4], thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    }
  } else {
    const A5: [number, number] = [148 * MM, 210 * MM];
    for (let i = 0; i < opts.items.length; i++) {
      const page = pdf.addPage(A5);
      drawCard(page, i, 10 * MM, 10 * MM, A5[0] - 20 * MM, A5[1] - 20 * MM);
    }
  }
  return pdf.save();
}
