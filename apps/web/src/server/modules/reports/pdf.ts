import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { getSessionDetail } from "../diagnostics/service";
import type { RulesResult } from "../diagnostics/rules";
import { getOwnedVehicle } from "../vehicles/service";
import { ar as arDict } from "../../../i18n/ar";
import { en as enDict } from "../../../i18n/en";

/**
 * Diagnostic report as PDF with correct Arabic shaping and RTL, rendered by
 * headless Chromium (playwright-core). Hardening: the page gets static HTML
 * only (every value HTML-escaped), JavaScript disabled, all network requests
 * aborted, fonts embedded as data URIs, a hard timeout, and a fresh browser
 * per render that is always closed.
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Codes, VIN fragments and part numbers stay LTR inside Arabic text. */
const ltr = (v: unknown) => `<bdi dir="ltr" class="code">${esc(v)}</bdi>`;

let fontCss: string | undefined;
function fonts(): string {
  if (fontCss !== undefined) return fontCss;
  try {
    // Same self-hosted OFL fonts as the web UI (src/fonts), embedded as data URIs.
    const dir = path.join(process.cwd(), "src", "fonts");
    const b64 = (f: string) => readFileSync(path.join(dir, f)).toString("base64");
    const ar = 'U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF';
    fontCss = `
      @font-face{font-family:Readex;src:url(data:font/woff2;base64,${b64("readex-pro-arabic-wght-normal.woff2")}) format("woff2");font-weight:160 700;unicode-range:${ar};}
      @font-face{font-family:Readex;src:url(data:font/woff2;base64,${b64("readex-pro-latin-wght-normal.woff2")}) format("woff2");font-weight:160 700;unicode-range:U+0000-00FF,U+2000-206F;}
      @font-face{font-family:Kufi;src:url(data:font/woff2;base64,${b64("reem-kufi-arabic-wght-normal.woff2")}) format("woff2");font-weight:400 700;unicode-range:${ar};}
      @font-face{font-family:Martian;src:url(data:font/woff2;base64,${b64("martian-mono-latin-wght-normal.woff2")}) format("woff2");font-weight:100 800;}`;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "pdf fonts not found; falling back to system fonts");
    fontCss = "";
  }
  return fontCss;
}

const URGENCY_AR: Record<string, string> = { stop_driving: "أوقف القيادة", urgent: "عاجل", soon: "قريبًا", monitor: "راقب", insufficient_info: "معلومات غير كافية" };
const URGENCY_EN: Record<string, string> = { stop_driving: "Stop driving", urgent: "Urgent", soon: "Soon", monitor: "Monitor", insufficient_info: "Insufficient information" };

