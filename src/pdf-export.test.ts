import { describe, expect, it } from "vitest";
import { bestValue, chooseGraphScale, parseSymptomValues } from "./pdf-export";

describe("PDF helper bestValue", () => {
  it("returns null for empty or non-numeric input", () => {
    expect(bestValue(["", "abc", "0"])).toBeNull();
  });

  it("uses the highest available value from partial inputs", () => {
    expect(bestValue(["", "390", "410"])).toBe(410);
  });

  it("keeps positive out-of-range values for export compatibility", () => {
    expect(bestValue(["901", "450", "49"])).toBe(901);
  });
});

describe("chooseGraphScale", () => {
  it("returns a safe default for empty values", () => {
    expect(chooseGraphScale([])).toEqual({ minScale: 0, maxScale: 100 });
  });

  it("rounds partial data down/up to 100 l/min boundaries", () => {
    expect(chooseGraphScale([345, 488])).toEqual({ minScale: 300, maxScale: 500 });
  });

  it("expands a flat series", () => {
    expect(chooseGraphScale([400, 400])).toEqual({ minScale: 300, maxScale: 500 });
  });

  it("handles out-of-range positive values without throwing", () => {
    expect(chooseGraphScale([49, 901])).toEqual({ minScale: 0, maxScale: 1000 });
  });
});

describe("parseSymptomValues", () => {
  it("parses comma, whitespace and semicolon separated values", () => {
    expect(parseSymptomValues("410, 420;430 440")).toEqual([410, 420, 430, 440]);
  });

  it("ignores empty, non-numeric and non-positive parts", () => {
    expect(parseSymptomValues("  , abc; 0 -10 360")).toEqual([360]);
  });

  it("keeps positive out-of-range values for export compatibility", () => {
    expect(parseSymptomValues("49 901")).toEqual([49, 901]);
  });
});
