import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import "./styles.css";

const BASE_URL = import.meta.env.BASE_URL;

type SessionKey = "morning" | "evening";
type BlowValues = [string, string, string];

interface BlowSession {
  time: string;
  afterTime: string;
  before: BlowValues;
  after: BlowValues;
  symptomTime: string;
  symptoms: string;
}

interface DayEntry {
  date: string;
  morning: BlowSession;
  evening: BlowSession;
}

interface Settings {
  patientName: string;
  patientId: string;
  hospital: boolean;
  weeks: 1 | 2;
  startDate: string;
  year: string;
  morningReminder: string;
  eveningReminder: string;
}

interface AppState {
  settings: Settings;
  entries: DayEntry[];
  activeIndex: number;
  activeSession: SessionKey;
  status: string;
}

const STORAGE_KEY = "pef-seuranta:v1";
const SESSION_LABELS: Record<SessionKey, string> = {
  morning: "Aamu",
  evening: "Ilta"
};

const emptySession = (): BlowSession => ({
  time: "",
  afterTime: "",
  before: ["", "", ""],
  after: ["", "", ""],
  symptomTime: "",
  symptoms: ""
});

const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultState = (): AppState => {
  const startDate = todayIso();
  const year = String(new Date(startDate).getFullYear());
  return {
    settings: {
      patientName: "",
      patientId: "",
      hospital: false,
      weeks: 2,
      startDate,
      year,
      morningReminder: "07:30",
      eveningReminder: "20:30"
    },
    entries: buildEntries(startDate, 14, []),
    activeIndex: 0,
    activeSession: "morning",
    status: "Tallennettu tähän laitteeseen"
  };
};

let state = loadState();
const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root missing");
}

const app: HTMLDivElement = appRoot;

render();
registerServiceWorker();
scheduleVisibleAppReminder();

function loadState(): AppState {
  const fallback = defaultState();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored) as Partial<AppState>;
    const settings = { ...fallback.settings, ...parsed.settings };
    const days = settings.weeks === 1 ? 7 : 14;
    return {
      ...fallback,
      ...parsed,
      settings,
      entries: buildEntries(settings.startDate, days, parsed.entries ?? []),
      activeIndex: Math.min(parsed.activeIndex ?? 0, days - 1),
      activeSession: parsed.activeSession ?? "morning"
    };
  } catch {
    return fallback;
  }
}