export async function renderDiagnosticPdf(userId: string, sessionId: string, locale: "ar" | "en"): Promise<Buffer> {
  const detail = await getSessionDetail(userId, sessionId);
  if (!detail.latest) throw new AppError("conflict", "no_result_yet");
  const v = await getOwnedVehicle(userId, detail.session.vehicleId);
  const rules = detail.latest.rulesResult as unknown as RulesResult;
  const model = detail.latest.modelResult as null | { summary: string; likelyCauses: Array<{ cause: string; sourceIds: string[] }>; missingInformation: string[]; nextCheck: string | null; conditionalParts: Array<{ part: string; onlyIf: string }> };
  const ar = locale === "ar";
  const t = (a: string, e: string) => (ar ? a : e);
  const D = ar ? arDict : enDict;
  const checkStatus: Record<string, string> = { pending: t("لم يُسجَّل", "not recorded"), pass: D.diagnose.pass, fail: D.diagnose.fail, not_done: D.diagnose.notDone, unsure: D.diagnose.unsure };
  const L = <T extends Record<string, string>>(map: T, k: string) => (map as Record<string, string>)[k] ?? k;

  const html = `<!doctype html><html lang="${locale}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>
    ${fonts()}
    @page{size:A4;margin:18mm 16mm}
    body{font-family:Readex,"Segoe UI",Tahoma,sans-serif;color:#1c1b19;font-size:11pt;line-height:1.7}
    .code{font-family:Martian,Consolas,monospace;font-size:.92em;letter-spacing:.02em}
    header{border-bottom:2px solid #1c1b19;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
    h1{font-family:Kufi,Readex,sans-serif;font-size:18pt;margin:0} h2{font-family:Kufi,Readex,sans-serif;font-size:12.5pt;margin:18px 0 6px;border-bottom:1px solid #d9d2c3;padding-bottom:3px}
    .urg{display:inline-block;padding:3px 10px;border:2px solid #1c1b19;font-weight:700}
    .urg.stop_driving,.urg.urgent{background:#b42318;color:#fff;border-color:#b42318}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #d9d2c3;padding:5px 7px;text-align:start;vertical-align:top}
    .muted{color:#5b5850;font-size:9.5pt} ul{margin:4px 0;padding-inline-start:20px}
    footer{margin-top:22px;border-top:1px solid #d9d2c3;padding-top:6px;font-size:8.5pt;color:#5b5850}
  </style></head><body>
  <header><div><h1>${t("تقرير تشخيص إرشادي", "Guidance diagnostic report")}</h1>
  <div class="muted">AutoCare IQ · ${esc(new Date(detail.latest.createdAt).toISOString().slice(0, 16).replace("T", " "))} UTC</div></div>
  <div class="urg ${esc(rules.urgency)}">${esc((ar ? URGENCY_AR : URGENCY_EN)[rules.urgency])}</div></header>

  <h2>${t("السيارة", "Vehicle")}</h2>
  <table><tr><th>${t("الشركة/الموديل", "Make/model")}</th><td>${esc(v.make)} ${esc(v.model)} ${esc(v.year)}</td>
  <th>${t("المحرك", "Engine")}</th><td>${esc(v.engine ?? "—")}</td></tr>
  <tr><th>${t("الوقود", "Fuel")}</th><td>${esc(L(D.garage.fuels, v.fuel))}</td><th>${t("العداد", "Odometer")}</th><td>${v.odometer != null ? ltr(`${v.odometer} ${v.odometerUnit}`) : "—"}</td></tr></table>

  <h2>${t("الأكواد والتغطية", "Codes and coverage")}</h2>
  <table><tr><th>${t("الكود", "Code")}</th><th>${t("حالة التغطية", "Coverage")}</th><th>${t("مراجَع فنيًا", "Reviewed")}</th></tr>
  ${rules.codeCoverage.map((c) => `<tr><td>${ltr(c.code)}</td><td>${esc(L(D.dtc.status, c.status))}</td><td>${c.reviewed ? t("نعم", "yes") : t("مسودة", "draft")}</td></tr>`).join("") || `<tr><td colspan="3">${t("لا توجد أكواد", "No codes")}</td></tr>`}</table>

  ${rules.hits.length ? `<h2>${t("قواعد السلامة التي انطبقت", "Safety rules that applied")}</h2><ul>${rules.hits.map((h) => `<li>${esc(ar ? h.ar : h.en)} <span class="muted">${ltr(h.id)}</span></li>`).join("")}</ul>` : ""}

  ${model ? `<h2>${t("الشرح", "Explanation")}</h2><p>${esc(model.summary)}</p>
  ${model.likelyCauses.length ? `<h2>${t("أسباب محتملة (ليست تشخيصًا مؤكدًا)", "Possible causes (not a confirmed diagnosis)")}</h2><ul>${model.likelyCauses.map((c) => `<li>${esc(c.cause)} <span class="muted">[${c.sourceIds.map(esc).join(", ")}]</span></li>`).join("")}</ul>` : ""}
  ${model.conditionalParts.length ? `<h2>${t("قطع محتملة — بشرط تأكيد السبب", "Possible parts — only if the cause is confirmed")}</h2><ul>${model.conditionalParts.map((p) => `<li>${esc(p.part)}: ${esc(p.onlyIf)}</li>`).join("")}</ul>` : ""}` : `<p class="muted">${t("لم يُستخدم النموذج المحلي في هذا التقرير", "The local model was not used for this report")} <span class="code">(${esc(detail.latest.modelStatus)})</span>.</p>`}

  <h2>${t("الفحوص بالترتيب", "Checks in order")}</h2>
  <table><tr><th>#</th><th>${t("الفحص", "Check")}</th><th>${t("المكان", "Where")}</th><th>${t("النتيجة", "Result")}</th></tr>
  ${rules.orderedChecks.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(ar ? c.ar : c.en)}</td><td>${esc(L(D.dtc.where, c.where))}</td><td>${esc(checkStatus[c.status] ?? c.status)}</td></tr>`).join("")}</table>

  ${rules.missingInformation.length ? `<h2>${t("معلومات ناقصة", "Missing information")}</h2><ul>${rules.missingInformation.map((m) => `<li>${esc(ar ? m.ar : m.en)}</li>`).join("")}</ul>` : ""}

  <footer>${t("هذا تقرير إرشادي وليس تشخيصًا نهائيًا. لا تستبدل قطعًا بناءً على الكود وحده. القواعد", "This is guidance, not a final diagnosis. Do not replace parts based on a code alone. Rules")}: ${ltr(detail.latest.rulesVersion)}
  ${detail.latest.modelName ? ` · ${t("النموذج", "Model")}: ${ltr(detail.latest.modelName)} · ${ltr(detail.latest.promptVersion)}` : ""}</footer>
  </body></html>`;

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: env().PDF_BROWSER_EXECUTABLE,
    channel: env().PDF_BROWSER_EXECUTABLE ? undefined : (env().PDF_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined)),
    headless: true,
    timeout: 20_000,
    args: ["--disable-extensions", "--disable-background-networking", "--no-first-run"],
  }).catch((e: Error) => {
    logger.error({ err: e.message }, "pdf browser unavailable");
    throw new AppError("internal", "pdf_renderer_unavailable");
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}
