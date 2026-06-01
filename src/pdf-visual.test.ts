import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { addCalendarDays } from "./date-utils";
import { createPefPdfBytes, type PdfAppState } from "./pdf-export";

const startDate = "2026-05-31";
const baselinePath = resolve("src/__fixtures__/pef-visual-baseline.png");

function session(time: string, afterTime: string, beforeBest: number, afterBest: number, symptoms = "") {
  return {
    time,
    afterTime,
    before: [String(beforeBest - 10), String(beforeBest), String(beforeBest - 5)] as [string, string, string],
    after: [String(afterBest - 10), String(afterBest - 5), String(afterBest)] as [string, string, string],
    symptomTime: symptoms ? time : "",
    symptoms
  };
}

function mockState(): PdfAppState {
  const morningBefore = [430, 425, 410, 395, 370, 355, 345, 350, 365, 385, 405, 420, 435, 445];
  const morningAfter = [470, 465, 450, 435, 410, 390, 380, 390, 410, 430, 450, 465, 480, 490];
  const eveningBefore = [440, 435, 420, 405, 380, 365, 355, 360, 375, 395, 415, 430, 445, 455];
  const eveningAfter = [480, 475, 460, 445, 420, 400, 390, 400, 420, 440, 460, 475, 490, 500];

  return {
    settings: {
      patientName: "Matti Virtanen",
      patientId: "140379-213P",
      hospital: true,
      referenceValue: "450",
      weeks: 2,
      startDate,
      year: "2026"
    },
    entries: Array.from({ length: 14 }, (_, index) => ({
      date: addCalendarDays(startDate, index),
      morning: session(
        "07:30",
        "07:45",
        morningBefore[index],
        morningAfter[index],
        index === 6 ? "330, 340" : ""
      ),
      evening: session(
        "20:30",
        "20:45",
        eveningBefore[index],
        eveningAfter[index],
        index === 4 ? "360" : ""
      )
    }))
  };
}

async function renderMockPdfPng(outputPath: string) {
  const template = await readFile("public/templates/pef-template.pdf");
  const templateBuffer = template.buffer.slice(
    template.byteOffset,
    template.byteOffset + template.byteLength
  ) as ArrayBuffer;
  const bytes = await createPefPdfBytes(mockState(), templateBuffer);
  const workdir = mkdtempSync(join(tmpdir(), "pef-visual-"));
  const pdfPath = join(workdir, "actual.pdf");
  writeFileSync(pdfPath, bytes);
  execFileSync("python3", ["-c", renderScript, pdfPath, outputPath], { stdio: "pipe" });
}

const renderScript = String.raw`
import sys
import pypdfium2 as pdfium
pdf=pdfium.PdfDocument(sys.argv[1])
page=pdf[0]
image=page.render(scale=1.3).to_pil()
image.save(sys.argv[2])
`;

const compareScript = String.raw`
import sys
from PIL import Image
baseline=Image.open(sys.argv[1]).convert('RGB')
actual=Image.open(sys.argv[2]).convert('RGB')
if baseline.size != actual.size:
    print(f'size-mismatch {baseline.size} {actual.size}')
    sys.exit(2)
allowed_delta=3
changed=0
max_delta=0
for bp, ap in zip(baseline.getdata(), actual.getdata()):
    delta=max(abs(bp[i]-ap[i]) for i in range(3))
    max_delta=max(max_delta, delta)
    if delta > allowed_delta:
        changed += 1
print(f'changed={changed} max_delta={max_delta}')
if changed > 100:
    sys.exit(1)
`;

describe("PDF visual regression", () => {
  it("matches the committed PEF table baseline", async () => {
    const actualPath = join(mkdtempSync(join(tmpdir(), "pef-visual-")), "actual.png");
    await renderMockPdfPng(actualPath);
    if (process.env.PEF_UPDATE_VISUAL_BASELINE === "1") {
      copyFileSync(actualPath, baselinePath);
    }
    const output = execFileSync("python3", ["-c", compareScript, baselinePath, actualPath], {
      encoding: "utf8"
    });
    expect(output).toContain("changed=");
    expect(readFileSync(actualPath).byteLength).toBeGreaterThan(0);
  });
});
