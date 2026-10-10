import { describe, it, expect } from "vitest";
import { base32Decode, base32Encode, hotp, verifyTotp, generateTotpSecret } from "./totp";

// RFC 6238 test secret "12345678901234567890" (SHA-1)
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("base32 round-trips", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 7]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });
  it("matches RFC 6238 vectors (6 digits)", () => {
    // T = 59s -> 94287082 ; T = 1111111109 -> 07081804 ; T = 1234567890 -> 89005924
    expect(hotp(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
  });
  it("verifies with ±1 window and blocks replay", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const code = hotp(secret, Math.floor(now / 30_000));
    const step = verifyTotp(secret, code, now);
    expect(step).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(secret, code, now + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, code, now, step!)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
});
