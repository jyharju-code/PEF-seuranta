import { createPefPdfBytes } from "./pdf-export";
import {
  bronchodilatorResponseForSession,
  summarizeBronchodilatorResponses,
  summarizeDiurnalVariation
} from "./metrics";
import "./styles.css";

const BASE_URL = import.meta.env.BASE_URL;

type SessionKey = "morning" | "evening";
type Language = "fi" | "en";
type DevicePlatform = "iphone" | "android";
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
  language: Language;
  device: DevicePlatform;
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const STORAGE_KEY = "pef-seuranta:v1";
const SPONSOR_URL = "https://github.com/sponsors/jyharju-code";
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

const COPY = {
  fi: {
    appName: "PEF-seuranta",
    statusSaved: "Tallennettu tähän laitteeseen",
    saved: "Tallennettu",
    periodUpdated: "Jakso päivitetty",
    pdfCreating: "Luodaan PDF...",
    pdfReady: "PDF valmis",
    calendarReady: "Kalenteri valmis",
    noNotificationSupport: "Selain ei tue ilmoituksia",
    notificationDenied: "Ilmoitusta ei sallittu",
    notificationAllowed: "Appimuistutus sallittu",
    notificationAllowedBody: "Appimuistutus on sallittu.",
    reminderTitle: "PEF-mittaus",
    reminderBody: "On mittauksen aika.",
    morning: "Aamu",
    evening: "Ilta",
    lead:
      "Puhelimessa toimiva PEF-seurannan apuri, joka tallentaa arvot tähän laitteeseen ja vie täytetyn PDF-taulukon terveydenhuollolle.",
    language: "Kieli",
    device: "Puhelin",
    iphone: "iPhone",
    android: "Android",
    installTitle: "Asennus",
    installIphone:
      "Avaa tämä osoite Safarissa, napauta Jaa-painiketta ja valitse Lisää Koti-valikkoon.",
    installAndroid:
      "Avaa tämä osoite Chromessa ja valitse selaimen valikosta Asenna sovellus tai Lisää aloitusnäyttöön.",
    installButton: "Asenna Androidiin",
    installUnavailable: "Jos asennuspainiketta ei näy, käytä selaimen omaa valikkoa.",
    disclaimerTitle: "Ei lääketieteellistä neuvontaa",
    disclaimer:
      "Tämä palvelu auttaa kirjaamaan PEF-puhalluksia ja muodostamaan seurantalomakkeen. Se ei tee diagnoosia, arvioi hoitoa tai korvaa terveydenhuollon ohjeita.",
    privacyTitle: "Tietosuoja",
    privacy:
      "Arvot tallennetaan vain tämän selaimen paikalliseen muistiin. Palvelu ei vaadi tiliä eikä lähetä PEF-arvoja palvelimelle. Jos tyhjennät selaindatan tai poistat sovelluksen, paikalliset tiedot voivat poistua.",
    support: "Tue ylläpitoa",
    tracking: "Seuranta",
    oneWeek: "1 viikko",
    twoWeeks: "2 viikkoa",
    patientName: "Potilaan nimi",
    patientId: "Henkilötunnus",
    startDate: "Aloituspäivä",
    year: "Vuosi",
    hospital: "Iho- ja allergiasairaala",
    days: "Päivät",
    measurement: "Mittaus",
    sessionChoice: "Aamu tai ilta",
    time: "Klo",
    before: "Ennen",
    after: "Jälkeen",
    beforeMedication: "Ennen lääkettä",
    afterMedication: "Lääkkeen jälkeen",
    symptomTime: "Oire-klo",
    symptomBlows: "Oirepuhallukset l/min",
    symptomPlaceholder: "esim. 420, 430",
    qualityOk: "Kahden parhaan puhalluksen ero on kunnossa, kun arvoja on vähintään kaksi.",
    qualityWarning: (label: string, diff: number) =>
      `${label}: kahden parhaan ero on ${diff} l/min.`,
    exportPdf: "Vie täytetty PDF",
    exportCalendar: "Kalenterimuistutukset",
    enableNotifications: "Salli appimuistutus",
    export: "Vienti",
    overview: "Yhteenveto",
    diurnalTitle: "Vuorokausivaihtelu",
    diurnalMean: "Keskiarvo",
    diurnalMax: "Suurin",
    noDiurnalData: "Lisää aamu- ja ilta-arvot nähdäksesi vaihtelun.",
    bronchodilatorTitle: "Avaavan lääkkeen vaste",
    bronchodilatorMax: "Suurin vaste",
    bronchodilatorSignificant: "Merkittäviä vasteita",
    bronchodilatorMarker: "vaste",
    day: "Päivä",
    morningBefore: "Aamu ennen",
    morningAfter: "Aamu jälkeen",
    eveningBefore: "Ilta ennen",
    eveningAfter: "Ilta jälkeen"
  },
  en: {
    appName: "PEF tracker",
    statusSaved: "Saved on this device",
    saved: "Saved",
    periodUpdated: "Period updated",
    pdfCreating: "Creating PDF...",
    pdfReady: "PDF ready",
    calendarReady: "Calendar ready",
    noNotificationSupport: "Notifications are not supported by this browser",
    notificationDenied: "Notification permission was not granted",
    notificationAllowed: "App reminder enabled",
    notificationAllowedBody: "App reminders are enabled.",
    reminderTitle: "PEF measurement",
    reminderBody: "Time for your measurement.",
    morning: "Morning",
    evening: "Evening",
    lead:
      "A phone-friendly PEF diary that stores values on this device and exports a filled PDF sheet for healthcare.",
    language: "Language",
    device: "Phone",
    iphone: "iPhone",
    android: "Android",
    installTitle: "Install",
    installIphone:
      "Open this address in Safari, tap Share, and choose Add to Home Screen.",
    installAndroid:
      "Open this address in Chrome and choose Install app or Add to Home screen from the browser menu.",
    installButton: "Install on Android",
    installUnavailable: "If the install button is not visible, use the browser menu.",
    disclaimerTitle: "Not medical advice",
    disclaimer:
      "This service helps record PEF blows and create a follow-up form. It does not diagnose, evaluate treatment, or replace instructions from healthcare professionals.",
    privacyTitle: "Privacy",
    privacy:
      "Values are stored only in this browser's local storage. The service does not require an account and does not send PEF values to a server. If you clear browser data or remove the app, local data may be deleted.",
    support: "Support maintenance",
    tracking: "Tracking",
    oneWeek: "1 week",
    twoWeeks: "2 weeks",
    patientName: "Patient name",
    patientId: "Personal ID",
    startDate: "Start date",
    year: "Year",
    hospital: "Skin and Allergy Hospital",
    days: "Days",
    measurement: "Measurement",
    sessionChoice: "Morning or evening",
    time: "Time",
    before: "Before",
    after: "After",
    beforeMedication: "Before medication",
    afterMedication: "After medication",
    symptomTime: "Symptom time",
    symptomBlows: "Symptom blows l/min",
    symptomPlaceholder: "e.g. 420, 430",
    qualityOk: "The two best blows are within range once at least two values are entered.",
    qualityWarning: (label: string, diff: number) =>
      `${label}: the two best blows differ by ${diff} l/min.`,
    exportPdf: "Export filled PDF",
    exportCalendar: "Calendar reminders",
    enableNotifications: "Allow app reminder",
    export: "Export",
    overview: "Summary",
    diurnalTitle: "Diurnal variation",
    diurnalMean: "Mean",
    diurnalMax: "Max",
    noDiurnalData: "Add morning and evening values to see variation.",
    bronchodilatorTitle: "Bronchodilator response",
    bronchodilatorMax: "Max response",
    bronchodilatorSignificant: "Significant responses",
    bronchodilatorMarker: "response",
    day: "Day",
    morningBefore: "Morning before",
    morningAfter: "Morning after",
    eveningBefore: "Evening before",
    eveningAfter: "Evening after"
  }
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
      language: "fi",
      device: detectDevice(),
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
    status: COPY.fi.statusSaved
  };
};

