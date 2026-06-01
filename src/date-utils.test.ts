import { describe, expect, it } from "vitest";
import { addCalendarDays, isoFromLocalDate, localDateFromIso, yearFromIsoDate } from "./date-utils";

describe("local calendar date helpers", () => {
  it("does not shift a chosen start date to the previous UTC day", () => {
    expect(addCalendarDays("2026-06-02", 0)).toBe("2026-06-02");
    expect(addCalendarDays("2026-06-02", 1)).toBe("2026-06-03");
  });

  it("formats local Date objects without UTC conversion", () => {
    expect(isoFromLocalDate(new Date(2026, 5, 2))).toBe("2026-06-02");
  });

  it("parses ISO dates as local calendar dates", () => {
    const date = localDateFromIso("2026-06-02");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(2);
  });

  it("reads the year directly from the ISO date", () => {
    expect(yearFromIsoDate("2026-06-02")).toBe("2026");
  });
});
