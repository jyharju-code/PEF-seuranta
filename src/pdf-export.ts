import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PdfSessionKey = "morning" | "evening";
export type PdfBlowValues = [string, string, string];

export interface PdfBlowSession {
  time: string;
  afterTime: string;
  before: PdfBlowValues;
  after: PdfBlowValues;
  symptomTime: string;
  symptoms: string;
}

export interface PdfDayEntry {
  date: string;
  morning: PdfBlowSession;
  evening: PdfBlowSession;
}

export interface PdfAppState {
  settings: {
    patientName: string;
    patientId: string;
    hospital: boolean;
    referenceValue?: string;
    weeks: 1 | 2;
    startDate: string;
    year: string;
  };
  entries: PdfDayEntry[];
}

interface GraphPoint {
  x: number;
  y: number;
}

export async function createPefPdfBytes(state: PdfAppState, template: ArrayBuffer) {
  const source = await PDFDocument.load(template);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [1]);
  pdf.addPage(page);
  setPdfMetadata(pdf, state);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  const topY = (top: number) => height - top;
  const blue = rgb(0.05, 0.18, 0.38);

  const patient = [state.settings.patientName, state.settings.patientId].filter(Boolean).join(", ");
  // Header baselines are tuned to the printed fill-in rules on the HUS/HYKS sheet.
  drawText(page, patient, 455, topY(101), 9, regular, blue);
  drawText(page, state.settings.year, 280, topY(101), 9, regular, blue);
  // The template has “☐ Iho-ja allergiasairaala ☐”; the left checkbox belongs to the label.
  // Render/text-position check: left box bbox x≈249.6–257.8, right box x≈356.0–364.1.
  if (state.settings.hospital) drawCross(page, 253.5, topY(82.8), 3.2, 0.55, blue);
  drawCross(page, state.settings.weeks === 1 ? 147.3 : 193.8, topY(97.3), 3.2, 0.55, blue);

  const xLeft = 117.5;
  const pairWidth = 47.0;
  const subWidth = pairWidth / 2;
  const dateTop = 118.5;
  const timeTop = 142.5;
  const beforeTops = [154, 166, 178];
  const afterTops = [190, 202, 214];
  const symptomTimeTop = 226;
  const symptomTops = [238, 250, 262];

  state.entries.forEach((entry, dayIndex) => {
    const dateX = xLeft + pairWidth * dayIndex + pairWidth / 2;
    drawCentered(page, formatPdfDate(entry.date), dateX, topY(dateTop), 5.8, regular, blue);

    (["morning", "evening"] as PdfSessionKey[]).forEach((sessionKey, sessionIndex) => {
      const session = entry[sessionKey];
      const x = xLeft + pairWidth * dayIndex + subWidth * (sessionIndex + 0.5);
      drawCentered(page, session.time, x, topY(timeTop), 6.2, regular, blue);
      session.before.forEach((value, index) => {
        drawCentered(page, value, x, topY(beforeTops[index]), 6.6, regular, blue);
      });
      session.after.forEach((value, index) => {
        drawCentered(page, value, x, topY(afterTops[index]), 6.6, regular, blue);
      });
      drawCentered(page, session.afterTime, x, topY(symptomTimeTop), 6.2, regular, blue);
      parseSymptomValues(session.symptoms).slice(0, 3).forEach((value, index) => {
        drawCentered(page, String(value), x, topY(symptomTops[index]), 6.2, regular, blue);
      });
    });
  });

  drawGraph(page, state, topY, regular, blue);

  return pdf.save();
}

function setPdfMetadata(pdf: PDFDocument, state: PdfAppState) {
  const periodEnd = state.entries.at(-1)?.date ?? state.settings.startDate;
  pdf.setTitle("PEF-taulukko");
  pdf.setSubject(`${state.settings.startDate}–${periodEnd}`);
  if (state.settings.patientName.trim()) pdf.setAuthor(state.settings.patientName.trim());
  pdf.setCreator("PEF-seuranta / puhallus.com");
  pdf.setCreationDate(new Date());
}

function toNumbers(values: string[]) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function bestValue(values: string[]) {
  const numbers = toNumbers(values);
  return numbers.length ? Math.max(...numbers) : null;
}