function saveState(status = "Tallennettu") {
  state.status = status;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildEntries(startDate: string, days: number, existing: DayEntry[]): DayEntry[] {
  const byDate = new Map(existing.map((entry) => [entry.date, entry]));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index);
    return byDate.get(date) ?? {
      date,
      morning: emptySession(),
      evening: emptySession()
    };
  });
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function render() {
  const activeDay = state.entries[state.activeIndex];
  const activeSession = activeDay[state.activeSession];
  const warnings = [
    qualityWarning(activeSession.before, "Ennen lääkettä"),
    qualityWarning(activeSession.after, "Lääkkeen jälkeen")
  ].filter(Boolean);

  app.innerHTML = `
    <header class="app-header">
      <div>
        <p class="eyebrow">PEF-seuranta</p>
        <h1>${formatLongDate(activeDay.date)} ${SESSION_LABELS[state.activeSession].toLowerCase()}</h1>
      </div>
      <div class="status">${escapeHtml(state.status)}</div>
    </header>

    <main>
      <section class="panel settings-panel" aria-label="Asetukset">
        <div class="section-heading">
          <h2>Seuranta</h2>
          <div class="segmented" role="group" aria-label="Seurantajakso">
            ${segmentButton("weeks", "1", "1 viikko", state.settings.weeks === 1)}
            ${segmentButton("weeks", "2", "2 viikkoa", state.settings.weeks === 2)}
          </div>
        </div>
        <div class="settings-grid">
          ${field("Potilaan nimi", "settings.patientName", state.settings.patientName, "text")}
          ${field("Henkilötunnus", "settings.patientId", state.settings.patientId, "text")}
          ${field("Aloituspäivä", "settings.startDate", state.settings.startDate, "date")}
          ${field("Vuosi", "settings.year", state.settings.year, "number")}
          ${field("Aamu", "settings.morningReminder", state.settings.morningReminder, "time")}
          ${field("Ilta", "settings.eveningReminder", state.settings.eveningReminder, "time")}
          <label class="check-row">
            <input type="checkbox" data-path="settings.hospital" ${state.settings.hospital ? "checked" : ""} />
            <span>Iho- ja allergiasairaala</span>
          </label>
        </div>
      </section>

      <nav class="day-strip" aria-label="Päivät">
        ${state.entries
          .map(
            (entry, index) => `
              <button class="day-pill ${index === state.activeIndex ? "is-active" : ""}" data-day="${index}">
                <span>${index + 1}</span>
                <small>${formatShortDate(entry.date)}</small>
              </button>
            `
          )
          .join("")}
      </nav>

      <section class="panel entry-panel" aria-label="Mittaukset">
        <div class="section-heading">
          <h2>Mittaus</h2>
          <div class="segmented" role="group" aria-label="Aamu tai ilta">
            ${sessionButton("morning")}
            ${sessionButton("evening")}
          </div>
        </div>

        <div class="measurement-grid">
          <div class="measurement-block">
            <label class="field small-field">
              <span>Klo</span>
              <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.time" value="${escapeAttr(activeSession.time)}" />
            </label>
            <div class="value-row" aria-label="Ennen avaavaa lääkettä">
              <span>Ennen</span>
              ${valueInputs("before", activeSession.before)}
            </div>
          </div>

          <div class="measurement-block">
            <label class="field small-field">
              <span>Klo</span>
              <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.afterTime" value="${escapeAttr(activeSession.afterTime)}" />
            </label>
            <div class="value-row" aria-label="Avaavan lääkkeen jälkeen">
              <span>Jälkeen</span>
              ${valueInputs("after", activeSession.after)}
            </div>
          </div>
        </div>

        ${
          warnings.length
            ? `<div class="warning-list">${warnings.map((warning) => `<p>${warning}</p>`).join("")}</div>`
            : `<div class="ok-line">Kahden parhaan puhalluksen ero on kunnossa, kun arvoja on vähintään kaksi.</div>`
        }

        <div class="symptom-row">
          <label class="field small-field">
            <span>Oire-klo</span>
            <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.symptomTime" value="${escapeAttr(activeSession.symptomTime)}" />
          </label>
          <label class="field wide-field">
            <span>Oirepuhallukset l/min</span>
            <input inputmode="numeric" data-path="entries.${state.activeIndex}.${state.activeSession}.symptoms" value="${escapeAttr(activeSession.symptoms)}" placeholder="esim. 420, 430" />
          </label>
        </div>
      </section>

      <section class="actions-band" aria-label="Vienti">
        <button class="primary-action" data-action="export-pdf">Vie täytetty PDF</button>
        <button data-action="export-calendar">Kalenterimuistutukset</button>
        <button data-action="enable-notifications">Salli appimuistutus</button>
      </section>

      <section class="overview" aria-label="Yhteenveto">
        <div class="section-heading">
          <h2>Yhteenveto</h2>
        </div>
        <div class="overview-table">
          <div class="overview-head">
            <span>Päivä</span><span>Aamu ennen</span><span>Aamu jälkeen</span><span>Ilta ennen</span><span>Ilta jälkeen</span>
          </div>
          ${state.entries.map(summaryRow).join("")}
        </div>
      </section>
    </main>
  `;

  app.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[data-path]").forEach((input) => {
    input.addEventListener("input", (event) => handleInput(event, false));
    input.addEventListener("change", (event) => handleInput(event, true));
  });

  app.querySelectorAll<HTMLButtonElement>("button[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeIndex = Number(button.dataset.day);
      saveState();
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("button[data-session]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSession = button.dataset.session as SessionKey;
      saveState();
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("button[data-segment='weeks']").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.weeks = button.dataset.value === "1" ? 1 : 2;
      state.entries = buildEntries(state.settings.startDate, state.settings.weeks === 1 ? 7 : 14, state.entries);
      state.activeIndex = Math.min(state.activeIndex, state.entries.length - 1);
      saveState("Jakso päivitetty");
      render();
    });
  });

  app.querySelector<HTMLButtonElement>("[data-action='export-pdf']")?.addEventListener("click", exportPdf);
  app.querySelector<HTMLButtonElement>("[data-action='export-calendar']")?.addEventListener("click", exportCalendar);
  app
    .querySelector<HTMLButtonElement>("[data-action='enable-notifications']")
    ?.addEventListener("click", enableNotifications);
}

function field(label: string, path: string, value: string, type: string) {
  return `
    <label class="field">
      <span>${label}</span>
      <input type="${type}" data-path="${path}" value="${escapeAttr(value)}" />
    </label>
  `;
}

