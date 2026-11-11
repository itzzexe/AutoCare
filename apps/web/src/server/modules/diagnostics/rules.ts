import { searchKey, type Urgency, type WarningLight } from "@autocare/contracts";
import type { CheckStep } from "../../db/schema/knowledge";
import type { DefinitionView, DtcLookupResult } from "../knowledge/dtc-service";

/**
 * Deterministic diagnostic rules. Urgency and safety referral are decided
 * HERE and only here — never by model free text. Every rule has an id so the
 * stored recommendation records exactly which rules fired.
 *
 * These rules are a conservative draft and must be reviewed by a qualified
 * automotive technician before public launch (tracked in docs/RISK_REGISTER).
 */
export const RULES_VERSION = "rules-2026.10-r1";

export type SafetyArea = "brakes" | "steering" | "airbag" | "fuel" | "high_voltage";

export interface RulesInput {
  lookups: DtcLookupResult[];
  symptoms: string;
  warningLights: WarningLight[];
  checkResults: Array<{ checkId: string; result: "pass" | "fail" | "not_done" | "unsure" }>;
  hasOnset: boolean;
  fuel?: string | null;
}

export interface RuleHit {
  id: string;
  urgency: Urgency;
  ar: string;
  en: string;
}

export interface RulesResult {
  version: string;
  urgency: Urgency;
  hits: RuleHit[];
  safetyAreas: SafetyArea[];
  /** When true, only non-invasive observations are offered; everything else is referred to a professional. */
  suppressDiy: boolean;
  orderedChecks: Array<CheckStep & { fromCode: string; status: "pending" | "pass" | "fail" | "not_done" | "unsure" }>;
  nextCheckId: string | null;
  missingInformation: Array<{ id: string; ar: string; en: string }>;
  codeCoverage: Array<{ code: string; status: DtcLookupResult["status"]; explanation: DtcLookupResult["explanation"]; reviewed: boolean }>;
  workshop: { recommended: boolean; specialty: string | null; reasonAr: string; reasonEn: string };
  evidenceCodes: string[];
}

const RANK: Record<Urgency, number> = { insufficient_info: 0, monitor: 1, soon: 2, urgent: 3, stop_driving: 4 };
const max = (a: Urgency, b: Urgency): Urgency => (RANK[b] > RANK[a] ? b : a);

interface SymptomRule {
  id: string;
  urgency: Urgency;
  area?: SafetyArea;
  any: string[];
  ar: string;
  en: string;
}

/** Keyword rules over the normalised symptom text (Arabic + English, incl. Iraqi usage). */
const SYMPTOM_RULES: SymptomRule[] = [
  { id: "S-FUEL-SMELL", urgency: "stop_driving", area: "fuel", any: ["رايحه بانزين", "رايحه بنزين", "ريحه بنزين", "ريحه بانزين", "تسريب بنزين", "تسرب بنزين", "fuel smell", "smell of fuel", "fuel leak", "gas smell"], ar: "رائحة أو تسرّب وقود: خطر حريق.", en: "Fuel smell or leak: fire risk." },
  { id: "S-SMOKE", urgency: "stop_driving", any: ["دخان من المحرك", "دخان من الماطور", "دخان من غطاء", "smoke from engine", "smoke from hood", "smoke under"], ar: "دخان من حجرة المحرك.", en: "Smoke from the engine bay." },
  { id: "S-BRAKE-PEDAL", urgency: "stop_driving", area: "brakes", any: ["دواسه الفرامل تنزل", "الفرامل ما تمسك", "الفرامل ضعيفه", "البريك ما يمسك", "البريك ضعيف", "brake pedal sinks", "brakes not working", "soft brake pedal", "spongy brake"], ar: "ضعف أو فقدان الفرامل.", en: "Weak or failing brakes." },
  { id: "S-BRAKE-NOISE", urgency: "urgent", area: "brakes", any: ["صوت عند الفرامل", "صرير الفرامل", "طقطقه عند البريك", "grinding when braking", "brake grinding", "squeal when braking"], ar: "صوت احتكاك عند الفرملة.", en: "Grinding/squeal when braking." },
  { id: "S-STEERING", urgency: "urgent", area: "steering", any: ["الستيرن ثقيل", "السكان ثقيل", "المقود ثقيل", "التوجيه ثقيل", "steering heavy", "steering stiff", "loss of steering", "steering pulls hard"], ar: "مشكلة في التوجيه.", en: "Steering problem." },
  { id: "S-OVERHEAT", urgency: "stop_driving", any: ["الحراره عاليه", "حراره المحرك ترتفع", "الماطور يحمي", "المحرك يسخن", "overheating", "temperature high", "temp gauge high", "coolant boiling"], ar: "ارتفاع حرارة المحرك.", en: "Engine overheating." },
  { id: "S-HV", urgency: "stop_driving", area: "high_voltage", any: ["الجهد العالي", "البطاريه الهجينه", "كيبل برتقالي", "high voltage", "hybrid battery warning", "orange cable"], ar: "نظام الجهد العالي (هجين/كهربائي).", en: "High-voltage system (hybrid/EV)." },
  { id: "S-AIRBAG", urgency: "urgent", area: "airbag", any: ["الايرباك", "الوساده الهوائيه", "airbag"], ar: "نظام الوسائد الهوائية.", en: "Airbag system." },
];