let state = loadState();
const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root missing");
}

const app: HTMLDivElement = appRoot;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event as BeforeInstallPromptEvent;
  render();
});

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

function detectDevice(): DevicePlatform {
  return /android/i.test(navigator.userAgent) ? "android" : "iphone";
}

function copy() {
  return COPY[state.settings.language];
}

function saveState(status = copy().saved) {
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
  const c = copy();
  document.documentElement.lang = state.settings.language;
  const activeDay = state.entries[state.activeIndex];
  const activeSession = activeDay[state.activeSession];
  const warnings = [
    qualityWarning(activeSession.before, c.beforeMedication),
    qualityWarning(activeSession.after, c.afterMedication)
  ].filter(Boolean);
  const diurnalSummary = summarizeDiurnalVariation(state.entries);
  const bronchodilatorSummary = summarizeBronchodilatorResponses(state.entries);

  app.innerHTML = `
    <header class="app-header">
      <div>
        <p class="eyebrow">${c.appName}</p>
        <h1>${formatLongDate(activeDay.date)} ${sessionLabel(state.activeSession).toLowerCase()}</h1>
      </div>
      <div class="status">${escapeHtml(state.status)}</div>
    </header>

    <main>
      <section class="intro-panel" aria-label="${c.appName}">
        <div class="intro-copy">
          <h2>${c.appName}</h2>
          <p>${c.lead}</p>
        </div>
        <div class="intro-controls">
          <div>
            <span>${c.language}</span>
            <div class="segmented" role="group" aria-label="${c.language}">
              ${segmentButton("language", "fi", "Suomi", state.settings.language === "fi")}
              ${segmentButton("language", "en", "English", state.settings.language === "en")}
            </div>
          </div>
          <div>
            <span>${c.device}</span>
            <div class="segmented" role="group" aria-label="${c.device}">
              ${segmentButton("device", "iphone", c.iphone, state.settings.device === "iphone")}
              ${segmentButton("device", "android", c.android, state.settings.device === "android")}
            </div>
          </div>
        </div>
        <div class="info-grid">
          <article>
            <h3>${c.installTitle}</h3>
            <p>${state.settings.device === "android" ? c.installAndroid : c.installIphone}</p>
            ${
              state.settings.device === "android"
                ? `<button class="secondary-action" data-action="install-pwa">${c.installButton}</button><small>${c.installUnavailable}</small>`
                : ""
            }
          </article>
          <article>
            <h3>${c.disclaimerTitle}</h3>
            <p>${c.disclaimer}</p>
          </article>
          <article>
            <h3>${c.privacyTitle}</h3>
            <p>${c.privacy}</p>
          </article>
        </div>
        <a class="support-link" href="${SPONSOR_URL}" target="_blank" rel="noopener">${c.support}</a>
      </section>

      <section class="panel settings-panel" aria-label="Asetukset">
        <div class="section-heading">
          <h2>${c.tracking}</h2>
          <div class="segmented" role="group" aria-label="${c.tracking}">
            ${segmentButton("weeks", "1", c.oneWeek, state.settings.weeks === 1)}
            ${segmentButton("weeks", "2", c.twoWeeks, state.settings.weeks === 2)}
          </div>
        </div>
        <div class="settings-grid">
          ${field(c.patientName, "settings.patientName", state.settings.patientName, "text")}
          ${field(c.patientId, "settings.patientId", state.settings.patientId, "text")}
          ${field(c.startDate, "settings.startDate", state.settings.startDate, "date")}
          ${field(c.year, "settings.year", state.settings.year, "number")}
          ${field(c.morning, "settings.morningReminder", state.settings.morningReminder, "time")}
          ${field(c.evening, "settings.eveningReminder", state.settings.eveningReminder, "time")}
          <label class="check-row">
            <input type="checkbox" data-path="settings.hospital" ${state.settings.hospital ? "checked" : ""} />
            <span>${c.hospital}</span>
          </label>
        </div>
      </section>

      <nav class="day-strip" aria-label="${c.days}">
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
          <h2>${c.measurement}</h2>
          <div class="segmented" role="group" aria-label="${c.sessionChoice}">
            ${sessionButton("morning")}
            ${sessionButton("evening")}
          </div>
        </div>

        <div class="measurement-grid">
          <div class="measurement-block">
            <label class="field small-field">
              <span>${c.time}</span>
              <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.time" value="${escapeAttr(activeSession.time)}" />
            </label>
            <div class="value-row" aria-label="${c.beforeMedication}">
              <span>${c.before}</span>
              ${valueInputs("before", activeSession.before)}
            </div>
          </div>

          <div class="measurement-block">
            <label class="field small-field">
              <span>${c.time}</span>
              <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.afterTime" value="${escapeAttr(activeSession.afterTime)}" />
            </label>
            <div class="value-row" aria-label="${c.afterMedication}">
              <span>${c.after}</span>
              ${valueInputs("after", activeSession.after)}
            </div>
          </div>
        </div>

        ${
          warnings.length
            ? `<div class="warning-list">${warnings.map((warning) => `<p>${warning}</p>`).join("")}</div>`
            : `<div class="ok-line">${c.qualityOk}</div>`
        }

        <div class="symptom-row">
          <label class="field small-field">
            <span>${c.symptomTime}</span>
            <input type="time" data-path="entries.${state.activeIndex}.${state.activeSession}.symptomTime" value="${escapeAttr(activeSession.symptomTime)}" />
          </label>
          <label class="field wide-field">
            <span>${c.symptomBlows}</span>
            <input inputmode="numeric" data-path="entries.${state.activeIndex}.${state.activeSession}.symptoms" value="${escapeAttr(activeSession.symptoms)}" placeholder="${c.symptomPlaceholder}" />
          </label>
        </div>
      </section>

      <section class="actions-band" aria-label="${c.export}">
        <button class="primary-action" data-action="export-pdf">${c.exportPdf}</button>
        <button data-action="export-calendar">${c.exportCalendar}</button>
        <button data-action="enable-notifications">${c.enableNotifications}</button>
      </section>

      <section class="overview" aria-label="${c.overview}">
        <div class="section-heading">
          <h2>${c.overview}</h2>
        </div>
        ${metricsSummaryBlock(diurnalSummary, bronchodilatorSummary)}
        <div class="overview-table">
          <div class="overview-head">
            <span>${c.day}</span><span>${c.morningBefore}</span><span>${c.morningAfter}</span><span>${c.eveningBefore}</span><span>${c.eveningAfter}</span>
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
      saveState(copy().periodUpdated);
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("button[data-segment='language']").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.language = button.dataset.value === "en" ? "en" : "fi";
      saveState(copy().saved);
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("button[data-segment='device']").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.device = button.dataset.value === "android" ? "android" : "iphone";
      saveState();
      render();
    });
  });

  app.querySelector<HTMLButtonElement>("[data-action='export-pdf']")?.addEventListener("click", exportPdf);
  app.querySelector<HTMLButtonElement>("[data-action='export-calendar']")?.addEventListener("click", exportCalendar);
  app
    .querySelector<HTMLButtonElement>("[data-action='enable-notifications']")
    ?.addEventListener("click", enableNotifications);
  app.querySelector<HTMLButtonElement>("[data-action='install-pwa']")?.addEventListener("click", installPwa);
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
      ${sessionLabel(session)}
    </button>
  `;
}

