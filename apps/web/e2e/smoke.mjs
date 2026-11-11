/**
 * Browser smoke test of the main owner journey against a RUNNING dev server.
 *   E2E_EMAIL=... E2E_PASSWORD=... [E2E_BASE=http://localhost:3000] [E2E_SHOTS=dir] node e2e/smoke.mjs
 * Uses an installed Chromium/Edge via playwright-core (channel msedge on Windows,
 * or PDF_BROWSER_EXECUTABLE). Checks: RTL/LTR, CSP header, keyboard focus,
 * login, vehicle creation, diagnosis wizard, result rendering, PDF download,
 * no console errors. Exit code != 0 on any failure.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.E2E_BASE ?? "http://localhost:3000";
const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
if (!email || !password) throw new Error("Set E2E_EMAIL and E2E_PASSWORD (a dev/demo account).");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch(
  process.env.PDF_BROWSER_EXECUTABLE ? { executablePath: process.env.PDF_BROWSER_EXECUTABLE } : { channel: process.platform === "win32" ? "msedge" : "chromium" },
);
for (const viewport of [{ width: 1366, height: 900, tag: "desktop" }, { width: 390, height: 844, tag: "mobile" }]) {
  // E2E_INSECURE_TLS=1 only for a local TLS proxy with a self-signed/internal CA.
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ignoreHTTPSErrors: process.env.E2E_INSECURE_TLS === "1" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Download the React DevTools/.test(m.text()) && errors.push(m.text()));
  const shot = async (n) => shots && (await page.screenshot({ path: `${shots}/${viewport.tag}-${n}.png`, fullPage: true }));

  const res = await page.goto(base + "/", { waitUntil: "networkidle" });
  check(`[${viewport.tag}] home 200 + CSP`, res.status() === 200 && /nonce-/.test(res.headers()["content-security-policy"] ?? ""));
  if (base.startsWith("https://")) {
    check(`[${viewport.tag}] HSTS present over HTTPS`, /max-age=\d+/.test(res.headers()["strict-transport-security"] ?? ""), res.headers()["strict-transport-security"] ?? "missing");
  }
  check(`[${viewport.tag}] html dir=rtl lang=ar`, (await page.getAttribute("html", "dir")) === "rtl" && (await page.getAttribute("html", "lang")) === "ar");
  await page.keyboard.press("Tab");
  check(`[${viewport.tag}] first Tab reaches skip link`, (await page.evaluate(() => document.activeElement?.getAttribute("href"))) === "#main");

  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#f-email", email);
  await page.fill("#f-password", password);
  await Promise.all([page.waitForURL(/\/garage/, { timeout: 30_000 }), page.click("form button.btn-primary")]);
  check(`[${viewport.tag}] login redirects to garage`, page.url().includes("/garage"));
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => /acq_session$/.test(c.name));
  check(`[${viewport.tag}] session cookie HttpOnly${base.startsWith("https://") ? " + Secure + __Host-" : ""}`, Boolean(session?.httpOnly) && (!base.startsWith("https://") || (session.secure && session.name.startsWith("__Host-"))), session ? `${session.name} secure=${session.secure}` : "missing");

  // Add a vehicle through the form. On a free plan at its vehicle limit the
  // server refuses (plan_limit) and the form must say so; we then free a slot.
  const deleteVehicle = async (id) => {
    await page.goto(`${base}/garage/${id}`, { waitUntil: "networkidle" });
    page.once("dialog", (d) => d.accept());
    await Promise.all([page.waitForURL(/\/garage$/, { timeout: 30_000 }), page.click("button.text-danger")]);
  };
  const addVehicle = async () => {
    await page.goto(base + "/garage/new", { waitUntil: "networkidle" });
    await page.fill("#f-make", "Toyota");
    await page.fill("#f-model", "Corolla");
    await page.fill("#f-year", "2016");
    await page.fill("#f-engine", "1.6L 1ZR-FE");
    await page.fill("#f-odometer", "184000");
    await page.click("form > button.btn-primary");
    return page.waitForURL(/\/garage\/[0-9a-f-]{36}/, { timeout: 15_000 }).then(() => true, () => false);
  };
  let planLimitHit = false;
  if (!(await addVehicle())) {
    planLimitHit = true;
    const alert = (await page.locator("[role=alert]").first().textContent().catch(() => "")) ?? "";
    check(`[${viewport.tag}] plan vehicle limit explained in the form`, /باقتك|plan/.test(alert), alert.slice(0, 80));
    await page.goto(base + "/garage", { waitUntil: "networkidle" });
    const ids = await page.$$eval("a[href^='/garage/']", (as) => [...new Set(as.map((a) => a.getAttribute("href").split("/").pop()))].filter((x) => /^[0-9a-f-]{36}$/.test(x)));
    await deleteVehicle(ids[ids.length - 1]);
    await addVehicle();
  }
  check(`[${viewport.tag}] vehicle created`, /\/garage\/[0-9a-f-]{36}/.test(page.url()));
  const engineDir = await page.locator("bdi.ltr-id", { hasText: "1ZR-FE" }).first().getAttribute("dir");
  check(`[${viewport.tag}] engine code isolated LTR inside RTL`, engineDir === "ltr");
  await shot("vehicle");
  const vehicleId = page.url().split("/").pop();

  // Diagnosis wizard.
  await page.goto(`${base}/diagnose/new?vehicleId=${vehicleId}`, { waitUntil: "networkidle" });
  await page.fill("#codes", "P0301, P0171");
  await page.fill("#f-symptoms", "رجفة على الخمول من الصبح وتخف بعد ما يحمى المحرك");
  await Promise.all([page.waitForURL(/\/diagnose\/[0-9a-f-]{36}/, { timeout: 30_000 }), page.click("form > button.btn-primary")]);
  await page.getByRole("button", { name: "تدريجيًا" }).click();
  await page.getByRole("button", { name: "عند التشغيل بارد" }).click();
  await page.getByRole("button", { name: "فحص المحرك (ثابت)" }).click();
  await page.click("form button.btn-primary");
  await page.getByText("افحص بالترتيب").waitFor({ timeout: 30_000 });
  await shot("checks");
  const firstCheck = page.getByRole("list", { name: "افحص بالترتيب" }).locator("li").first();
  await firstCheck.getByRole("button", { name: "سليم" }).click();
  await page.getByRole("button", { name: "اعرض النتيجة" }).click();
  await page.getByText("لماذا هذا الحكم").or(page.getByText("الفحص التالي")).first().waitFor({ timeout: 180_000 });
  const urgencyHeading = await page.locator("h2").first().textContent();
  check(`[${viewport.tag}] result shows rules-based urgency`, ["عاجل", "قريبًا", "راقب", "أوقف القيادة", "معلومات غير كافية"].some((u) => urgencyHeading?.includes(u)), urgencyHeading ?? "");
  await shot("result");

  // PDF report.
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), page.getByText("تنزيل PDF").click()]);
  const path = await download.path();
  check(`[${viewport.tag}] PDF report downloads`, Boolean(path) && download.suggestedFilename().endsWith(".pdf"));

  // The deliberate over-limit attempt logs one expected 402.
  const unexpected = errors.filter((e) => !(planLimitHit && /status of 402/.test(e)));
  check(`[${viewport.tag}] no console/page errors`, unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
  // Leave the account as we found it, so repeated runs stay within the plan limit.
  await deleteVehicle(vehicleId);
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