function segmentButton(segment: string, value: string, label: string, active: boolean) {
  return `
    <button class="${active ? "is-active" : ""}" data-segment="${segment}" data-value="${value}">
      ${label}
    </button>
  `;
}

function sessionButton(session: SessionKey) {
  return `
    <button class="${state.activeSession === session ? "is-active" : ""}" data-session="${session}">
      ${SESSION_LABELS[session]}
    </button>
  `;
}

function valueInputs(kind: "before" | "after", values: BlowValues) {
  return values
    .map(
      (value, index) => `
        <label>
          <span>${index + 1}</span>
          <input inputmode="numeric" pattern="[0-9]*" data-path="entries.${state.activeIndex}.${state.activeSession}.${kind}.${index}" value="${escapeAttr(value)}" />
        </label>
      `
    )
    .join("");
}

function summaryRow(entry: DayEntry) {
  const mBefore = bestValue(entry.morning.before);
  const mAfter = bestValue(entry.morning.after);
  const eBefore = bestValue(entry.evening.before);
  const eAfter = bestValue(entry.evening.after);
  const active = entry.date === state.entries[state.activeIndex].date ? " is-current" : "";
  return `
    <button class="overview-row${active}" data-day="${state.entries.indexOf(entry)}">
      <span>${formatShortDate(entry.date)}</span>
      <span>${displayBest(mBefore)}</span>
      <span>${displayBest(mAfter)}</span>
      <span>${displayBest(eBefore)}</span>
      <span>${displayBest(eAfter)}</span>
    </button>
  `;
}

function handleInput(event: Event, shouldRender: boolean) {
  const input = event.currentTarget as HTMLInputElement;
  const path = input.dataset.path;
  if (!path) return;
  const value = input.type === "checkbox" ? input.checked : input.value;
  setByPath(state, path, value);

  if (path === "settings.startDate" || path === "settings.weeks") {
    state.settings.year = String(new Date(`${state.settings.startDate}T00:00:00`).getFullYear());
    state.entries = buildEntries(state.settings.startDate, state.settings.weeks === 1 ? 7 : 14, state.entries);
    state.activeIndex = Math.min(state.activeIndex, state.entries.length - 1);
    shouldRender = true;
  }

  saveState();
  if (shouldRender) render();
}