function sessionLabel(session: SessionKey) {
  return session === "morning" ? copy().morning : copy().evening;
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
  const morningResponse = bronchodilatorResponseForSession(entry.morning);
  const eveningResponse = bronchodilatorResponseForSession(entry.evening);
  const active = entry.date === state.entries[state.activeIndex].date ? " is-current" : "";
  return `
    <button class="overview-row${active}" data-day="${state.entries.indexOf(entry)}">
      <span>${formatShortDate(entry.date)}</span>
      <span>${displayBest(mBefore)}</span>
      <span>${displayBest(mAfter)}${responseMarker(morningResponse.meetsThreshold)}</span>
      <span>${displayBest(eBefore)}</span>
      <span>${displayBest(eAfter)}${responseMarker(eveningResponse.meetsThreshold)}</span>
    </button>
  `;
}

function metricsSummaryBlock(
  diurnalSummary: ReturnType<typeof summarizeDiurnalVariation>,
  bronchodilatorSummary: ReturnType<typeof summarizeBronchodilatorResponses>
) {
  const c = copy();
  const diurnalCards =
    diurnalSummary.meanPercent === null || diurnalSummary.maxPercent === null
      ? `<p>${c.noDiurnalData}</p>`
      : `
        <article>
          <span>${c.diurnalTitle}</span>
          <strong>${c.diurnalMean}: ${formatPercent(diurnalSummary.meanPercent)}</strong>
        </article>
        <article>
          <span>${c.diurnalTitle}</span>
          <strong>${c.diurnalMax}: ${formatPercent(diurnalSummary.maxPercent)}</strong>
        </article>
      `;

  return `
    <div class="metrics-strip" aria-label="${c.overview}">
      ${diurnalCards}
      <article>
        <span>${c.bronchodilatorTitle}</span>
        <strong>${c.bronchodilatorMax}: ${formatResponse(bronchodilatorSummary.maxPercent, bronchodilatorSummary.maxDelta)}</strong>
      </article>
      <article>
        <span>${c.bronchodilatorTitle}</span>
        <strong>${c.bronchodilatorSignificant}: ${bronchodilatorSummary.significantCount}</strong>
      </article>
    </div>
  `;
}

