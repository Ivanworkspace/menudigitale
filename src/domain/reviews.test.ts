import { describe, expect, it } from "vitest";
import { contactStrings, inCooldown, isValidReviewUrl, renderReviewMessage } from "./reviews";

describe("reviews", () => {
  it("renders the message with the first name and the link", () => {
    expect(renderReviewMessage("Ciao {nome}, grazie da {locale}: {link}", { name: "Mario Rossi", venue: "Da Mario", link: "https://x.y/r" })).toBe(
      "Ciao Mario, grazie da Da Mario: https://x.y/r",
    );
    expect(renderReviewMessage("Grazie!", { name: "A", venue: "B", link: "https://x.y/r" })).toBe("Grazie!\nhttps://x.y/r");
  });

  it("normalizes contacts", () => {
    expect(contactStrings({ email: " Mario@Example.it ", phone: "+39 333 123 4567" })).toEqual(["e:mario@example.it", "p:3331234567"]);
    expect(contactStrings({ phone: "123" })).toEqual([]);
  });

  it("applies the cooldown", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    expect(inCooldown(["2026-09-01T10:00:00Z"], 90, now)).toBe(true);
    expect(inCooldown(["2026-06-01T10:00:00Z"], 90, now)).toBe(false);
    expect(inCooldown([], 90, now)).toBe(false);
  });

  it("validates review links", () => {
    expect(isValidReviewUrl("https://g.page/r/abc/review")).toBe(true);
    expect(isValidReviewUrl("http://x.it")).toBe(false);
    expect(isValidReviewUrl("boh")).toBe(false);
  });
});
