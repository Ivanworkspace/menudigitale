/**
 * Minimal ESC/POS ticket builder for 58/80 mm thermal printers.
 * Output is a byte array to send raw over TCP 9100 (or via PrintNode).
 */
const ESC = 0x1b;
const GS = 0x1d;

/** Transliterates characters thermal printers usually can't print (CP437/858). */
export function toPrintable(text: string): string {
  return text
    .replace(/€/g, "EUR")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export class EscPos {
  private bytes: number[] = [];
  constructor(private width = 42) {
    this.raw(ESC, 0x40); // init
  }
  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  text(s: string) {
    for (const ch of toPrintable(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") {
    return this.text(s).raw(0x0a);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  align(a: "left" | "center" | "right") {
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  /** Character size multiplier 1–4 (width & height). */
  size(n: 1 | 2 | 3 | 4) {
    const v = ((n - 1) << 4) | (n - 1);
    return this.raw(GS, 0x21, v);
  }
  hr(ch = "-") {
    return this.line(ch.repeat(this.width));
  }
  /** Left and right text on the same line. */
  pair(left: string, right: string) {
    const l = toPrintable(left);
    const r = toPrintable(right);
    const space = Math.max(1, this.width - l.length - r.length);
    return this.line(l.slice(0, this.width - r.length - 1) + " ".repeat(space) + r);
  }
  feed(n = 3) {
    return this.raw(ESC, 0x64, n);
  }
  cut() {
    return this.raw(GS, 0x56, 0x42, 0x00);
  }
  beep() {
    return this.raw(ESC, 0x42, 0x03, 0x02);
  }
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export type KitchenTicketInput = {
  venue: string;
  department: string;
  table: string;
  waiter: string | null;
  time: string;
  urgent: boolean;
  round: number | null;
  notes: string;
  items: { qty: number; name: string; modifiers: string[]; notes: string; course: number; cancelled?: boolean }[];
  reprint?: boolean;
};

export function kitchenTicket(t: KitchenTicketInput, width = 42): Uint8Array {
  const p = new EscPos(width);
  if (t.urgent) p.beep();
  p.align("center").bold(true).size(2).line(t.table.startsWith("Asporto ") ? t.table.toUpperCase() : `TAVOLO ${t.table}`).size(1).line(t.department.toUpperCase()).bold(false);
  if (t.urgent) p.bold(true).line("*** URGENTE ***").bold(false);
  if (t.reprint) p.line("(RISTAMPA)");
  p.line(`${t.time}${t.waiter ? ` - ${t.waiter}` : ""}${t.round ? ` - giro ${t.round}` : ""}`).align("left").hr();
  let course = 0;
  for (const i of t.items) {
    if (i.course !== course) {
      course = i.course;
      if (t.items.some((x) => x.course > 1)) p.bold(true).line(`-- USCITA ${course} --`).bold(false);
    }
    p.size(2).bold(true).line(`${i.cancelled ? "ANNULLA " : ""}${i.qty} x ${i.name}`).size(1).bold(false);
    for (const m of i.modifiers) p.line(`   + ${m}`);
    if (i.notes) p.line(`   >> ${i.notes}`);
  }
  if (t.notes) p.hr().bold(true).line(`NOTE: ${t.notes}`).bold(false);
  return p.hr().align("center").line(t.venue).feed(4).cut().build();
}