function parseReferenceValue(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function drawGraph(
  page: import("pdf-lib").PDFPage,
  state: PdfAppState,
  topY: (top: number) => number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  const values = state.entries.flatMap((entry) =>
    (["morning", "evening"] as PdfSessionKey[]).flatMap((sessionKey) => {
      const session = entry[sessionKey];
      return [
        bestValue(session.before),
        bestValue(session.after),
        ...parseSymptomValues(session.symptoms)
      ].filter((value): value is number => value !== null);
    })
  );
  const referenceValue = parseReferenceValue(state.settings.referenceValue);
  if (referenceValue !== null) values.push(referenceValue);

  if (!values.length) return;

  const { minScale, maxScale } = chooseGraphScale(values);

  const xLeft = 117.5;
  const pairWidth = 47.0;
  const subWidth = pairWidth / 2;
  const graphTop = 268.2;
  const graphBottom = 508.4;
  const graphHeight = graphBottom - graphTop;
  const graphTopY = topY(graphTop);
  const graphBottomY = topY(graphBottom);
  const yForValue = (value: number) => {
    const clamped = Math.min(maxScale, Math.max(minScale, value));
    const ratio = (clamped - minScale) / (maxScale - minScale);
    return topY(graphBottom - ratio * graphHeight);
  };

  const beforeSeries: Array<GraphPoint | null> = [];
  const afterSeries: Array<GraphPoint | null> = [];

  state.entries.forEach((entry, dayIndex) => {
    (["morning", "evening"] as PdfSessionKey[]).forEach((sessionKey, sessionIndex) => {
      const session = entry[sessionKey];
      const x = xLeft + pairWidth * dayIndex + subWidth * (sessionIndex + 0.5);
      const before = bestValue(session.before);
      const after = bestValue(session.after);
      beforeSeries.push(before === null ? null : { x, y: yForValue(before) });
      afterSeries.push(after === null ? null : { x, y: yForValue(after) });
    });
  });

  // Trend lines are drawn before markers so crisp vector symbols remain legible.
  if (referenceValue !== null) {
    page.drawLine({
      start: { x: xLeft, y: yForValue(referenceValue) },
      end: { x: xLeft + pairWidth * state.entries.length, y: yForValue(referenceValue) },
      thickness: 0.45,
      color: rgb(0.72, 0.76, 0.82)
    });
  }
  drawPolylineGaps(page, beforeSeries, color, 0.6);
  drawPolylineGaps(page, afterSeries, color, 0.45, 0.62, [2.5, 2.2]);

  const labelSize = 6.2;
  const labelBaselineOffset = labelSize * 0.34;
  for (let value = minScale; value <= maxScale; value += 50) {
    const y = yForValue(value);
    // Avoid the template's printed “l/min.” label at the top and legend row at the bottom.
    if (y > graphTopY - 7 || y < graphBottomY + 9) continue;
    drawRightWithKnockout(page, String(value), 108.8, y - labelBaselineOffset, labelSize, font, color);
  }

  state.entries.forEach((entry, dayIndex) => {
    (["morning", "evening"] as PdfSessionKey[]).forEach((sessionKey, sessionIndex) => {
      const session = entry[sessionKey];
      const subLeft = xLeft + pairWidth * dayIndex + subWidth * sessionIndex;
      const subRight = subLeft + subWidth;
      const x = xLeft + pairWidth * dayIndex + subWidth * (sessionIndex + 0.5);
      const before = bestValue(session.before);
      const after = bestValue(session.after);
      if (before !== null) drawXMarker(page, x, yForValue(before), color);
      if (after !== null) drawCircleMarker(page, x, yForValue(after), color);
      const symptomValues = parseSymptomValues(session.symptoms).slice(0, 3);
      symptomValues.forEach((value, symptomIndex) => {
        const point = symptomTrianglePoint(
          x,
          yForValue(value),
          symptomIndex,
          symptomValues.length,
          subLeft,
          subRight
        );
        drawTriangle(page, point.x, point.y, color);
      });
    });
  });
}

function symptomTrianglePoint(
  centerX: number,
  y: number,
  index: number,
  count: number,
  subLeft: number,
  subRight: number
) {
  const triangleWidth = 5.4;
  const margin = 1.0;
  const minX = subLeft + margin;
  const maxX = subRight - triangleWidth - margin;
  const preferredX = centerX + 5.7 + index * 4.0;
  const x = Math.min(maxX, Math.max(minX, preferredX));
  const isConstrained = x !== preferredX;
  return {
    x,
    y: isConstrained ? y + (index - (count - 1) / 2) * 4.0 : y
  };
}

function drawPolylineGaps(
  page: import("pdf-lib").PDFPage,
  points: Array<GraphPoint | null>,
  color: ReturnType<typeof rgb>,
  thickness: number,
  opacity = 1,
  dashArray?: number[]
) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    page.drawLine({
      start: previous,
      end: current,
      thickness,
      color,
      opacity,
      dashArray
    });
  }
}

function chooseGraphScale(values: number[]) {
  const minData = Math.min(...values);
  const maxData = Math.max(...values);
  let minScale = Math.max(0, Math.floor(minData / 100) * 100);
  let maxScale = Math.ceil(maxData / 100) * 100;

  if (maxScale === minScale) {
    minScale = Math.max(0, minScale - 100);
    maxScale = minScale + 200;
  }

  return { minScale, maxScale };
}

function drawText(
  page: import("pdf-lib").PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color });
}

function drawCentered(
  page: import("pdf-lib").PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  if (!text) return;
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, x - width / 2, y, size, font, color);
}

function drawRight(
  page: import("pdf-lib").PDFPage,
  text: string,
  rightX: number,
  y: number,
  size: number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  const width = font.widthOfTextAtSize(text, size);
  drawText(page, text, rightX - width, y, size, font, color);
}

function drawRightWithKnockout(
  page: import("pdf-lib").PDFPage,
  text: string,
  rightX: number,
  y: number,
  size: number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawRectangle({
    x: rightX - width - 1.2,
    y: y - 1.2,
    width: width + 2.4,
    height: size + 1.6,
    color: rgb(1, 1, 1)
  });
  drawText(page, text, rightX - width, y, size, font, color);
}

function drawCross(
  page: import("pdf-lib").PDFPage,
  x: number,
  y: number,
  halfSize: number,
  thickness: number,
  color: ReturnType<typeof rgb>
) {
  page.drawLine({
    start: { x: x - halfSize, y: y - halfSize },
    end: { x: x + halfSize, y: y + halfSize },
    thickness,
    color
  });
  page.drawLine({
    start: { x: x - halfSize, y: y + halfSize },
    end: { x: x + halfSize, y: y - halfSize },
    thickness,
    color
  });
}

function drawXMarker(page: import("pdf-lib").PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  drawCross(page, x, y, 2.2, 0.72, color);
}

function drawCircleMarker(page: import("pdf-lib").PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawCircle({ x, y, size: 2.15, borderColor: color, borderWidth: 0.72 });
}

function drawTriangle(page: import("pdf-lib").PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawSvgPath("M 0 -2.7 L 0 2.7 L 5.4 0 Z", { x, y, color });
}

function parseSymptomValues(value: string) {
  return value
    .split(/[,\s;]+/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function formatPdfDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}