const LIGHT_RULES: Partial<Record<WarningLight, { id: string; urgency: Urgency; area?: SafetyArea; ar: string; en: string }>> = {
  oil: { id: "L-OIL", urgency: "stop_driving", ar: "ضوء ضغط الزيت: أوقف المحرك بأمان وافحص مستوى الزيت.", en: "Oil-pressure light: stop the engine safely and check the oil level." },
  temp: { id: "L-TEMP", urgency: "stop_driving", ar: "ضوء الحرارة: أوقف المحرك ولا تفتح غطاء الرديتر وهو حار.", en: "Temperature light: stop; never open a hot radiator cap." },
  brake: { id: "L-BRAKE", urgency: "stop_driving", area: "brakes", ar: "ضوء الفرامل الأحمر: لا تقد السيارة حتى تُفحص.", en: "Red brake light: do not drive until inspected." },
  ev_system: { id: "L-EV", urgency: "stop_driving", area: "high_voltage", ar: "تحذير نظام الجهد العالي: لا تلمس الكيبلات البرتقالية.", en: "High-voltage warning: do not touch orange cables." },
  check_engine_flashing: { id: "L-MIL-FLASH", urgency: "urgent", ar: "ضوء المحرك يومض: احتراق غير سليم قد يتلف المحفّز؛ خفف الحمل وتوجّه للفحص.", en: "Flashing engine light: severe misfire can damage the catalyst; reduce load and get it checked." },
  airbag: { id: "L-SRS", urgency: "urgent", area: "airbag", ar: "ضوء الوسائد الهوائية: قد لا تعمل عند الحادث.", en: "Airbag light: airbags may not deploy." },
  abs: { id: "L-ABS", urgency: "urgent", area: "brakes", ar: "ضوء ABS: الفرامل العادية قد تعمل لكن منع الانغلاق معطّل.", en: "ABS light: base brakes may work but anti-lock is disabled." },
  steering: { id: "L-EPS", urgency: "urgent", area: "steering", ar: "ضوء نظام التوجيه.", en: "Steering system warning." },
  battery: { id: "L-CHARGE", urgency: "soon", ar: "ضوء الشحن: قد تتوقف السيارة عند نفاد البطارية.", en: "Charging light: the car may stall when the battery runs down." },
  check_engine: { id: "L-MIL", urgency: "soon", ar: "ضوء فحص المحرك ثابت.", en: "Steady check-engine light." },
  tpms: { id: "L-TPMS", urgency: "soon", ar: "ضوء ضغط الإطارات.", en: "Tyre-pressure light." },
};

const SPECIALTY_BY_SYSTEM: Record<string, string> = { powertrain: "engine", chassis: "brakes", body: "electrical", network: "diagnostics" };

