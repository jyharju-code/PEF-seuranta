import { describe, expect, it } from "vitest";
import {
  bestValue,
  bronchodilatorResponseForSession,
  dailyDiurnalVariation,
  summarizeBronchodilatorResponses,
  summarizeDiurnalVariation
} from "./metrics";

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

describe("bronchodilatorResponseForSession", () => {
  it("computes percent response and absolute delta", () => {
    const response = bronchodilatorResponseForSession({
      before: ["390", "400"],
      after: ["455", "460"]
    });

    expect(response.delta).toBe(60);
    expect(response.percent).toBeCloseTo(15);
    expect(response.meetsThreshold).toBe(true);
  });

  it("requires both 15 percent and 60 l/min for the marker", () => {
    expect(
      bronchodilatorResponseForSession({ before: ["300"], after: ["350"] }).meetsThreshold
    ).toBe(false);
    expect(
      bronchodilatorResponseForSession({ before: ["500"], after: ["560"] }).meetsThreshold
    ).toBe(false);
  });

  it("returns null values when before or after is missing", () => {
    expect(bronchodilatorResponseForSession({ before: ["400"], after: [""] })).toEqual({
      percent: null,
      delta: null,
      meetsThreshold: false
    });
  });
});

describe("summarizeBronchodilatorResponses", () => {
  it("summarizes all morning and evening sessions", () => {
    const summary = summarizeBronchodilatorResponses([
      {
        ...entry("2026-05-31", ["400"], ["380"]),
        morning: { before: ["400"], after: ["460"] },
        evening: { before: ["380"], after: ["390"] }
      }
    ]);

    expect(summary.sessions).toHaveLength(2);
    expect(summary.significantCount).toBe(1);
    expect(summary.maxDelta).toBe(60);
    expect(summary.maxPercent).toBeCloseTo(15);
  });
});
