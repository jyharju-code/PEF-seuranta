export type MetricSession = {
  before: string[];
  after?: string[];
};

export type MetricEntry = {
  date: string;
  morning: MetricSession;
  evening: MetricSession;
};

export type DailyDiurnalVariation = {
  date: string;
  percent: number | null;
};

export type DiurnalVariationSummary = {
  daily: DailyDiurnalVariation[];
  meanPercent: number | null;
  maxPercent: number | null;
};

function toNumbers(values: string[]) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function bestValue(values: string[]) {
  const numbers = toNumbers(values);
  return numbers.length ? Math.max(...numbers) : null;
}

export function dailyDiurnalVariation(entry: MetricEntry) {
  const morningBest = bestValue(entry.morning.before);
  const eveningBest = bestValue(entry.evening.before);
  if (morningBest === null || eveningBest === null) return null;

  const highestBest = Math.max(morningBest, eveningBest);
  const lowestBest = Math.min(morningBest, eveningBest);
  if (highestBest <= 0) return null;

  return ((highestBest - lowestBest) / highestBest) * 100;
}

export function summarizeDiurnalVariation(entries: MetricEntry[]): DiurnalVariationSummary {
  const daily = entries.map((entry) => ({ date: entry.date, percent: dailyDiurnalVariation(entry) }));
  const values = daily.map((entry) => entry.percent).filter((value): value is number => value !== null);

  return {
    daily,
    meanPercent: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    maxPercent: values.length ? Math.max(...values) : null
  };
}
