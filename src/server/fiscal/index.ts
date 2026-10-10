/**
 * Integration point with Italian telematic cash registers (Registratore
 * Telematico, RT). The software produces a PRE-RECEIPT only: the fiscal
 * document ("documento commerciale") must be printed by the RT.
 *
 * Planned adapters:
 *  - Epson FP-81II RT / FP-90III RT via ePOS-Print Fiscal XML ("fpmate")
 *    POST http://<rt-ip>/cgi-bin/fpmate.cgi  (see buildEpsonFiscalXml)
 *  - Custom (Q3X, K3, …) via XON/XOFF protocol over TCP
 * The RT lives in the venue's LAN, so the command is relayed by the local
 * print server (same mechanism as kitchen tickets).
 */
import type { BillLine, Payment } from "@/domain/billing";

export interface FiscalRegister {
  /** Returns the RT document number (Z + progressive) on success. */
  printReceipt(input: { lines: BillLine[]; discountCents: number; payments: Pick<Payment, "method" | "amountCents">[] }): Promise<{ documentNumber: string }>;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Epson fiscal receipt XML (department 1 = 10%, 2 = 22%, 3 = 4%, 4 = 5% — to be mapped per RT setup). */
export function buildEpsonFiscalXml(input: Parameters<FiscalRegister["printReceipt"]>[0], vatDepartments: Record<number, number> = { 1000: 1, 2200: 2, 400: 3, 500: 4 }): string {
  const items = input.lines
    .map(
      (l) =>
        `<printRecItem operator="1" description="${esc(l.name.slice(0, 38))}" quantity="${l.qty}" unitPrice="${money(l.unitPriceCents)}" department="${vatDepartments[l.vatRateBp] ?? 1}" justification="1" />`,
    )
    .join("");
  const discount = input.discountCents > 0 ? `<printRecSubtotalAdjustment operator="1" adjustmentType="1" description="SCONTO" amount="${money(input.discountCents)}" justification="1" />` : "";
  const payments = input.payments
    .map((p) => `<printRecTotal operator="1" description="${p.method === "cash" ? "CONTANTI" : "ELETTRONICO"}" payment="${money(p.amountCents)}" paymentType="${p.method === "cash" ? 0 : 2}" index="${p.method === "cash" ? 0 : 1}" justification="1" />`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><printerFiscalReceipt><beginFiscalReceipt operator="1" />${items}${discount}${payments}<endFiscalReceipt operator="1" /></printerFiscalReceipt></s:Body></s:Envelope>`;
}
