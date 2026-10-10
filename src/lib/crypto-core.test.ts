import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptWithKey, encryptWithKey, generatePin, isWeakPin, randomToken } from "./crypto-core";

describe("crypto-core", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips encryption and detects tampering", () => {
    const enc = encryptWithKey("segreto", key);
    expect(decryptWithKey(enc, key)).toBe("segreto");
    const [iv, tag, ct] = enc.split(".");
    const tampered = [iv, tag, Buffer.from("x" + ct).toString("base64url")].join(".");
    expect(() => decryptWithKey(tampered, key)).toThrow();
    expect(() => decryptWithKey(enc, randomBytes(32).toString("base64"))).toThrow();
  });
  it("generates long unique tokens", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });
  it("never generates weak PINs", () => {
    for (let i = 0; i < 500; i++) {
      const pin = generatePin(6);
      expect(pin).toMatch(/^\d{6}$/);
      expect(isWeakPin(pin)).toBe(false);
    }
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("0000")).toBe(true);
    expect(isWeakPin("9876")).toBe(true);
  });
});