function responseMarker(show: boolean) {
  return show ? ` <em class="response-marker">${copy().bronchodilatorMarker}</em>` : "";
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
  return copy().qualityWarning(label, diff);
}

function displayBest(value: number | null) {
  return value ? `${value}` : "-";
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)} %`;
}

function formatResponse(percent: number | null, delta: number | null) {
  if (percent === null || delta === null) return "-";
  return `${formatPercent(percent)} / ${delta.toFixed(0)} l/min`;
}

async function exportPdf() {
  saveState(copy().pdfCreating);
  render();

  const template = await fetch(`${BASE_URL}templates/pef-template.pdf`).then((response) =>
    response.arrayBuffer()
  );
  const bytes = await createPefPdfBytes(state, template);
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  downloadBlob(
    new Blob([pdfBuffer], { type: "application/pdf" }),
    `PEF-taulukko-${state.settings.startDate}.pdf`
  );
  saveState(copy().pdfReady);
  render();
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
  saveState(copy().calendarReady);
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
    saveState(copy().noNotificationSupport);
    render();
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    saveState(copy().notificationDenied);
    render();
    return;
  }

  new Notification(copy().appName, { body: copy().notificationAllowedBody });
  saveState(copy().notificationAllowed);
  scheduleVisibleAppReminder();
  render();
}

async function installPwa() {
  if (!deferredInstallPrompt) {
    saveState(copy().installUnavailable);
    render();
    return;
  }

  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  saveState();
  render();
}

function scheduleVisibleAppReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const next = nextReminderDate();
  const delay = next.getTime() - Date.now();
  if (delay <= 0 || delay > 2_147_483_647) return;
  window.setTimeout(() => {
    new Notification(copy().reminderTitle, { body: copy().reminderBody });
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
  return new Intl.DateTimeFormat(state.settings.language === "fi" ? "fi-FI" : "en-GB", {
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
