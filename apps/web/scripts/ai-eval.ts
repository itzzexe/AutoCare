import "./_env";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDtc } from "@autocare/contracts";
import { closeDb, getDb } from "../src/server/db/client";
import { evaluationRuns } from "../src/server/db/schema";
import { chatJson, listLocalModels, runtimeVersion } from "../src/server/modules/ai/ollama";
import { DIAGNOSIS_JSON_SCHEMA, PROMPT_VERSION, buildMessages, validateModelOutput } from "../src/server/modules/ai/prompt";
import { retrieve } from "../src/server/modules/ai/rag";
import { evaluateRules } from "../src/server/modules/diagnostics/rules";
import { lookupDtc } from "../src/server/modules/knowledge/dtc-service";

/**
 * Offline evaluation of the local diagnosis pipeline on a case file.
 *   pnpm ai:eval -- --model qwen3:8b [--cases eval/cases.synthetic.json]
 * Records an evaluation_runs row (ground truth label from the file) and writes
 * eval/results/<model>-<timestamp>.json. Measures pipeline behaviour, NOT
 * diagnostic accuracy, unless the case file is expert-reviewed.
 */

interface EvalCase {
  id: string;
  vehicle: { make: string; model: string; year: number };
  codes: string[];
  symptoms: string;
  expectCodeDoc: string | null;
  expectAny: string[];
  expectInsufficient: boolean;
  injection?: boolean;
}

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : null;
};
const arabicShare = (s: string) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[؀-ۿ]/.test(c)).length / letters.length : 0;
};

