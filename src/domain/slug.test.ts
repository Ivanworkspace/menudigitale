import { describe, it, expect } from "vitest";
import { slugify, validateSlug } from "./slug";

describe("slug", () => {
  it("slugifies Italian names", () => {
    expect(slugify("Pizzeria Da Mario")).toBe("pizzeria-da-mario");
    expect(slugify("L'Osteria dell'Àngolo — Caffè")).toBe("losteria-dellangolo-caffe");
    expect(slugify("  Sushi   & Co. ")).toBe("sushi-co");
  });
  it("validates", () => {
    expect(validateSlug("pizzeria-da-mario")).toBeNull();
    expect(validateSlug("ab")).not.toBeNull();
    expect(validateSlug("-abc")).not.toBeNull();
    expect(validateSlug("Abc")).not.toBeNull();
    expect(validateSlug("admin")).not.toBeNull();
  });
});