export function evaluateRules(input: RulesInput): RulesResult {
  const hits: RuleHit[] = [];
  const areas = new Set<SafetyArea>();
  let urgency: Urgency = "insufficient_info";

  const symptomKey = searchKey(input.symptoms);
  for (const r of SYMPTOM_RULES) {
    if (r.any.some((k) => symptomKey.includes(searchKey(k)))) {
      hits.push({ id: r.id, urgency: r.urgency, ar: r.ar, en: r.en });
      urgency = max(urgency, r.urgency);
      if (r.area) areas.add(r.area);
    }
  }
  for (const l of input.warningLights) {
    const r = LIGHT_RULES[l];
    if (r) {
      hits.push({ id: r.id, urgency: r.urgency, ar: r.ar, en: r.en });
      urgency = max(urgency, r.urgency);
      if (r.area) areas.add(r.area);
    }
  }
  if ((input.fuel === "hybrid" || input.fuel === "phev" || input.fuel === "ev") && input.lookups.some((l) => l.definitions.some((d) => d.safetyArea === "high_voltage"))) {
    areas.add("high_voltage");
  }

  const coveredDefs: Array<{ code: string; def: DefinitionView }> = [];
  for (const l of input.lookups) {
    for (const d of l.definitions) {
      coveredDefs.push({ code: l.parsed.code, def: d });
      if (d.safetyArea !== "none") {
        areas.add(d.safetyArea);
        hits.push({ id: `D-SAFETY-${d.safetyArea}`, urgency: "urgent", ar: `الكود ${l.parsed.code} يخص نظام سلامة.`, en: `Code ${l.parsed.code} concerns a safety system.` });
        urgency = max(urgency, "urgent");
      } else {
        urgency = max(urgency, d.baseUrgency);
      }
    }
  }

  const codeCoverage = input.lookups.map((l) => ({
    code: l.parsed.code,
    status: l.status,
    explanation: l.explanation,
    reviewed: l.definitions.some((d) => d.reviewStatus === "reviewed"),
  }));

  // Ordered checks: merge, de-duplicate by id, least invasive first; home before workshop.
  const results = new Map(input.checkResults.map((c) => [c.checkId, c.result]));
  const whereRank = { home: 0, workshop: 1, specialist: 2 } as const;
  const suppressDiy = areas.size > 0;
  const seen = new Set<string>();
  const orderedChecks = coveredDefs
    .flatMap(({ code, def }) => def.checks.map((c) => ({ ...c, fromCode: code })))
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    // In safety-critical areas, only visual/non-invasive owner checks remain.
    .filter((c) => !suppressDiy || c.where !== "home" || c.invasiveness <= 1)
    .sort((a, b) => whereRank[a.where] - whereRank[b.where] || a.invasiveness - b.invasiveness)
    .map((c) => ({ ...c, status: (results.get(c.id) ?? "pending") as RulesResult["orderedChecks"][number]["status"] }));
  const nextCheckId = orderedChecks.find((c) => c.status === "pending" && (!suppressDiy || c.where !== "home" || c.invasiveness <= 1))?.id ?? null;

  const missing: RulesResult["missingInformation"] = [];
  if (!input.lookups.length) missing.push({ id: "M-CODES", ar: "لا توجد أكواد أعطال. قراءة الأكواد بجهاز OBD تساعد كثيرًا.", en: "No trouble codes. Reading codes with an OBD scanner helps a lot." });
  if (!input.hasOnset) missing.push({ id: "M-ONSET", ar: "متى بدأت المشكلة وكيف ظهرت؟", en: "When and how did the problem start?" });
  if (input.lookups.some((l) => l.status !== "covered")) missing.push({ id: "M-COVERAGE", ar: "بعض الأكواد غير مغطاة لهذه السيارة في مصادرنا.", en: "Some codes are not covered for this vehicle in our sources." });
  if (input.lookups.some((l) => l.status === "covered" && !l.definitions.some((d) => d.reviewStatus === "reviewed"))) {
    missing.push({ id: "M-UNREVIEWED", ar: "تعريفات بعض الأكواد مسودة لم يراجعها فني بعد.", en: "Some code definitions are drafts not yet reviewed by a technician." });
  }

  if (urgency === "insufficient_info" && input.symptoms.trim().length > 0 && coveredDefs.length === 0 && hits.length === 0) {
    // Only symptoms, nothing matched: still insufficient — do not guess.
    urgency = "insufficient_info";
  }

  const topSystem = coveredDefs[0]?.def.system;
  const specialty = areas.has("brakes") ? "brakes" : areas.has("high_voltage") ? "hybrid_ev" : areas.has("airbag") ? "electrical" : areas.has("steering") ? "suspension" : topSystem ? SPECIALTY_BY_SYSTEM[topSystem] ?? null : null;
  const workshopRecommended = RANK[urgency] >= RANK.urgent || suppressDiy || orderedChecks.some((c) => c.where !== "home");

  return {
    version: RULES_VERSION,
    urgency,
    hits,
    safetyAreas: [...areas],
    suppressDiy,
    orderedChecks,
    nextCheckId,
    missingInformation: missing,
    codeCoverage,
    workshop: {
      recommended: workshopRecommended,
      specialty,
      reasonAr: suppressDiy ? "المشكلة تمس نظام سلامة؛ الفحص والإصلاح لدى مختص." : workshopRecommended ? "بعض الفحوص تحتاج أدوات ورشة." : "يمكن البدء بفحوص منزلية بسيطة.",
      reasonEn: suppressDiy ? "This touches a safety system; inspection and repair by a professional." : workshopRecommended ? "Some checks need workshop tools." : "You can start with simple home checks.",
    },
    evidenceCodes: coveredDefs.map((c) => c.code),
  };
}