function setByPath(target: unknown, path: string, value: string | boolean) {
  const parts = path.split(".");
  let cursor = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
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

function bestTwoDifference(values: string[]) {
  const numbers = toNumbers(values).sort((a, b) => b - a);
  return numbers.length >= 2 ? numbers[0] - numbers[1] : null;
}

function qualityWarning(values: string[], label: string) {
  const diff = bestTwoDifference(values);
  if (diff === null || diff <= 20) return "";
  return `${label}: kahden parhaan ero on ${diff} l/min.`;
}

function displayBest(value: number | null) {
  return value ? `${value}` : "-";
}

async function exportPdf() {
  saveState("Luodaan PDF...");
  render();

  const template = await fetch(`${BASE_URL}templates/pef-template.pdf`).then((response) =>
    response.arrayBuffer()
  );
  const source = await PDFDocument.load(template);
  const pdf = await PDFDocument.create();
  const [page] = await pdf.copyPages(source, [1]);
  pdf.addPage(page);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  const topY = (top: number) => height - top;
  const blue = rgb(0.05, 0.18, 0.38);

  const patient = [state.settings.patientName, state.settings.patientId].filter(Boolean).join(", ");
  drawText(page, patient, 455, topY(100), 9, regular, blue);
  drawText(page, state.settings.year, 280, topY(96), 9, regular, blue);
  if (state.settings.hospital) drawText(page, "X", 253, topY(88), 11, bold, blue);
  drawText(page, "X", state.settings.weeks === 1 ? 146 : 193, topY(96), 11, bold, blue);

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

    (["morning", "evening"] as SessionKey[]).forEach((sessionKey, sessionIndex) => {
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

  drawGraph(page, topY, regular, blue);

  const bytes = await pdf.save();
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  downloadBlob(
    new Blob([pdfBuffer], { type: "application/pdf" }),
    `PEF-taulukko-${state.settings.startDate}.pdf`
  );
  saveState("PDF valmis");
  render();
}

function drawGraph(
  page: import("pdf-lib").PDFPage,
  topY: (top: number) => number,
  font: import("pdf-lib").PDFFont,
  color: ReturnType<typeof rgb>
) {
  const values = state.entries.flatMap((entry) =>
    (["morning", "evening"] as SessionKey[]).flatMap((sessionKey) => {
      const session = entry[sessionKey];
      return [
        bestValue(session.before),
        bestValue(session.after),
        ...parseSymptomValues(session.symptoms)
      ].filter((value): value is number => value !== null);
    })
  );

  if (!values.length) return;

  const { minScale, maxScale } = chooseGraphScale(values);

  const xLeft = 117.5;
  const pairWidth = 47.0;
  const subWidth = pairWidth / 2;
  const graphTop = 268.2;
  const graphBottom = 508.4;
  const graphHeight = graphBottom - graphTop;
  const yForValue = (value: number) => {
    const clamped = Math.min(maxScale, Math.max(minScale, value));
    const ratio = (clamped - minScale) / (maxScale - minScale);
    return topY(graphBottom - ratio * graphHeight) - 2.5;
  };

  for (let value = minScale; value <= maxScale; value += 50) {
    const y = yForValue(value);
    drawRight(page, String(value), 108, y, 6.2, font, color);
  }

  state.entries.forEach((entry, dayIndex) => {
    (["morning", "evening"] as SessionKey[]).forEach((sessionKey, sessionIndex) => {
      const session = entry[sessionKey];
      const x = xLeft + pairWidth * dayIndex + subWidth * (sessionIndex + 0.5);
      const before = bestValue(session.before);
      const after = bestValue(session.after);
      if (before !== null) drawCentered(page, "X", x - 2.8, yForValue(before), 7.4, font, color);
      if (after !== null) drawCentered(page, "O", x + 2.8, yForValue(after), 7.4, font, color);
      parseSymptomValues(session.symptoms).forEach((value, symptomIndex) => {
        drawTriangle(page, x + 5 + symptomIndex * 3, yForValue(value) + 1, color);
      });
    });
  });
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

function drawTriangle(page: import("pdf-lib").PDFPage, x: number, y: number, color: ReturnType<typeof rgb>) {
  page.drawSvgPath("M 0 0 L 0 6 L 7 3 Z", { x, y, color });
}

function parseSymptomValues(value: string) {
  return value
    .split(/[,\s;]+/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);
}

function exportCalendar() {
  const days = state.settings.weeks === 1 ? 7 : 14;
  const events = [
    calendarEvent("Aamu PEF", state.settings.startDate, state.settings.morningReminder, days),
    calendarEvent("Ilta PEF", state.settings.startDate, state.settings.eveningReminder, days)
  ].join("\r\n");
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PEF-seuranta//FI",
    "CALSCALE:GREGORIAN",
    events,
    "END:VCALENDAR"
  ].join("\r\n");
  downloadBlob(new Blob([calendar], { type: "text/calendar;charset=utf-8" }), "PEF-muistutukset.ics");
  saveState("Kalenteri valmis");
  render();
}

function calendarEvent(summary: string, date: string, time: string, count: number) {
  const stamp = compactDateTime(new Date());
  const uid = `${summary}-${date}-${time}@pef-seuranta`.replace(/[^A-Za-z0-9@._-]/g, "-");
  const start = compactLocalDateTime(date, time);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    "DURATION:PT10M",
    `RRULE:FREQ=DAILY;COUNT=${count}`,
    `SUMMARY:${summary}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT"
  ].join("\r\n");
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    saveState("Selain ei tue ilmoituksia");
    render();
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    saveState("Ilmoitusta ei sallittu");
    render();
    return;
  }

  new Notification("PEF-seuranta", { body: "Appimuistutus on sallittu." });
  saveState("Appimuistutus sallittu");
  scheduleVisibleAppReminder();
  render();
}

function scheduleVisibleAppReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const next = nextReminderDate();
  const delay = next.getTime() - Date.now();
  if (delay <= 0 || delay > 2_147_483_647) return;
  window.setTimeout(() => {
    new Notification("PEF-mittaus", { body: "On mittauksen aika." });
    scheduleVisibleAppReminder();
  }, delay);
}

function nextReminderDate() {
  const now = new Date();
  const candidates = [state.settings.morningReminder, state.settings.eveningReminder].map((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    if (date <= now) date.setDate(date.getDate() + 1);
    return date;
  });
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register(`${BASE_URL}sw.js`);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compactLocalDateTime(date: string, time: string) {
  const cleanTime = time.replace(":", "").padEnd(4, "0");
  return `${date.replaceAll("-", "")}T${cleanTime}00`;
}

function compactDateTime(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}.${month}.`;
}

function formatPdfDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