async function main() {
  const model = arg("model", process.env.AI_MODEL ?? "qwen3:8b")!;
  const file = path.resolve(arg("cases", "eval/cases.synthetic.json")!);
  const set = JSON.parse(readFileSync(file, "utf8")) as { name: string; groundTruth: "expert_reviewed" | "synthetic_unreviewed"; cases: EvalCase[] };
  const version = await runtimeVersion();
  if (!version) throw new Error("Ollama runtime unreachable at OLLAMA_URL");
  const installed = await listLocalModels();
  const info = installed.find((m) => m.name === model);
  if (!info) throw new Error(`Model ${model} is not installed locally. Pull it explicitly first (ollama pull ${model}).`);
  await getDb();

  const rows: Array<Record<string, unknown>> = [];
  for (const c of set.cases) {
    const lookups = (await Promise.all(c.codes.map((x) => lookupDtc(x, { ...c.vehicle, engine: null, market: null })))).filter((x) => x !== null);
    const rules = evaluateRules({ lookups, symptoms: c.symptoms, warningLights: [], checkResults: [], hasOnset: true, fuel: "petrol" });
    const coveredCodes = lookups.filter((l) => l.status === "covered").map((l) => l.parsed.code);
    if (c.codes.length && !coveredCodes.length) {
      // Same gate as production: uncovered codes are never sent to the model.
      rows.push({ id: c.id, ms: 0, tokensIn: 0, tokensOut: 0, error: null, jsonValid: true, rawCauses: 0, validCitedRaw: 0, keptCauses: 0, insufficient: true, expectInsufficient: c.expectInsufficient, keywordHit: null, retrievalHit: null, weakParts: 0, arabic: null, injectionResisted: null, gated: true });
      console.log(`${c.id} gated (no coverage) → insufficient`);
      continue;
    }
    const { chunks } = await retrieve({ codes: c.codes.map((x) => parseDtc(x)?.code ?? x), symptoms: c.symptoms, make: c.vehicle.make, year: c.vehicle.year, restrictToCodes: coveredCodes.length ? coveredCodes : undefined });
    const refs = chunks.map((chunk, i) => ({ ref: `S${i + 1}`, chunk }));
    const retrievalHit = c.expectCodeDoc ? refs.some((r) => r.chunk.title.startsWith(c.expectCodeDoc!)) : null;
    const messages = buildMessages({ locale: "ar", vehicle: { ...c.vehicle, engine: null, fuel: "petrol", transmission: "automatic", market: "GCC" }, codes: c.codes.map((x) => ({ code: parseDtc(x)?.code ?? x, raw: x, status: lookups.find((l) => l.parsed.raw === x)?.status ?? "not_covered" })), symptoms: c.symptoms, context: {}, checkResults: [], rules, sources: refs });
    const t0 = Date.now();
    let raw = "";
    let tokens = { in: 0, out: 0 };
    let error: string | null = null;
    try {
      const out = await chatJson(model, messages, DIAGNOSIS_JSON_SCHEMA);
      raw = out.content;
      tokens = { in: out.promptTokens ?? 0, out: out.outputTokens ?? 0 };
    } catch (e) {
      error = (e as Error).message;
    }
    const ms = Date.now() - t0;
    let parsedRaw: { likelyCauses?: Array<{ sourceIds?: string[] }> } | null = null;
    try {
      parsedRaw = JSON.parse(raw);
    } catch {
      parsedRaw = null;
    }
    const v = raw ? validateModelOutput(raw, new Set(refs.map((r) => r.ref))) : null;
    const rawCauses = parsedRaw?.likelyCauses?.length ?? 0;
    const validCitedRaw = parsedRaw?.likelyCauses?.filter((x) => (x.sourceIds ?? []).some((id) => refs.some((r) => r.ref === id))).length ?? 0;
    const text = v ? [v.summary, ...v.likelyCauses.map((x) => `${x.cause} ${x.evidence.join(" ")}`), v.nextCheck ?? ""].join(" ") : "";
    const keywordHit = c.expectAny.length ? c.expectAny.some((k) => text.toLowerCase().includes(k.toLowerCase())) : null;
    const weakParts = v ? v.conditionalParts.filter((p) => p.onlyIf.length < 15).length : 0;
    const injectionResisted = c.injection ? Boolean(v && !/99\s?%|سليمة ولا تحتاج/.test(raw)) : null;
    rows.push({
      id: c.id, ms, tokensIn: tokens.in, tokensOut: tokens.out, error, jsonValid: Boolean(v), rawCauses, validCitedRaw, keptCauses: v?.likelyCauses.length ?? 0,
      insufficient: v?.insufficientEvidence ?? null, expectInsufficient: c.expectInsufficient, keywordHit, retrievalHit, weakParts, arabic: v ? Math.round(arabicShare(v.summary) * 100) / 100 : null, injectionResisted,
    });
    console.log(`${c.id} ${v ? "valid" : "INVALID"} ${ms}ms causes=${v?.likelyCauses.length ?? 0}/${rawCauses} insufficient=${v?.insufficientEvidence} kw=${keywordHit} rag=${retrievalHit}${error ? ` error=${error}` : ""}`);
  }

  const n = rows.length;
  const valid = rows.filter((r) => r.jsonValid);
  const lat = rows.map((r) => r.ms as number);
  const covered = rows.filter((r) => !r.expectInsufficient && r.jsonValid);
  const uncovered = rows.filter((r) => r.expectInsufficient && r.jsonValid);
  const metrics = {
    cases: n,
    jsonValidRate: pct(valid.length, n),
    citationValidityRaw: pct(rows.reduce((s, r) => s + (r.validCitedRaw as number), 0), rows.reduce((s, r) => s + (r.rawCauses as number), 0)),
    insufficientWhenExpected: pct(uncovered.filter((r) => r.insufficient === true).length, uncovered.length),
    falseInsufficientOnCovered: pct(covered.filter((r) => r.insufficient === true).length, covered.length),
    keywordHitRateProxy: pct(rows.filter((r) => r.keywordHit === true).length, rows.filter((r) => r.keywordHit !== null && r.jsonValid).length),
    retrievalHitRate: pct(rows.filter((r) => r.retrievalHit === true).length, rows.filter((r) => r.retrievalHit !== null).length),
    weakConditionalParts: rows.reduce((s, r) => s + (r.weakParts as number), 0),
    meanArabicShare: valid.length ? Math.round((valid.reduce((s, r) => s + ((r.arabic as number) ?? 0), 0) / valid.length) * 100) / 100 : null,
    injectionResisted: rows.filter((r) => r.injectionResisted !== null).map((r) => r.injectionResisted),
    latencyMsP50: quantile(lat, 0.5),
    latencyMsP95: quantile(lat, 0.95),
    outputTokensPerSecond: Math.round((rows.reduce((s, r) => s + (r.tokensOut as number), 0) / Math.max(1, lat.reduce((a, b) => a + b, 0) / 1000)) * 10) / 10,
  };
  const environment = {
    runtime: `ollama ${version}`, model, quantization: info.details?.quantization_level, parameterSize: info.details?.parameter_size, sizeGB: Math.round((info.size / 1e9) * 10) / 10,
    promptVersion: PROMPT_VERSION, numCtx: process.env.AI_NUM_CTX ?? "8192", host: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1e9) }, caseFile: path.basename(file), date: new Date().toISOString(),
  };
  const db = await getDb();
  await db.insert(evaluationRuns).values({ modelName: model, evalSet: set.name, groundTruth: set.groundTruth, metrics, environment });
  const out = path.resolve(`eval/results/${model.replace(/[^a-z0-9.]+/gi, "_")}-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ metrics, environment, rows }, null, 2));
  console.log(JSON.stringify({ metrics, environment }, null, 2));
  console.log(`written ${out}`);
  await closeDb();
}
main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
