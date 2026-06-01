import { describe, expect, it } from "vitest";
import { bestValue, dailyDiurnalVariation, summarizeDiurnalVariation } from "./metrics";

const entry = (date: string, morning: string[], evening: string[]) => ({
  date,
  morning: { before: morning },
  evening: { before: evening }
});

describe("bestValue", () => {
  it("returns the highest positive numeric value", () => {
    expect(bestValue(["390", "410", ""])).toBe(410);
  });

  it("ignores empty, non-numeric and non-positive values", () => {
    expect(bestValue(["", "abc", "0", "-12"])).toBeNull();
  });
});

describe("dailyDiurnalVariation", () => {
  it("computes variation from the best before-med morning/evening blows", () => {
    expect(dailyDiurnalVariation(entry("2026-05-31", ["400", "420"], ["390", "380"]))).toBeCloseTo(
      ((420 - 390) / 420) * 100
    );
  });

  it("returns null when either session is missing", () => {
    expect(dailyDiurnalVariation(entry("2026-05-31", ["400"], [""]))).toBeNull();
  });
});

describe("summarizeDiurnalVariation", () => {
  it("returns daily values plus period mean and max", () => {
    const summary = summarizeDiurnalVariation([
      entry("2026-05-31", ["400"], ["360"]),
      entry("2026-06-01", ["420"], ["420"]),
      entry("2026-06-02", [""], ["390"])
    ]);

    expect(summary.daily).toHaveLength(3);
    expect(summary.daily[0].percent).toBeCloseTo(10);
    expect(summary.daily[1].percent).toBeCloseTo(0);
    expect(summary.daily[2].percent).toBeNull();
    expect(summary.meanPercent).toBeCloseTo(5);
    expect(summary.maxPercent).toBeCloseTo(10);
  });

  it("uses null summary values when no complete days exist", () => {
    const summary = summarizeDiurnalVariation([entry("2026-05-31", [""], [""])]);
    expect(summary.meanPercent).toBeNull();
    expect(summary.maxPercent).toBeNull();
  });
});
