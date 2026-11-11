import type { CheckStep, LocalisedItem } from "../schema/knowledge";
import type { SeedDtc } from "./generic-dtc";

/**
 * AutoCare editorial library v0.2 — GENERIC SAE J2012 / ISO 15031-6 codes
 * generated from code FAMILIES (sensor circuits, per-cylinder/per-coil codes,
 * transmission solenoids, network codes …). Titles follow the standard generic
 * naming pattern; meanings, causes, checks and fixes are family-level general
 * knowledge written by the project. Everything is an UNREVIEWED DRAFT and is
 * labelled as such in the UI. Manufacturer-specific codes are deliberately not
 * included (they need licensed manufacturer data).
 *
 * Only families whose generic numbering is well established are generated;
 * uncertain ranges were left out rather than guessed.
 */

export interface SeedDtcWithFixes extends SeedDtc {
  fixes: LocalisedItem[];
}

const s = (ar: string, en: string): LocalisedItem => ({ ar, en });
const chk = (id: string, where: CheckStep["where"], inv: number, ar: string, en: string, expAr: string, expEn: string, tools: string[] = [], onFailAr?: string, onFailEn?: string): CheckStep => ({
  id, where, invasiveness: inv, ar, en, expectedAr: expAr, expectedEn: expEn, tools, onFailAr, onFailEn,
});
const dec = (n: number) => String(n).padStart(4, "0");
const P = (n: number) => `P${dec(n)}`;

// ---------------------------------------------------------------- shared checks
const C = {
  scan: chk("scan-freeze-frame", "home", 0, "اقرأ الأكواد مع بيانات Freeze Frame بجهاز OBD-II وسجّلها قبل أي مسح.", "Read the codes with freeze-frame data using an OBD-II scanner and note them before clearing anything.", "تعرف الظروف التي ظهر فيها العطل.", "You learn the conditions when the fault set.", ["OBD-II scanner"]),
  connector: (id: string, partAr: string, partEn: string) => chk(`connector-${id}`, "home", 1, `افحص بصريًا موصل وأسلاك ${partAr} والمحرك مطفأ: تأكسد، دبابيس مرتخية، أسلاك مقطوعة أو محروقة.`, `With the engine off, visually inspect the ${partEn} connector and wiring for corrosion, loose pins, cut or burnt wires.`, "الموصل مثبت ونظيف والأسلاك سليمة.", "Connector seated and clean, wiring intact.", ["Flashlight"]),
  live: (id: string, partAr: string, partEn: string) => chk(`live-${id}`, "workshop", 2, `راقب قراءة ${partAr} في البيانات الحية وقارنها بالحالة الفعلية (محرك بارد/حار، خمول/دعس).`, `Watch the ${partEn} reading in live data and compare it with the real conditions (cold/hot, idle/load).`, "القراءة منطقية وتتغير بسلاسة.", "The reading is plausible and changes smoothly.", ["Scan tool with live data"]),
  circuit: (id: string, partAr: string, partEn: string) => chk(`circuit-${id}`, "workshop", 3, `قِس جهد التغذية المرجعي والأرضي والإشارة في دائرة ${partAr} حسب المخطط الكهربائي.`, `Measure reference voltage, ground and signal of the ${partEn} circuit against the wiring diagram.`, "القيم ضمن المواصفة ولا يوجد قصر أو قطع.", "Values within spec; no short or open.", ["Multimeter", "Wiring diagram"]),
  wiggle: (id: string, partAr: string, partEn: string) => chk(`wiggle-${id}`, "workshop", 2, `حرّك أسلاك ${partAr} أثناء مراقبة القراءة الحية لاكتشاف الانقطاع المتقطع.`, `Wiggle the ${partEn} wiring while watching live data to find an intermittent break.`, "لا تقفز القراءة عند تحريك الأسلاك.", "The reading does not jump while wiggling.", ["Scan tool"]),
  battery: chk("battery-voltage", "home", 1, "قِس جهد البطارية والمحرك مطفأ ثم وهو يعمل.", "Measure battery voltage engine-off and running.", "حوالي 12.4–12.7 فولت مطفأ و13.5–14.7 فولت أثناء التشغيل في أغلب السيارات.", "About 12.4–12.7 V off and 13.5–14.7 V running on most cars.", ["Multimeter"]),
  fluidAtf: chk("atf-level", "workshop", 2, "افحص مستوى وحالة زيت القير حسب إجراء الشركة المصنّعة (بعض القيرات بلا عصا قياس).", "Check transmission fluid level and condition per the manufacturer procedure (some have no dipstick).", "المستوى صحيح والزيت غير محروق وبلا رائحة.", "Correct level, not burnt, no burnt smell.", []),
  readTcm: chk("read-tcm", "workshop", 1, "اقرأ أكواد وحدة ناقل الحركة (TCM) بجهاز يدعمها.", "Read transmission module (TCM) codes with a capable scanner.", "الحصول على الكود المحدد والبيانات الحية للقير.", "Get the specific code and live transmission data.", ["Scan tool with TCM access"]),
  coolantCold: chk("coolant-level-cold", "home", 1, "افحص مستوى سائل التبريد والمحرك بارد فقط.", "Check coolant level with the engine COLD only.", "بين MIN وMAX.", "Between MIN and MAX.", [], "لا تفتح غطاء الرديتر والمحرك حار.", "Never open the radiator cap when hot."),
};

const confirmFix = s("امسح الأكواد بعد الإصلاح وقُد السيارة دورة اختبار للتأكد أن الكود لم يعد.", "Clear codes after the repair and do a test drive to confirm the code does not return.");

// ---------------------------------------------------------------- sensor circuit families
type State = "circuit" | "range" | "low" | "high" | "intermittent" | "nosignal";
const STATE_TITLE: Record<State, { en: string; ar: string }> = {
  circuit: { en: "Circuit", ar: "خلل في الدائرة" },
  range: { en: "Circuit Range/Performance", ar: "القراءة خارج المدى المتوقع" },
  low: { en: "Circuit Low", ar: "إشارة الدائرة منخفضة" },
  high: { en: "Circuit High", ar: "إشارة الدائرة مرتفعة" },
  intermittent: { en: "Circuit Intermittent", ar: "انقطاع متقطع في الدائرة" },
  nosignal: { en: "Circuit No Signal", ar: "لا توجد إشارة" },
};
const STATE_MEANING: Record<State, { ar: string; en: string }> = {
  circuit: { ar: "وحدة التحكم رصدت خللًا كهربائيًا في دائرة الحساس.", en: "The control module detected an electrical fault in the sensor circuit." },
  range: { ar: "الإشارة موجودة لكن قيمتها لا تتوافق مع ما تتوقعه وحدة التحكم من باقي الحساسات.", en: "The signal is present but its value does not agree with what the module expects from other sensors." },
  low: { ar: "جهد الإشارة أقل من الحد المسموح، وغالبًا يعني قصرًا إلى الأرضي أو قطعًا في التغذية أو حساسًا تالفًا.", en: "Signal voltage is below the allowed limit, often a short to ground, a lost reference or a failed sensor." },
  high: { ar: "جهد الإشارة أعلى من الحد المسموح، وغالبًا يعني دائرة مفتوحة أو قصرًا إلى التغذية أو موصلًا مفصولًا.", en: "Signal voltage is above the allowed limit, often an open circuit, short to voltage or an unplugged connector." },
  intermittent: { ar: "الإشارة تنقطع أو تقفز بشكل متقطع، وغالبًا السبب موصل أو سلك مرتخٍ.", en: "The signal drops out or jumps intermittently, usually a loose connector or wire." },
  nosignal: { ar: "وحدة التحكم لا تستقبل أي إشارة من الحساس.", en: "The module receives no signal at all from the sensor." },
};

interface SensorDef {
  key: string;
  nameEn: string;
  nameAr: string;
  system?: SeedDtc["system"];
  symptoms: LocalisedItem[];
  extraCauses?: LocalisedItem[];
  urgency?: SeedDtc["baseUrgency"];
  safety?: SeedDtc["safetyArea"];
  skill?: SeedDtc["skillLevel"];
  codes: Array<[number, State]>;
  replaceFixAr?: string;
  replaceFixEn?: string;
}

function sensorFamily(d: SensorDef): SeedDtcWithFixes[] {
  return d.codes.map(([n, st]) => ({
    code: P(n),
    system: d.system ?? "powertrain",
    titleEn: `${d.nameEn} ${STATE_TITLE[st].en}`,
    titleAr: `${d.nameAr}: ${STATE_TITLE[st].ar}`,
    meaningAr: `${STATE_MEANING[st].ar} الحساس المعني: ${d.nameAr}.`,
    meaningEn: `${STATE_MEANING[st].en} Sensor concerned: ${d.nameEn}.`,
    symptoms: [...d.symptoms, s("ضوء فحص المحرك", "Check-engine light")],
    causes: [
      ...(st === "range" ? [s("الحساس يعطي قراءة خاطئة (متسخ أو ضعيف)", "Sensor reading inaccurate (dirty or weak)")] : []),
      s("موصل مرتخٍ أو متأكسد", "Loose or corroded connector"),
      s("سلك مقطوع أو قصر في الدائرة", "Broken wire or short in the circuit"),
      s(`${d.nameAr} تالف`, `Failed ${d.nameEn}`),
      ...(st === "low" || st === "high" ? [s("مشكلة في جهد التغذية المرجعي (5 فولت) لوحدة التحكم", "Problem with the module's 5 V reference supply")] : []),
      ...(d.extraCauses ?? []),
    ],
    checks: [C.scan, C.connector(d.key, d.nameAr, d.nameEn), C.live(d.key, d.nameAr, d.nameEn), ...(st === "intermittent" ? [C.wiggle(d.key, d.nameAr, d.nameEn)] : []), C.circuit(d.key, d.nameAr, d.nameEn)],
    fixes: [
      s("إصلاح الموصل أو الأسلاك التالفة إن وُجدت", "Repair the damaged connector or wiring if found"),
      s(d.replaceFixAr ?? `استبدال ${d.nameAr} فقط إذا ثبت أنه خارج المواصفة بالقياس`, d.replaceFixEn ?? `Replace the ${d.nameEn} only if measurement proves it is out of spec`),
      confirmFix,
    ],
    skillLevel: d.skill ?? "intermediate",
    safetyArea: d.safety,
    baseUrgency: d.urgency ?? "soon",
  }));
}

const lowPower = s("ضعف في الأداء أو العزم", "Reduced power or performance");
const roughIdle = s("خمول غير مستقر", "Rough or unstable idle");
const fuelUse = s("ارتفاع استهلاك الوقود", "Higher fuel consumption");
const hardStart = s("صعوبة في التشغيل", "Hard starting");
const shifting = s("تبديل قاسٍ أو متأخر أو وضع الطوارئ", "Harsh/late shifting or limp mode");

const SENSORS: SensorDef[] = [
  { key: "maf", nameEn: "Mass or Volume Air Flow Sensor \"A\"", nameAr: "حساس تدفق الهواء (MAF)", symptoms: [lowPower, roughIdle, hardStart], extraCauses: [s("تسريب هواء أو فلتر هواء مسدود", "Air leak or clogged air filter")], codes: [[100, "circuit"], [102, "low"], [103, "high"], [104, "intermittent"]], replaceFixAr: "تنظيف الحساس بمنظف MAF مخصص، ثم الاستبدال فقط إذا بقيت القراءة خاطئة", replaceFixEn: "Clean the sensor with dedicated MAF cleaner; replace only if the reading stays wrong" },
  { key: "map", nameEn: "Manifold Absolute Pressure/Barometric Pressure Sensor \"A\"", nameAr: "حساس ضغط مجمع السحب (MAP)", symptoms: [lowPower, roughIdle, fuelUse], extraCauses: [s("خرطوم فاكيوم الحساس مشقوق أو مفصول", "Cracked or disconnected sensor vacuum hose")], codes: [[105, "circuit"], [106, "range"], [107, "low"], [108, "high"], [109, "intermittent"]] },
  { key: "iat", nameEn: "Intake Air Temperature Sensor 1", nameAr: "حساس حرارة هواء السحب (IAT)", symptoms: [hardStart, fuelUse], codes: [[110, "circuit"], [111, "range"], [112, "low"], [113, "high"], [114, "intermittent"]], urgency: "monitor" },
  { key: "ect", nameEn: "Engine Coolant Temperature Sensor 1", nameAr: "حساس حرارة سائل التبريد (ECT)", symptoms: [hardStart, s("مروحة الرديتر تعمل باستمرار", "Radiator fan runs constantly"), s("قراءة حرارة غير منطقية", "Implausible temperature reading")], extraCauses: [s("مستوى سائل تبريد منخفض أو ثرموستات عالق", "Low coolant or stuck thermostat")], codes: [[115, "circuit"], [116, "range"], [117, "low"], [119, "intermittent"]] },
  { key: "tps-a", nameEn: "Throttle/Pedal Position Sensor/Switch \"A\"", nameAr: "حساس موضع الخانق/الدواسة (A)", symptoms: [lowPower, s("تقطيع أو تأخر عند الدعس", "Hesitation or delayed response"), s("وضع الطوارئ (عزم محدود)", "Limp mode (reduced power)")], codes: [[120, "circuit"], [121, "range"], [122, "low"], [123, "high"], [124, "intermittent"]], urgency: "urgent" },
  { key: "tps-b", nameEn: "Throttle/Pedal Position Sensor/Switch \"B\"", nameAr: "حساس موضع الخانق/الدواسة (B)", symptoms: [lowPower, s("وضع الطوارئ (عزم محدود)", "Limp mode (reduced power)")], codes: [[220, "circuit"], [221, "range"], [222, "low"], [223, "high"], [224, "intermittent"]], urgency: "urgent" },
  { key: "aat", nameEn: "Ambient Air Temperature Sensor", nameAr: "حساس حرارة الجو الخارجي", symptoms: [s("قراءة حرارة الجو خاطئة", "Wrong outside temperature reading"), s("تأثر عمل المكيف التلقائي", "Automatic A/C behaves oddly")], codes: [[70, "circuit"], [71, "range"], [72, "low"], [73, "high"], [74, "intermittent"]], urgency: "monitor", skill: "intermediate" },
  { key: "fuel-temp", nameEn: "Fuel Temperature Sensor \"A\"", nameAr: "حساس حرارة الوقود", symptoms: [hardStart], codes: [[180, "circuit"], [181, "range"], [182, "low"], [183, "high"], [184, "intermittent"]], urgency: "monitor" },
  { key: "frp", nameEn: "Fuel Rail Pressure Sensor \"A\"", nameAr: "حساس ضغط سكة الوقود", symptoms: [hardStart, lowPower, s("انطفاء أحيانًا", "Occasional stalling")], codes: [[190, "circuit"], [191, "range"], [192, "low"], [193, "high"], [194, "intermittent"]], urgency: "urgent", safety: "fuel", skill: "workshop" },
  { key: "boost", nameEn: "Turbocharger/Supercharger Boost Sensor \"A\"", nameAr: "حساس ضغط التيربو (Boost)", symptoms: [lowPower, s("وضع الطوارئ", "Limp mode")], extraCauses: [s("خرطوم التيربو مفصول أو مثقوب", "Disconnected or split boost hose")], codes: [[235, "circuit"], [236, "range"], [237, "low"], [238, "high"]], skill: "workshop" },
  { key: "fuel-level", nameEn: "Fuel Level Sensor \"A\"", nameAr: "حساس مستوى الوقود (العوامة)", system: "powertrain", symptoms: [s("مؤشر الوقود غير دقيق أو يقفز", "Fuel gauge inaccurate or jumping")], codes: [[460, "circuit"], [461, "range"], [462, "low"], [463, "high"]], urgency: "monitor", skill: "workshop", replaceFixAr: "استبدال وحدة العوامة فقط بعد تأكيد العطل؛ العمل داخل خزان الوقود لدى ورشة", replaceFixEn: "Replace the sender only once confirmed; work inside the fuel tank belongs in a workshop" },
  { key: "oil-press", nameEn: "Engine Oil Pressure Sensor/Switch \"A\"", nameAr: "حساس/مفتاح ضغط الزيت", symptoms: [s("ضوء ضغط الزيت يومض أو يبقى مضاءً", "Oil-pressure light flickers or stays on")], extraCauses: [s("ضغط زيت منخفض فعلًا (مستوى منخفض أو مضخة ضعيفة)", "Genuinely low oil pressure (low level or weak pump)")], codes: [[520, "circuit"], [521, "range"], [522, "low"], [523, "high"]], urgency: "urgent", skill: "workshop" },
  { key: "ac-press", nameEn: "A/C Refrigerant Pressure Sensor \"A\"", nameAr: "حساس ضغط غاز المكيف", symptoms: [s("المكيف لا يبرد أو الكمبريسر لا يشتغل", "A/C not cooling or compressor not engaging")], extraCauses: [s("غاز التبريد ناقص", "Low refrigerant charge")], codes: [[530, "circuit"], [531, "range"], [532, "low"], [533, "high"]], urgency: "monitor", skill: "workshop" },
  { key: "knock-1", nameEn: "Knock Sensor 1 (Bank 1 or Single Sensor)", nameAr: "حساس الطرق (Knock) 1 — البنك 1", symptoms: [lowPower, fuelUse, s("طقطقة عند الدعس أحيانًا", "Occasional pinging under load")], codes: [[325, "circuit"], [326, "range"], [327, "low"], [328, "high"]], skill: "workshop" },
  { key: "knock-2", nameEn: "Knock Sensor 2 (Bank 2)", nameAr: "حساس الطرق (Knock) 2 — البنك 2", symptoms: [lowPower, fuelUse], codes: [[330, "circuit"], [331, "range"], [332, "low"], [333, "high"]], skill: "workshop" },
  { key: "ckp", nameEn: "Crankshaft Position Sensor \"A\"", nameAr: "حساس موضع عمود الكرنك", symptoms: [s("انطفاء مفاجئ", "Sudden stalling"), s("صعوبة أو عدم تشغيل", "Hard or no start")], codes: [[336, "range"], [337, "low"], [338, "high"], [339, "intermittent"]], urgency: "urgent", skill: "workshop" },
  { key: "cmp-a1", nameEn: "Camshaft Position Sensor \"A\" (Bank 1 or Single Sensor)", nameAr: "حساس موضع عمود الكامات (A) — البنك 1", symptoms: [hardStart, lowPower], extraCauses: [s("توقيت المحرك خارج الضبط (سير/جنزير)", "Engine timing out of spec (belt/chain)")], codes: [[341, "range"], [342, "low"], [343, "high"], [344, "intermittent"]], skill: "workshop" },
  { key: "cmp-a2", nameEn: "Camshaft Position Sensor \"A\" (Bank 2)", nameAr: "حساس موضع عمود الكامات (A) — البنك 2", symptoms: [hardStart, lowPower], codes: [[345, "circuit"], [346, "range"], [347, "low"], [348, "high"], [349, "intermittent"]], skill: "workshop" },
  { key: "cmp-b1", nameEn: "Camshaft Position Sensor \"B\" (Bank 1)", nameAr: "حساس موضع عمود الكامات (B) — البنك 1", symptoms: [hardStart, lowPower], codes: [[365, "circuit"], [366, "range"], [367, "low"], [368, "high"], [369, "intermittent"]], skill: "workshop" },
  { key: "vss", nameEn: "Vehicle Speed Sensor \"A\"", nameAr: "حساس سرعة المركبة", symptoms: [s("عداد السرعة لا يعمل", "Speedometer not working"), shifting], codes: [[501, "range"], [502, "low"], [503, "intermittent"]], skill: "workshop" },
  { key: "evap-press", nameEn: "Evaporative Emission System Pressure Sensor/Switch", nameAr: "حساس ضغط نظام EVAP", symptoms: [], codes: [[450, "circuit"], [451, "range"], [452, "low"], [453, "high"]], urgency: "monitor", skill: "workshop" },
  { key: "egr-sensor", nameEn: "Exhaust Gas Recirculation Sensor \"A\"", nameAr: "حساس نظام EGR", symptoms: [roughIdle], codes: [[405, "low"], [406, "high"]], skill: "workshop" },
  { key: "tft", nameEn: "Transmission Fluid Temperature Sensor \"A\"", nameAr: "حساس حرارة زيت القير", system: "powertrain", symptoms: [shifting], codes: [[710, "circuit"], [711, "range"], [712, "low"], [713, "high"]], skill: "workshop" },
  { key: "tss", nameEn: "Input/Turbine Speed Sensor \"A\"", nameAr: "حساس سرعة دخول القير (Turbine)", symptoms: [shifting], codes: [[715, "circuit"], [716, "range"], [717, "nosignal"]], skill: "workshop", urgency: "urgent" },
  { key: "oss", nameEn: "Output Shaft Speed Sensor", nameAr: "حساس سرعة خروج القير", symptoms: [shifting, s("عداد السرعة لا يعمل أحيانًا", "Speedometer may stop working")], codes: [[720, "circuit"], [721, "range"], [722, "nosignal"]], skill: "workshop", urgency: "urgent" },
  { key: "trs", nameEn: "Transmission Range Sensor \"A\" (PRNDL Input)", nameAr: "حساس وضع ذراع القير (PRNDL)", symptoms: [s("السيارة لا تشتغل في وضع P/N أحيانًا", "Car may not start in P/N"), s("مؤشر الغيار خاطئ", "Wrong gear indication")], codes: [[705, "circuit"], [706, "range"]], skill: "workshop", urgency: "urgent" },
];

// ---------------------------------------------------------------- per-cylinder / per-bank families
function misfires(): SeedDtcWithFixes[] {
  const out: SeedDtcWithFixes[] = [];
  for (let n = 2; n <= 12; n++) {
    out.push({
      code: P(300 + n), system: "powertrain", baseUrgency: "urgent", skillLevel: "intermediate",
      titleEn: `Cylinder ${n} Misfire Detected`, titleAr: `احتراق ناقص في الأسطوانة ${n}`,
      meaningAr: `رُصد احتراق ناقص في الأسطوانة رقم ${n}. ترقيم الأسطوانات يختلف بين المحركات؛ راجع ترتيبها لمحركك. الاحتراق الناقص المستمر قد يتلف المحفّز.`,
      meaningEn: `A misfire was detected in cylinder ${n}. Cylinder numbering differs between engines; check your engine's layout. Sustained misfire can damage the catalytic converter.`,
      symptoms: [roughIdle, s("رجفة وضعف تسارع", "Shaking and hesitation"), s("ضوء المحرك قد يومض", "Check-engine light may flash")],
      causes: [s(`بوجي الأسطوانة ${n}`, `Cylinder ${n} spark plug`), s(`كويل الأسطوانة ${n}`, `Cylinder ${n} ignition coil`), s(`بخاخ الأسطوانة ${n}`, `Cylinder ${n} injector`), s("تسريب هواء قرب الأسطوانة", "Intake leak near the cylinder"), s("كمبريشن منخفض", "Low compression")],
      checks: [C.scan,
        chk("swap-coil", "workshop", 3, `بدّل كويل الأسطوانة ${n} مع أسطوانة مجاورة وامسح الأكواد ثم أعد الاختبار.`, `Swap the cylinder ${n} coil with a neighbour, clear codes and retest.`, "إذا انتقل العطل فالكويل هو السبب.", "If the misfire moves, the coil is at fault.", ["Basic hand tools"]),
        chk("inspect-plug", "workshop", 3, "فك البوجي وافحص الفجوة والترسبات واللون.", "Remove and inspect the spark plug (gap, deposits, colour).", "لون فاتح وفجوة ضمن المواصفة.", "Light colour, gap within spec.", ["Spark plug socket", "Feeler gauge"]),
        chk("injector-balance", "workshop", 3, "اختبار البخاخ (مقاومة/صوت النقر/اختبار توازن البخاخات).", "Test the injector (resistance, click, injector balance test).", "البخاخ يعمل مثل البقية.", "Injector behaves like the others.", ["Multimeter", "Scan tool"]),
        chk("compression-test", "workshop", 4, "اختبار الكمبريشن أو Leak-down للأسطوانة.", "Compression or leak-down test on the cylinder.", "قريب من باقي الأسطوانات.", "Close to the other cylinders.", ["Compression gauge"])],
      fixes: [s("استبدال البوجي إذا كان متآكلًا أو خارج المواصفة (يفضّل الطقم كاملًا)", "Replace the spark plug if worn/out of spec (preferably the set)"), s("استبدال الكويل إذا انتقل العطل معه", "Replace the coil if the misfire followed it"), s("تنظيف أو استبدال البخاخ إذا ثبت عطله", "Clean or replace the injector if proven faulty"), confirmFix],
    });
  }
  out.push({
    code: "P0313", system: "powertrain", baseUrgency: "soon", skillLevel: "diy", titleEn: "Misfire Detected with Low Fuel", titleAr: "احتراق ناقص مع انخفاض مستوى الوقود",
    meaningAr: "رُصد احتراق ناقص بينما الخزان شبه فارغ؛ قد تسحب المضخة هواءً.", meaningEn: "Misfire detected while the tank was nearly empty; the pump may draw air.",
    symptoms: [roughIdle], causes: [s("مستوى وقود منخفض جدًا", "Very low fuel level"), s("مضخة وقود ضعيفة", "Weak fuel pump")],
    checks: [C.scan, chk("refuel", "home", 0, "املأ الخزان وراقب هل يتكرر العطل.", "Refuel and see whether the fault returns.", "لا يعود الكود بعد التعبئة.", "Code does not return after refuelling.", [])],
    fixes: [s("الحفاظ على ربع خزان على الأقل", "Keep at least a quarter tank"), confirmFix],
  });
  return out;
}

function coils(): SeedDtcWithFixes[] {
  const letters = "ABCDEFGHIJKL";
  const out: SeedDtcWithFixes[] = [];
  for (let i = 0; i < 12; i++) {
    const L = letters[i]!;
    out.push({
      code: P(351 + i), system: "powertrain", baseUrgency: "urgent", skillLevel: "intermediate",
      titleEn: `Ignition Coil "${L}" Primary/Secondary Circuit`, titleAr: `دائرة ملف الإشعال (الكويل) ${L}`,
      meaningAr: `خلل كهربائي في دائرة الكويل ${L} (يقابل الأسطوانة ${i + 1} في أغلب المحركات). غالبًا يصاحبه احتراق ناقص.`,
      meaningEn: `Electrical fault in ignition coil "${L}" circuit (cylinder ${i + 1} on most engines). Usually accompanied by a misfire.`,
      symptoms: [roughIdle, s("رجفة وضعف", "Shaking and weakness")],
      causes: [s("الكويل تالف", "Failed coil"), s("موصل الكويل مرتخٍ أو متأكسد", "Loose/corroded coil connector"), s("سلك تحكم مقطوع", "Broken control wire"), s("مشكلة في دائرة التحكم داخل وحدة المحرك (نادر)", "Driver fault inside the ECM (rare)")],
      checks: [C.scan, C.connector(`coil-${L}`, `الكويل ${L}`, `coil ${L}`), chk("swap-coil", "workshop", 3, "بدّل الكويل مع أسطوانة أخرى ولاحظ انتقال الكود.", "Swap the coil with another cylinder and see if the code follows.", "إذا انتقل الكود فالكويل هو السبب.", "If the code follows, the coil is at fault.", ["Basic hand tools"]), C.circuit(`coil-${L}`, `الكويل ${L}`, `coil ${L}`)],
      fixes: [s("إصلاح الموصل أو السلك", "Repair connector or wire"), s("استبدال الكويل إذا انتقل الكود معه", "Replace the coil if the code followed it"), confirmFix],
    });
  }
  out.push({ ...out[0]!, code: "P0350", titleEn: "Ignition Coil Primary/Secondary Circuit", titleAr: "دائرة ملفات الإشعال (عام)", meaningAr: "خلل في دائرة أحد ملفات الإشعال دون تحديد الأسطوانة.", meaningEn: "Fault in an ignition coil circuit without a specific cylinder." });
  // Coil primary control circuit low/high: P2300 + 3*(n-1) low, +1 high
  for (let i = 0; i < 12; i++) {
    const L = letters[i]!;
    for (const [off, st] of [[0, "low"], [1, "high"]] as const) {
      out.push({
        code: P(2300 + 3 * i + off), system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop",
        titleEn: `Ignition Coil "${L}" Primary Control Circuit ${st === "low" ? "Low" : "High"}`, titleAr: `دائرة التحكم الأولية للكويل ${L}: إشارة ${st === "low" ? "منخفضة" : "مرتفعة"}`,
        meaningAr: `جهد دائرة التحكم الأولية للكويل ${L} ${st === "low" ? "منخفض (قصر إلى الأرضي غالبًا)" : "مرتفع (دائرة مفتوحة أو قصر إلى التغذية)"}.`,
        meaningEn: `Coil "${L}" primary control circuit voltage is ${st === "low" ? "low (often short to ground)" : "high (open or short to voltage)"}.`,
        symptoms: [roughIdle], causes: [s("أسلاك الكويل", "Coil wiring"), s("الكويل تالف", "Failed coil"), s("وحدة المحرك (نادر)", "ECM (rare)")],
        checks: [C.scan, C.connector(`coil-${L}`, `الكويل ${L}`, `coil ${L}`), C.circuit(`coil-${L}`, `الكويل ${L}`, `coil ${L}`)],
        fixes: [s("إصلاح الأسلاك أولًا ثم استبدال الكويل إن لزم", "Fix wiring first, then replace the coil if needed"), confirmFix],
      });
    }
  }
  return out;
}

function injectors(): SeedDtcWithFixes[] {
  const out: SeedDtcWithFixes[] = [{
    code: "P0200", system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop", titleEn: "Injector Circuit/Open", titleAr: "دائرة البخاخات مفتوحة/خلل",
    meaningAr: "خلل كهربائي في دائرة أحد البخاخات.", meaningEn: "Electrical fault in an injector circuit.",
    symptoms: [roughIdle, lowPower], causes: [s("بخاخ تالف", "Failed injector"), s("أسلاك/موصل", "Wiring/connector"), s("فيوز أو ريليه البخاخات", "Injector fuse or relay")],
    checks: [C.scan, C.connector("injector", "البخاخات", "injectors"), C.circuit("injector", "البخاخات", "injectors")], fixes: [s("إصلاح الدائرة أو استبدال البخاخ المتأكد عطله", "Repair the circuit or replace the confirmed injector"), confirmFix],
  }];
  for (let n = 1; n <= 12; n++) {
    out.push({
      code: P(200 + n), system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop",
      titleEn: `Injector Circuit/Open - Cylinder ${n}`, titleAr: `دائرة بخاخ الأسطوانة ${n} مفتوحة/خلل`,
      meaningAr: `وحدة المحرك رصدت خللًا كهربائيًا في دائرة بخاخ الأسطوانة ${n}، فلا تحصل الأسطوانة على وقود كافٍ.`,
      meaningEn: `The engine computer detected an electrical fault in the cylinder ${n} injector circuit; the cylinder may not get fuel.`,
      symptoms: [roughIdle, lowPower, s("احتراق ناقص في نفس الأسطوانة", "Misfire on that cylinder")],
      causes: [s(`بخاخ الأسطوانة ${n} تالف (ملف مفتوح)`, `Cylinder ${n} injector failed (open coil)`), s("موصل البخاخ أو أسلاكه", "Injector connector or wiring"), s("دائرة التحكم في وحدة المحرك (نادر)", "ECM driver (rare)")],
      checks: [C.scan, C.connector(`inj-${n}`, `بخاخ الأسطوانة ${n}`, `cylinder ${n} injector`), chk(`inj-res-${n}`, "workshop", 3, "قِس مقاومة البخاخ وقارنها بالبخاخات الأخرى.", "Measure injector resistance and compare with the others.", "مقاومة مقاربة للبقية.", "Similar to the others.", ["Multimeter"])],
      fixes: [s("إصلاح الموصل/الأسلاك", "Repair connector/wiring"), s("استبدال البخاخ إذا كانت مقاومته خارج المواصفة", "Replace the injector if its resistance is out of spec"), confirmFix],
    });
  }
  // P0261.. per cylinder: low, high, contribution/balance
  for (let n = 1; n <= 8; n++) {
    const base = 261 + 3 * (n - 1);
    const kinds: Array<[number, string, string, string]> = [[0, "Circuit Low", "إشارة الدائرة منخفضة", "low"], [1, "Circuit High", "إشارة الدائرة مرتفعة", "high"], [2, "Contribution/Balance", "خلل في توازن مساهمة البخاخ", "balance"]];
    for (const [off, en, ar, kind] of kinds) {
      out.push({
        code: P(base + off), system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop",
        titleEn: `Cylinder ${n} Injector ${en}`, titleAr: `بخاخ الأسطوانة ${n}: ${ar}`,
        meaningAr: kind === "balance" ? `مساهمة الأسطوانة ${n} في عزم المحرك مختلفة عن البقية، وغالبًا بسبب بخاخ متسخ أو ضعيف أو مشكلة كمبريشن.` : `جهد دائرة بخاخ الأسطوانة ${n} ${kind === "low" ? "منخفض" : "مرتفع"} عن المتوقع.`,
        meaningEn: kind === "balance" ? `Cylinder ${n}'s contribution differs from the others, usually a dirty/weak injector or a compression issue.` : `Cylinder ${n} injector circuit voltage is ${kind}.`,
        symptoms: [roughIdle, lowPower], causes: kind === "balance" ? [s("بخاخ متسخ أو ضعيف", "Dirty or weak injector"), s("كمبريشن منخفض", "Low compression")] : [s("أسلاك/موصل البخاخ", "Injector wiring/connector"), s("بخاخ تالف", "Failed injector")],
        checks: [C.scan, C.connector(`inj-${n}`, `بخاخ الأسطوانة ${n}`, `cylinder ${n} injector`), kind === "balance" ? chk("compression-test", "workshop", 4, "اختبار الكمبريشن.", "Compression test.", "قيم متقاربة.", "Similar values.", ["Compression gauge"]) : C.circuit(`inj-${n}`, `بخاخ الأسطوانة ${n}`, `cylinder ${n} injector`)],
        fixes: [s(kind === "balance" ? "تنظيف/فحص البخاخات على جهاز اختبار" : "إصلاح الدائرة", kind === "balance" ? "Clean/bench-test the injectors" : "Repair the circuit"), s("استبدال البخاخ المتأكد عطله فقط", "Replace only the confirmed injector"), confirmFix],
      });
    }
  }
  return out;
}

function o2Sensors(): SeedDtcWithFixes[] {
  const locs: Array<{ base: number; bank: number; sensor: number }> = [
    { base: 130, bank: 1, sensor: 1 }, { base: 136, bank: 1, sensor: 2 }, { base: 142, bank: 1, sensor: 3 },
    { base: 150, bank: 2, sensor: 1 }, { base: 156, bank: 2, sensor: 2 }, { base: 162, bank: 2, sensor: 3 },
  ];
  const kinds: Array<[number, string, string, string, string]> = [
    [0, "Circuit", "خلل في الدائرة", "وحدة المحرك رصدت خللًا في دائرة الحساس.", "The module detected a fault in the sensor circuit."],
    [1, "Circuit Low Voltage", "جهد منخفض", "إشارة الحساس منخفضة باستمرار (تبدو كخليط فقير).", "Sensor signal stays low (looks lean)."],
    [2, "Circuit High Voltage", "جهد مرتفع", "إشارة الحساس مرتفعة باستمرار (تبدو كخليط غني أو قصر).", "Sensor signal stays high (looks rich or shorted)."],
    [3, "Circuit Slow Response", "استجابة بطيئة", "الحساس يتبدل أبطأ من المتوقع، غالبًا بسبب التقادم أو التلوث.", "The sensor switches more slowly than expected, usually ageing or contamination."],
    [4, "Circuit No Activity Detected", "لا يوجد نشاط", "إشارة الحساس ثابتة ولا تتغير.", "Sensor signal is flat and does not change."],
    [5, "Heater Circuit", "دائرة السخان", "خلل في سخان الحساس أو دائرته (فيوز، سلك، أو السخان نفسه).", "Fault in the sensor heater or its circuit (fuse, wire or element)."],
  ];
  const out: SeedDtcWithFixes[] = [];
  for (const loc of locs) {
    for (const [off, en, ar, mAr, mEn] of kinds) {
      const code = P(loc.base + off);
      if (code === "P0133" || code === "P0135") continue; // hand-written
      const pos = loc.sensor === 1 ? { ar: "قبل المحفّز", en: "upstream" } : { ar: "بعد المحفّز", en: "downstream" };
      out.push({
        code, system: "powertrain", baseUrgency: off === 5 || loc.sensor > 1 ? "monitor" : "soon", skillLevel: "intermediate",
        titleEn: `O2 Sensor ${en} (Bank ${loc.bank} Sensor ${loc.sensor})`, titleAr: `حساس الأوكسجين ${pos.ar} — البنك ${loc.bank} الحساس ${loc.sensor}: ${ar}`,
        meaningAr: `${mAr} (حساس الأوكسجين ${pos.ar}، البنك ${loc.bank}).`, meaningEn: `${mEn} (${pos.en} oxygen sensor, bank ${loc.bank}).`,
        symptoms: loc.sensor === 1 ? [fuelUse, roughIdle] : [s("غالبًا لا أعراض قيادة", "Often no driveability symptoms")],
        causes: [s("حساس قديم أو ملوث (زيت/مانع تسرب سيليكون/وقود رديء)", "Aged or contaminated sensor (oil, silicone, poor fuel)"), s("موصل أو أسلاك قرب العادم الحار", "Connector or wiring near the hot exhaust"), s("تسريب عادم قبل الحساس", "Exhaust leak before the sensor"), ...(off === 5 ? [s("فيوز السخان", "Heater fuse")] : [])],
        checks: [C.scan, C.connector(`o2-${loc.bank}${loc.sensor}`, "حساس الأوكسجين", "oxygen sensor"), chk("o2-waveforms", "workshop", 2, "راقب إشارة الحساس في البيانات الحية أو بالأوسيلوسكوب.", "Watch the sensor signal in live data or with a scope.", loc.sensor === 1 ? "تبدّل سريع بين 0.1 و0.9 فولت تقريبًا." : "إشارة ثابتة نسبيًا مع محفّز سليم.", loc.sensor === 1 ? "Fast switching roughly 0.1–0.9 V." : "Fairly steady signal with a healthy converter.", ["Scan tool / oscilloscope"]), ...(off === 5 ? [chk("heater-resistance", "workshop", 3, "قِس مقاومة السخان وجهد التغذية.", "Measure heater resistance and supply.", "ضمن المواصفة.", "Within spec.", ["Multimeter"])] : [chk("exhaust-leak", "workshop", 2, "افحص تسريب العادم قرب الحساس.", "Check for exhaust leaks near the sensor.", "لا تسريب.", "No leak.", [])])],
        fixes: [s("إصلاح تسريب العادم أو الأسلاك إن وُجد", "Fix exhaust leak or wiring if found"), s("استبدال حساس الأوكسجين بالقطعة المطابقة لرقم القطعة (OE) بعد تأكيد العطل", "Replace the O2 sensor with the correct OE-matched part once confirmed"), confirmFix],
      });
    }
  }
  // Heater control circuits P0030-P0032, P0036-P0038, P0050-P0052, P0056-P0058
  const heater: Array<[number, number, number]> = [[30, 1, 1], [36, 1, 2], [50, 2, 1], [56, 2, 2]];
  for (const [base, bank, sensor] of heater) {
    for (const [off, en, ar] of [[0, "Control Circuit", "دائرة التحكم"], [1, "Control Circuit Low", "دائرة التحكم منخفضة"], [2, "Control Circuit High", "دائرة التحكم مرتفعة"]] as const) {
      out.push({
        code: P(base + off), system: "powertrain", baseUrgency: "monitor", skillLevel: "intermediate",
        titleEn: `HO2S Heater ${en} (Bank ${bank} Sensor ${sensor})`, titleAr: `سخان حساس الأوكسجين (البنك ${bank} الحساس ${sensor}): ${ar}`,
        meaningAr: "خلل في دائرة تحكم سخان حساس الأوكسجين؛ الحساس يتأخر في الوصول لحرارة العمل.", meaningEn: "Fault in the O2 sensor heater control circuit; the sensor is slow to reach operating temperature.",
        symptoms: [s("غالبًا ضوء المحرك فقط", "Usually only the check-engine light")], causes: [s("سخان الحساس تالف", "Failed heater element"), s("فيوز أو أسلاك", "Fuse or wiring")],
        checks: [C.scan, chk("fuse-check", "home", 1, "افحص فيوز سخان الحساس حسب دليل السيارة.", "Check the O2 heater fuse per the owner's manual.", "الفيوز سليم.", "Fuse intact.", []), chk("heater-resistance", "workshop", 3, "قِس مقاومة السخان وجهد التغذية.", "Measure heater resistance and supply.", "ضمن المواصفة.", "Within spec.", ["Multimeter"])],
        fixes: [s("استبدال الفيوز/إصلاح الأسلاك", "Replace fuse / repair wiring"), s("استبدال الحساس إذا كان السخان مفتوحًا", "Replace the sensor if the heater is open"), confirmFix],
      });
    }
  }
  return out;
}

function camTiming(): SeedDtcWithFixes[] {
  const rows: Array<[number, string, string, string, string]> = [
    [10, "\"A\" Camshaft Position Actuator Circuit (Bank 1)", "دائرة مشغّل توقيت الكامات A — البنك 1", "circuit", "1"],
    [11, "\"A\" Camshaft Position - Timing Over-Advanced or System Performance (Bank 1)", "توقيت الكامات A متقدم أكثر من اللازم — البنك 1", "adv", "1"],
    [12, "\"A\" Camshaft Position - Timing Over-Retarded (Bank 1)", "توقيت الكامات A متأخر أكثر من اللازم — البنك 1", "ret", "1"],
    [13, "\"B\" Camshaft Position Actuator Circuit (Bank 1)", "دائرة مشغّل توقيت الكامات B — البنك 1", "circuit", "1"],
    [14, "\"B\" Camshaft Position - Timing Over-Advanced or System Performance (Bank 1)", "توقيت الكامات B متقدم أكثر من اللازم — البنك 1", "adv", "1"],
    [15, "\"B\" Camshaft Position - Timing Over-Retarded (Bank 1)", "توقيت الكامات B متأخر أكثر من اللازم — البنك 1", "ret", "1"],
    [16, "Crankshaft Position - Camshaft Position Correlation (Bank 1 Sensor A)", "عدم تطابق إشارتي الكرنك والكامات — البنك 1 (A)", "corr", "1"],
    [17, "Crankshaft Position - Camshaft Position Correlation (Bank 1 Sensor B)", "عدم تطابق إشارتي الكرنك والكامات — البنك 1 (B)", "corr", "1"],
    [18, "Crankshaft Position - Camshaft Position Correlation (Bank 2 Sensor A)", "عدم تطابق إشارتي الكرنك والكامات — البنك 2 (A)", "corr", "2"],
    [19, "Crankshaft Position - Camshaft Position Correlation (Bank 2 Sensor B)", "عدم تطابق إشارتي الكرنك والكامات — البنك 2 (B)", "corr", "2"],
    [20, "\"A\" Camshaft Position Actuator Circuit (Bank 2)", "دائرة مشغّل توقيت الكامات A — البنك 2", "circuit", "2"],
    [21, "\"A\" Camshaft Position - Timing Over-Advanced or System Performance (Bank 2)", "توقيت الكامات A متقدم أكثر من اللازم — البنك 2", "adv", "2"],
    [22, "\"A\" Camshaft Position - Timing Over-Retarded (Bank 2)", "توقيت الكامات A متأخر أكثر من اللازم — البنك 2", "ret", "2"],
    [23, "\"B\" Camshaft Position Actuator Circuit (Bank 2)", "دائرة مشغّل توقيت الكامات B — البنك 2", "circuit", "2"],
    [24, "\"B\" Camshaft Position - Timing Over-Advanced or System Performance (Bank 2)", "توقيت الكامات B متقدم أكثر من اللازم — البنك 2", "adv", "2"],
    [25, "\"B\" Camshaft Position - Timing Over-Retarded (Bank 2)", "توقيت الكامات B متأخر أكثر من اللازم — البنك 2", "ret", "2"],
  ];
  const oil = chk("oil-level-quality", "home", 1, "افحص مستوى الزيت ونظافته ولزوجته المطابقة للدليل؛ نظام توقيت الصمامات المتغير يعمل بضغط الزيت.", "Check oil level, condition and the correct viscosity; variable valve timing runs on oil pressure.", "المستوى صحيح والزيت غير متسخ.", "Correct level, oil not sludged.", ["Dipstick"]);
  return rows.map(([n, en, ar, kind]) => ({
    code: P(n), system: "powertrain" as const, baseUrgency: kind === "corr" ? "urgent" as const : "soon" as const, skillLevel: "workshop" as const,
    titleEn: en, titleAr: ar,
    meaningAr: kind === "corr" ? "إشارتا الكرنك والكامات لا تتوافقان زمنيًا؛ قد يعني تمدد الجنزير/السير أو قفزة في التوقيت أو مشكلة حساس." : kind === "circuit" ? "خلل كهربائي في صمام التحكم بتوقيت الكامات (VVT/OCV)." : "توقيت عمود الكامات لا يصل للزاوية المطلوبة؛ غالبًا بسبب الزيت أو صمام التحكم أو جنزير متمدد.",
    meaningEn: kind === "corr" ? "Crank and cam signals are out of correlation; may indicate a stretched chain/belt, jumped timing or a sensor problem." : kind === "circuit" ? "Electrical fault in the camshaft timing control valve (VVT/OCV)." : "Camshaft timing does not reach the commanded angle; usually oil, the control valve or a stretched chain.",
    symptoms: [roughIdle, lowPower, s("صوت طقطقة من مقدمة المحرك عند التشغيل أحيانًا", "Rattle from the front of the engine at start-up sometimes")],
    causes: kind === "circuit" ? [s("صمام التحكم OCV/VVT", "OCV/VVT solenoid"), s("أسلاك/موصل", "Wiring/connector")] : [s("مستوى زيت منخفض أو زيت قديم/لزوجة خاطئة", "Low, old or wrong-viscosity oil"), s("صمام OCV عالق أو مصفاته مسدودة", "OCV stuck or its screen clogged"), s("جنزير/سير توقيت متمدد أو قافز", "Stretched or jumped timing chain/belt"), s("حساس الكامات أو الكرنك", "Cam or crank sensor")],
    checks: [C.scan, oil, ...(kind === "circuit" ? [C.connector("ocv", "صمام OCV", "OCV solenoid"), C.circuit("ocv", "صمام OCV", "OCV solenoid")] : [chk("vvt-live", "workshop", 2, "قارن زاوية الكامات المطلوبة بالفعلية في البيانات الحية وفعّل صمام OCV بجهاز الفحص.", "Compare commanded vs actual cam angle in live data and command the OCV with a scan tool.", "الزاوية الفعلية تتبع المطلوبة.", "Actual follows commanded.", ["Bidirectional scan tool"]), chk("timing-check", "specialist", 4, "التحقق من علامات التوقيت/تمدد الجنزير.", "Verify timing marks / chain stretch.", "التوقيت مضبوط.", "Timing correct.", ["Timing tools"])])],
    fixes: [s("تبديل الزيت والفلتر باللزوجة الصحيحة كأول خطوة", "Change oil and filter with the correct viscosity as the first step"), s("تنظيف أو استبدال صمام OCV بعد تأكيد العطل", "Clean or replace the OCV once confirmed"), ...(kind === "corr" ? [s("استبدال طقم التوقيت إذا ثبت تمدده", "Replace the timing kit if stretch is confirmed")] : []), confirmFix],
  }));
}

// ---------------------------------------------------------------- transmission
function transmission(): SeedDtcWithFixes[] {
  const out: SeedDtcWithFixes[] = [];
  const ratio = (code: string, gEn: string, gAr: string): SeedDtcWithFixes => ({
    code, system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop", titleEn: `${gEn} Incorrect Ratio`, titleAr: `نسبة ${gAr} غير صحيحة`,
    meaningAr: `سرعتا دخول وخروج القير لا تطابقان نسبة ${gAr} المتوقعة؛ يعني انزلاقًا داخليًا أو مشكلة ضغط زيت أو حساس سرعة.`,
    meaningEn: `Input and output speeds do not match the expected ${gEn.toLowerCase()} ratio — internal slipping, fluid pressure or a speed-sensor problem.`,
    symptoms: [shifting, s("ارتفاع دورات المحرك دون تسارع (انزلاق)", "Engine revs flare without acceleration (slipping)")],
    causes: [s("مستوى زيت القير منخفض أو زيت محروق", "Low or burnt transmission fluid"), s("انزلاق كلتشات/أشرطة داخلية", "Worn internal clutches/bands"), s("صمامات تحكم (سولينويد)", "Shift/pressure solenoids"), s("حساس سرعة", "Speed sensor")],
    checks: [C.readTcm, C.fluidAtf, chk("trans-live", "workshop", 3, "راقب سرعات الدخول والخروج والانزلاق في البيانات الحية أثناء اختبار طريق.", "Watch input/output speeds and slip in live data during a road test.", "الانزلاق ضمن الحدود.", "Slip within limits.", ["Scan tool"])],
    fixes: [s("تصحيح مستوى الزيت بالنوع المحدد من الشركة", "Correct the fluid level with the manufacturer-specified fluid"), s("لا تبدّل القير قبل فحص الزيت والسولينويدات والحساسات", "Do not replace the transmission before checking fluid, solenoids and sensors"), confirmFix],
  });
  out.push(ratio("P0730", "Incorrect Gear", "الغيار"));
  ["First", "Second", "Third", "Fourth", "Fifth"].forEach((g, i) => out.push(ratio(P(731 + i), `Gear ${i + 1}`, `الغيار ${["الأول", "الثاني", "الثالث", "الرابع", "الخامس"][i]}`)));
  out.push(ratio("P0736", "Reverse", "غيار الرجوع"));

  const sol = (base: number, L: string) => {
    const kinds: Array<[number, string, string, string]> = [[0, "", "", "circuit"], [1, " Performance/Stuck Off", ": أداء ضعيف/عالق مغلقًا", "off"], [2, " Stuck On", ": عالق مفتوحًا", "on"], [3, " Electrical", ": خلل كهربائي", "elec"]];
    for (const [off, en, ar, kind] of kinds) {
      out.push({
        code: P(base + off), system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop",
        titleEn: `Shift Solenoid "${L}"${en}`, titleAr: `صمام تبديل القير (سولينويد) ${L}${ar}`,
        meaningAr: kind === "circuit" || kind === "elec" ? `خلل كهربائي في سولينويد التبديل ${L} أو أسلاكه.` : `سولينويد التبديل ${L} لا يعمل كما تطلبه الوحدة (${kind === "off" ? "لا يفتح/لا يؤثر" : "يبقى فعّالًا"})، غالبًا بسبب زيت متسخ أو عطل ميكانيكي.`,
        meaningEn: kind === "circuit" || kind === "elec" ? `Electrical fault in shift solenoid "${L}" or its wiring.` : `Shift solenoid "${L}" does not act as commanded (${kind === "off" ? "stuck off" : "stuck on"}), often dirty fluid or a mechanical fault.`,
        symptoms: [shifting], causes: [s("سولينويد تالف", "Failed solenoid"), s("زيت قير متسخ أو منخفض", "Dirty or low fluid"), s("أسلاك/موصل القير", "Transmission harness/connector")],
        checks: [C.readTcm, C.fluidAtf, chk(`sol-${L}`, "workshop", 3, "فحص مقاومة السولينويد وتفعيله بجهاز الفحص.", "Check solenoid resistance and command it with a scan tool.", "يستجيب ضمن المواصفة.", "Responds within spec.", ["Multimeter", "Bidirectional scan tool"])],
        fixes: [s("تبديل زيت القير والفلتر إن وُجد", "Change transmission fluid (and filter if fitted)"), s("استبدال السولينويد/جسم الصمامات بعد تأكيد العطل", "Replace solenoid/valve body once confirmed"), confirmFix],
      });
    }
  };
  sol(750, "A"); sol(755, "B"); sol(760, "C"); sol(765, "D"); sol(770, "E");

  const tcc: Array<[string, string, string]> = [["P0740", "Torque Converter Clutch Solenoid Circuit/Open", "دائرة سولينويد قفل محوّل العزم مفتوحة"], ["P0741", "Torque Converter Clutch Solenoid Circuit Performance/Stuck Off", "قفل محوّل العزم لا يعمل (عالق مغلقًا)"], ["P0742", "Torque Converter Clutch Solenoid Circuit Stuck On", "قفل محوّل العزم عالق فعّالًا"], ["P0743", "Torque Converter Clutch Solenoid Circuit Electrical", "خلل كهربائي في سولينويد قفل محوّل العزم"]];
  for (const [code, en, ar] of tcc) {
    out.push({
      code, system: "powertrain", baseUrgency: "soon", skillLevel: "workshop", titleEn: en, titleAr: ar,
      meaningAr: "قفل محوّل العزم (TCC) يربط المحرك بالقير على السرعات الثابتة لتوفير الوقود؛ الوحدة رصدت أنه لا يعمل كما يجب.", meaningEn: "The torque converter clutch locks engine to transmission at steady speeds; the module saw it not working as commanded.",
      symptoms: [fuelUse, s("دورات أعلى على الطريق السريع", "Higher rpm on the highway"), code === "P0742" ? s("انطفاء أو رجفة عند التوقف", "Stalling or shudder when stopping") : s("رجفة خفيفة عند السرعات الثابتة", "Slight shudder at steady speeds")],
      causes: [s("سولينويد TCC", "TCC solenoid"), s("زيت قير متسخ", "Dirty fluid"), s("محوّل العزم نفسه", "Torque converter itself")],
      checks: [C.readTcm, C.fluidAtf, chk("tcc-slip", "workshop", 3, "راقب انزلاق محوّل العزم أثناء اختبار طريق.", "Monitor TCC slip during a road test.", "الانزلاق قريب من الصفر عند القفل.", "Slip near zero when locked.", ["Scan tool"])],
      fixes: [s("تبديل الزيت أولًا", "Change fluid first"), s("استبدال السولينويد أو محوّل العزم بعد التأكيد", "Replace solenoid or converter once confirmed"), confirmFix],
    });
  }
  const misc: Array<[string, string, string, string, string]> = [
    ["P0218", "Transmission Fluid Over Temperature Condition", "ارتفاع حرارة زيت القير", "حرارة زيت القير أعلى من الحد؛ استمرار القيادة قد يتلف القير.", "Transmission fluid temperature is over the limit; continued driving can damage the transmission."],
    ["P0780", "Shift Error", "خطأ في التبديل", "الوحدة طلبت تبديلًا ولم يحدث كما يجب.", "A commanded shift did not happen correctly."],
    ["P0841", "Transmission Fluid Pressure Sensor/Switch \"A\" Circuit Range/Performance", "حساس/مفتاح ضغط زيت القير A خارج المدى", "قراءة ضغط زيت القير لا تتوافق مع حالة القير.", "Transmission fluid pressure reading does not match the transmission state."],
    ["P0868", "Transmission Fluid Pressure Low", "ضغط زيت القير منخفض", "ضغط زيت القير أقل من المطلوب؛ قد يسبب انزلاقًا.", "Transmission fluid pressure is below target; may cause slipping."],
    ["P0894", "Transmission Component Slipping", "انزلاق في أحد مكونات القير", "رصد انزلاق داخلي في القير.", "Internal slipping detected in the transmission."],
    ["P0725", "Engine Speed Input Circuit", "دائرة إشارة سرعة المحرك للقير", "وحدة القير لا تستقبل إشارة سرعة المحرك بشكل سليم.", "The transmission module is not receiving a proper engine-speed input."],
  ];
  for (const [code, en, ar, mAr, mEn] of misc) {
    out.push({ code, system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop", titleEn: en, titleAr: ar, meaningAr: mAr, meaningEn: mEn, symptoms: [shifting], causes: [s("مستوى/حالة زيت القير", "Fluid level/condition"), s("مبرد زيت القير مسدود (لكود الحرارة)", "Clogged transmission cooler (for over-temp)"), s("سولينويد ضغط أو حساس", "Pressure solenoid or sensor"), s("تآكل داخلي", "Internal wear")], checks: [C.readTcm, C.fluidAtf], fixes: [s("تصحيح المستوى بالزيت المحدد", "Correct level with specified fluid"), s("إصلاح التبريد أو الحساس حسب التشخيص", "Repair cooling or sensor per diagnosis"), confirmFix] });
  }
  return out;
}

// ---------------------------------------------------------------- one-off generic codes (powertrain)
type One = [string, SeedDtc["system"], string, string, string, string, LocalisedItem[], LocalisedItem[], LocalisedItem[], SeedDtc["baseUrgency"], SeedDtc["skillLevel"], SeedDtc["safetyArea"]?, CheckStep[]?];
const one = (r: One): SeedDtcWithFixes => ({
  code: r[0], system: r[1], titleEn: r[2], titleAr: r[3], meaningAr: r[4], meaningEn: r[5], symptoms: r[6], causes: r[7], fixes: [...r[8], confirmFix], baseUrgency: r[9], skillLevel: r[10], safetyArea: r[11],
  checks: r[12] ?? [C.scan, chk(`live-${r[0].toLowerCase()}`, "workshop", 2, "تشخيص النظام المعني بالبيانات الحية والاختبارات حسب دليل الشركة.", "Diagnose the system with live data and tests per the manufacturer manual.", "تحديد سبب الكود.", "Root cause identified.", ["Scan tool"])],
});
const vacuumCheck = chk("visual-vacuum-hoses", "home", 1, "افحص بصريًا خراطيم الفاكيوم ومجرى الهواء بعد حساس الهواء بحثًا عن تشقق أو انفصال والمحرك مطفأ.", "With the engine off, visually inspect vacuum hoses and the intake duct after the MAF for cracks or disconnections.", "لا تشققات ولا وصلات مفصولة.", "No cracks or loose joints.", ["Flashlight"]);
const smoke = chk("smoke-test", "workshop", 3, "اختبار دخان لنظام السحب أو EVAP في الورشة.", "Workshop smoke test of the intake or EVAP system.", "تحديد مكان التسريب إن وجد.", "Locates any leak.", ["Smoke machine"]);
const fuelCap = chk("fuel-cap", "home", 0, "تأكد أن غطاء الخزان مغلق حتى يطقطق وأن الحلقة المطاطية سليمة.", "Make sure the fuel cap clicks shut and its seal is intact.", "الغطاء محكم.", "Cap tight.", []);
const ONEOFFS: One[] = [
  ["P0068", "powertrain", "MAP/MAF - Throttle Position Correlation", "عدم تطابق قراءة MAP/MAF مع موضع الخانق", "كمية الهواء المقاسة لا تتفق مع فتحة الخانق؛ غالبًا تسريب هواء أو بوابة خانق متسخة.", "Measured airflow disagrees with throttle opening, often an air leak or dirty throttle body.", [roughIdle, lowPower], [s("تسريب هواء", "Air leak"), s("بوابة خانق متسخة", "Dirty throttle body"), s("حساس MAF/MAP", "MAF/MAP sensor")], [s("تنظيف بوابة الخانق وإصلاح التسريب", "Clean throttle body and fix leaks")], "soon", "intermediate", undefined, [C.scan, vacuumCheck, smoke]],
  ["P0069", "powertrain", "Manifold Absolute Pressure - Barometric Pressure Correlation", "عدم تطابق ضغط المجمع مع الضغط الجوي", "عند إطفاء المحرك يجب أن يتساوى ضغط المجمع مع الضغط الجوي؛ الوحدة رأت فرقًا.", "With the engine off, manifold and barometric pressure should match; the module saw a difference.", [lowPower], [s("حساس MAP أو خرطومه", "MAP sensor or hose"), s("حساس الضغط الجوي", "Barometric sensor")], [s("استبدال الحساس المتأكد عطله", "Replace the confirmed sensor")], "soon", "intermediate"],
  ["P0088", "powertrain", "Fuel Rail/System Pressure - Too High", "ضغط الوقود في السكة مرتفع جدًا", "ضغط الوقود أعلى مما تطلبه الوحدة. أنظمة الحقن المباشر والديزل تعمل بضغوط عالية جدًا وخطرة.", "Fuel pressure is higher than commanded. Direct-injection and diesel rails run at very high, dangerous pressures.", [roughIdle, s("رائحة وقود محتملة", "Possible fuel smell")], [s("منظم/صمام تحكم الضغط", "Pressure regulator/control valve"), s("حساس ضغط السكة", "Rail pressure sensor")], [s("التشخيص والإصلاح لدى ورشة متخصصة فقط", "Diagnosis and repair at a specialist only")], "urgent", "specialist", "fuel"],
  ["P0089", "powertrain", "Fuel Pressure Regulator 1 Performance", "أداء منظم ضغط الوقود 1", "منظم ضغط الوقود لا يحافظ على الضغط المطلوب.", "Fuel pressure regulator 1 is not holding the commanded pressure.", [roughIdle, lowPower, hardStart], [s("المنظم/صمام التحكم", "Regulator/control valve"), s("مضخة ضغط عالٍ (حقن مباشر/ديزل)", "High-pressure pump (DI/diesel)")], [s("لدى ورشة متخصصة", "At a specialist")], "urgent", "specialist", "fuel"],
  ["P0090", "powertrain", "Fuel Pressure Regulator 1 Control Circuit", "دائرة تحكم منظم ضغط الوقود 1", "خلل كهربائي في دائرة منظم ضغط الوقود.", "Electrical fault in the fuel pressure regulator control circuit.", [hardStart, lowPower], [s("أسلاك/موصل", "Wiring/connector"), s("المنظم", "Regulator")], [s("إصلاح الدائرة لدى ورشة", "Repair the circuit at a workshop")], "urgent", "workshop", "fuel"],
  ["P0125", "powertrain", "Insufficient Coolant Temperature for Closed Loop Fuel Control", "حرارة المحرك غير كافية للتحكم المغلق بالوقود", "المحرك تأخر في الوصول للحرارة اللازمة لضبط الخليط بالحساسات.", "The engine takes too long to reach the temperature needed for closed-loop fuel control.", [fuelUse, s("تدفئة ضعيفة", "Weak cabin heat")], [s("ثرموستات عالق مفتوحًا", "Thermostat stuck open"), s("حساس حرارة المحرك", "Coolant temperature sensor"), s("سائل تبريد منخفض", "Low coolant")], [s("استبدال الثرموستات بعد تأكيد بطء الإحماء", "Replace the thermostat once slow warm-up is confirmed")], "soon", "intermediate", undefined, [C.scan, C.coolantCold]],
  ["P0126", "powertrain", "Insufficient Coolant Temperature for Stable Operation", "حرارة المحرك غير كافية للتشغيل المستقر", "حرارة سائل التبريد لا تصل للمستوى المطلوب.", "Coolant temperature does not reach the level needed for stable operation.", [fuelUse], [s("ثرموستات", "Thermostat"), s("حساس الحرارة", "Coolant temperature sensor")], [s("استبدال الثرموستات/الحساس حسب التشخيص", "Replace thermostat/sensor per diagnosis")], "soon", "intermediate", undefined, [C.scan, C.coolantCold]],
  ["P0127", "powertrain", "Intake Air Temperature Too High", "حرارة هواء السحب مرتفعة جدًا", "هواء السحب أسخن من المتوقع، وفي محركات التيربو قد يعني ضعف مبرد الهواء (Intercooler).", "Intake air is hotter than expected; on turbo engines this can mean a poor intercooler.", [lowPower], [s("حساس IAT", "IAT sensor"), s("إنتركولر متسخ أو تسريب", "Dirty or leaking intercooler")], [s("تنظيف الإنتركولر/إصلاح الحساس", "Clean intercooler / fix sensor")], "soon", "workshop"],
  ["P0170", "powertrain", "Fuel Trim (Bank 1)", "خلل في تصحيح الوقود — البنك 1", "تصحيح الوقود خارج المدى دون تحديد فقير أو غني.", "Fuel trim is out of range without a lean/rich direction.", [roughIdle, fuelUse], [s("تسريب هواء", "Air leak"), s("ضغط وقود", "Fuel pressure"), s("حساس MAF/O2", "MAF/O2 sensor")], [s("إصلاح السبب المحدد بعد قراءة Fuel Trim", "Fix the cause found from fuel-trim data")], "soon", "intermediate", undefined, [C.scan, vacuumCheck, smoke]],
  ["P0173", "powertrain", "Fuel Trim (Bank 2)", "خلل في تصحيح الوقود — البنك 2", "تصحيح الوقود خارج المدى في البنك 2.", "Fuel trim out of range on bank 2.", [roughIdle, fuelUse], [s("تسريب هواء", "Air leak"), s("ضغط وقود", "Fuel pressure")], [s("إصلاح السبب المحدد", "Fix the identified cause")], "soon", "intermediate", undefined, [C.scan, vacuumCheck, smoke]],
  ["P0175", "powertrain", "System Too Rich (Bank 2)", "الخليط غني — البنك 2", "وحدة المحرك تقلل الوقود لأقصى حد في البنك 2.", "The engine computer is removing as much fuel as it can on bank 2.", [fuelUse, s("دخان أسود", "Black smoke")], [s("فلتر هواء مسدود", "Clogged air filter"), s("بخاخ يسرّب", "Leaking injector"), s("حساس MAF", "MAF sensor")], [s("إصلاح السبب بعد التشخيص", "Repair the cause after diagnosis")], "soon", "intermediate"],
  ["P0217", "powertrain", "Engine Coolant Over Temperature Condition", "ارتفاع حرارة المحرك فوق الحد", "حرارة المحرك تجاوزت الحد الآمن. استمرار القيادة قد يتلف رأس المحرك (الكاسكيت).", "Engine temperature exceeded the safe limit. Continued driving can damage the head gasket.", [s("مؤشر الحرارة مرتفع", "High temperature gauge"), s("بخار من مقدمة السيارة", "Steam from the front")], [s("سائل تبريد منخفض أو تسريب", "Low coolant or leak"), s("مروحة الرديتر لا تعمل", "Radiator fan not working"), s("ثرموستات عالق مغلقًا", "Thermostat stuck closed"), s("مضخة ماء", "Water pump")], [s("أوقف المحرك وتوجّه للورشة؛ لا تفتح غطاء الرديتر حارًا", "Stop the engine and go to a workshop; never open a hot radiator cap")], "urgent", "workshop", undefined, [C.coolantCold]],
  ["P0219", "powertrain", "Engine Overspeed Condition", "تجاوز دورات المحرك الحد المسموح", "المحرك وصل لدورات أعلى من الحد؛ قد يتلف ميكانيكيًا.", "Engine speed exceeded the limit; mechanical damage is possible.", [s("سُجّل بعد تبديل خاطئ أو انزلاق", "Recorded after a mis-shift or slipping")], [s("تبديل يدوي خاطئ", "Wrong manual downshift"), s("انزلاق القير", "Transmission slip")], [s("فحص المحرك والقير لدى ورشة", "Inspect engine and transmission at a workshop")], "urgent", "workshop"],
  ["P0230", "powertrain", "Fuel Pump Primary Circuit", "دائرة مضخة الوقود الرئيسية", "خلل كهربائي في دائرة تشغيل مضخة الوقود.", "Electrical fault in the fuel pump primary circuit.", [hardStart, s("انطفاء", "Stalling")], [s("ريليه أو فيوز المضخة", "Pump relay or fuse"), s("أسلاك", "Wiring"), s("المضخة", "Pump")], [s("فحص الفيوز والريليه أولًا", "Check fuse and relay first")], "urgent", "workshop", "fuel"],
  ["P0234", "powertrain", "Turbocharger/Supercharger \"A\" Overboost Condition", "ضغط التيربو أعلى من الحد", "ضغط التيربو تجاوز الحد المسموح؛ الوحدة قد تقلل العزم للحماية.", "Boost exceeded the limit; the module may cut power for protection.", [s("وضع الطوارئ", "Limp mode")], [s("صمام Wastegate عالق", "Stuck wastegate"), s("خرطوم تحكم Wastegate", "Wastegate control hose"), s("حساس الضغط", "Boost sensor")], [s("إصلاح نظام التحكم بالتيربو لدى ورشة", "Repair boost control at a workshop")], "urgent", "workshop"],
  ["P0299", "powertrain", "Turbocharger/Supercharger \"A\" Underboost Condition", "ضغط التيربو أقل من المطلوب", "التيربو لا ينتج الضغط المطلوب.", "The turbo is not producing the commanded boost.", [lowPower, s("صوت صفير/هسهسة عند الدعس", "Whistle/hiss under load")], [s("خرطوم التيربو مفصول أو مثقوب", "Disconnected or split boost hose"), s("إنتركولر يسرّب", "Leaking intercooler"), s("صمام Wastegate/VGT", "Wastegate/VGT"), s("التيربو نفسه", "Turbo itself")], [s("إصلاح التسريب أولًا", "Fix leaks first"), s("لا تبدّل التيربو قبل اختبار التسريب", "Don't replace the turbo before a leak test")], "soon", "workshop", undefined, [C.scan, chk("boost-hoses", "home", 1, "افحص خراطيم التيربو والإنتركولر بصريًا بحثًا عن زيت أو شق.", "Visually check turbo/intercooler hoses for oil or splits.", "لا شقوق ولا وصلات مفكوكة.", "No splits or loose clamps.", ["Flashlight"]), smoke]],
  ["P0314", "powertrain", "Single Cylinder Misfire (Cylinder not Specified)", "احتراق ناقص في أسطوانة واحدة غير محددة", "رُصد احتراق ناقص في أسطوانة واحدة دون تحديدها.", "A single-cylinder misfire was detected without identifying the cylinder.", [roughIdle], [s("بوجي/كويل/بخاخ", "Plug/coil/injector")], [s("تحديد الأسطوانة بعدادات Misfire ثم الإصلاح", "Identify the cylinder with misfire counters, then repair")], "urgent", "workshop"],
  ["P0380", "powertrain", "Glow Plug/Heater Circuit \"A\"", "دائرة شمعات التسخين (ديزل) A", "خلل في دائرة شمعات التسخين في محرك الديزل؛ يؤثر على التشغيل البارد.", "Fault in the diesel glow plug circuit; affects cold starting.", [hardStart, s("دخان أبيض عند التشغيل بارد", "White smoke at cold start")], [s("شمعة تسخين تالفة", "Failed glow plug"), s("ريليه/موديول الشمعات", "Glow plug relay/module")], [s("استبدال الشمعات المتأكد عطلها", "Replace confirmed glow plugs")], "soon", "workshop"],
  ["P0400", "powertrain", "Exhaust Gas Recirculation \"A\" Flow", "تدفق نظام EGR", "خلل عام في تدفق غازات إعادة التدوير.", "General EGR flow malfunction.", [roughIdle], [s("صمام EGR متسخ", "Dirty EGR valve"), s("ممرات مسدودة", "Clogged passages")], [s("تنظيف EGR والممرات", "Clean EGR and passages")], "soon", "workshop"],
  ["P0402", "powertrain", "Exhaust Gas Recirculation \"A\" Flow Excessive Detected", "تدفق زائد في نظام EGR", "تدفق غازات EGR أكثر من المطلوب، وغالبًا الصمام عالق مفتوحًا.", "More EGR flow than commanded, often a valve stuck open.", [roughIdle, s("انطفاء على الخمول", "Stalling at idle")], [s("صمام EGR عالق مفتوحًا", "EGR valve stuck open")], [s("تنظيف/استبدال صمام EGR", "Clean/replace EGR valve")], "soon", "workshop"],
  ["P0403", "powertrain", "Exhaust Gas Recirculation \"A\" Control Circuit", "دائرة تحكم صمام EGR", "خلل كهربائي في دائرة صمام EGR.", "Electrical fault in the EGR control circuit.", [roughIdle], [s("أسلاك/موصل", "Wiring/connector"), s("صمام EGR", "EGR valve")], [s("إصلاح الدائرة/الصمام", "Repair circuit/valve")], "soon", "workshop"],
  ["P0404", "powertrain", "Exhaust Gas Recirculation \"A\" Control Circuit Range/Performance", "أداء صمام EGR خارج المدى", "موضع صمام EGR لا يطابق الموضع المطلوب.", "EGR valve position does not match the commanded position.", [roughIdle], [s("صمام EGR متسخ أو عالق", "Dirty or sticking EGR valve")], [s("تنظيف/استبدال الصمام", "Clean/replace the valve")], "soon", "workshop"],
  ["P0410", "powertrain", "Secondary Air Injection System", "نظام حقن الهواء الثانوي", "خلل في نظام الهواء الثانوي الذي يساعد المحفّز على الإحماء.", "Fault in the secondary air system that helps the catalyst warm up.", [s("صوت غير طبيعي من المضخة عند التشغيل البارد", "Unusual pump noise at cold start")], [s("مضخة الهواء", "Air pump"), s("صمام عدم الرجوع", "Check valve"), s("ريليه/فيوز", "Relay/fuse")], [s("إصلاح المكوّن المتأكد عطله", "Repair the confirmed component")], "monitor", "workshop"],
  ["P0411", "powertrain", "Secondary Air Injection System Incorrect Flow Detected", "تدفق غير صحيح في نظام الهواء الثانوي", "تدفق الهواء الثانوي ليس كما هو متوقع.", "Secondary air flow is not as expected.", [], [s("صمام عدم الرجوع/الخراطيم", "Check valve/hoses"), s("المضخة", "Pump")], [s("إصلاح المكوّن المتأكد عطله", "Repair the confirmed component")], "monitor", "workshop"],
  ["P0421", "powertrain", "Warm Up Catalyst Efficiency Below Threshold (Bank 1)", "كفاءة محفّز الإحماء أقل من الحد — البنك 1", "المحفّز القريب من المحرك لا يعمل بكفاءة كافية.", "The warm-up (close-coupled) catalyst efficiency is low.", [s("غالبًا لا أعراض", "Often no symptoms")], [s("محفّز ضعيف", "Worn catalyst"), s("حساس أوكسجين خلفي", "Downstream O2 sensor"), s("تسريب عادم", "Exhaust leak")], [s("عالج أكواد الاحتراق/الخليط أولًا", "Fix misfire/mixture codes first")], "soon", "workshop"],
  ["P0430", "powertrain", "Catalyst System Efficiency Below Threshold (Bank 2)", "كفاءة المحفّز أقل من الحد — البنك 2", "مثل P0420 لكن في البنك 2.", "Like P0420 but on bank 2.", [s("غالبًا لا أعراض", "Often no symptoms")], [s("محفّز ضعيف", "Worn catalyst"), s("تسريب عادم", "Exhaust leak"), s("حساس أوكسجين خلفي", "Downstream O2 sensor")], [s("عالج أكواد الاحتراق/الخليط أولًا، ثم المحفّز بعد التأكيد", "Fix misfire/mixture codes first; catalyst only once confirmed")], "soon", "workshop"],
  ["P0440", "powertrain", "Evaporative Emission System", "نظام أبخرة الوقود EVAP", "خلل عام في نظام EVAP.", "General EVAP system malfunction.", [], [s("غطاء الخزان", "Fuel cap"), s("صمامات/خراطيم EVAP", "EVAP valves/hoses")], [s("إصلاح التسريب أو الصمام", "Fix the leak or valve")], "monitor", "intermediate", undefined, [fuelCap, smoke]],
  ["P0441", "powertrain", "Evaporative Emission System Incorrect Purge Flow", "تدفق سحب أبخرة غير صحيح (Purge)", "تدفق الأبخرة من علبة الفحم إلى المحرك ليس كما هو مطلوب.", "Purge flow from the charcoal canister is not as commanded.", [], [s("صمام Purge", "Purge valve"), s("خراطيم", "Hoses")], [s("استبدال صمام Purge بعد اختباره", "Replace the purge valve after testing")], "monitor", "workshop", undefined, [fuelCap, smoke]],
  ["P0443", "powertrain", "Evaporative Emission System Purge Control Valve \"A\" Circuit", "دائرة صمام Purge", "خلل كهربائي في صمام Purge.", "Electrical fault in the purge valve circuit.", [], [s("صمام Purge", "Purge valve"), s("أسلاك", "Wiring")], [s("إصلاح الدائرة/الصمام", "Repair circuit/valve")], "monitor", "workshop"],
  ["P0446", "powertrain", "Evaporative Emission System Vent Control Circuit", "دائرة تحكم صمام التهوية EVAP", "خلل في صمام التهوية لنظام EVAP.", "Fault in the EVAP vent control.", [], [s("صمام Vent عالق", "Stuck vent valve"), s("علبة فحم مسدودة", "Clogged canister")], [s("إصلاح الصمام", "Repair the valve")], "monitor", "workshop"],
  ["P0449", "powertrain", "Evaporative Emission System Vent Valve/Solenoid Circuit", "دائرة صمام تهوية EVAP", "خلل كهربائي في صمام التهوية.", "Electrical fault in the vent valve circuit.", [], [s("الصمام", "Valve"), s("أسلاك", "Wiring")], [s("إصلاح الدائرة/الصمام", "Repair circuit/valve")], "monitor", "workshop"],
  ["P0456", "powertrain", "Evaporative Emission System Leak Detected (Very Small Leak)", "تسريب صغير جدًا في نظام EVAP", "تسريب صغير جدًا في نظام أبخرة الوقود.", "A very small EVAP leak was detected.", [], [s("غطاء الخزان", "Fuel cap"), s("خرطوم صغير متشقق", "Small cracked hose")], [s("استبدال غطاء الخزان أولًا إن كان تالفًا", "Replace the fuel cap first if worn")], "monitor", "intermediate", undefined, [fuelCap, smoke]],
  ["P0457", "powertrain", "Evaporative Emission System Leak Detected (Fuel Cap Loose/Off)", "تسريب EVAP — غطاء الخزان مفتوح أو مرتخٍ", "الوحدة رصدت أن غطاء الخزان غالبًا غير محكم.", "The module suspects the fuel cap is loose or missing.", [], [s("غطاء الخزان", "Fuel cap")], [s("أحكم الغطاء أو استبدله؛ يزول الكود بعد عدة دورات قيادة", "Tighten or replace the cap; the code clears after several drive cycles")], "monitor", "diy", undefined, [fuelCap]],
  ["P0480", "powertrain", "Fan 1 Control Circuit", "دائرة تحكم مروحة التبريد 1", "خلل في دائرة مروحة التبريد؛ قد ترتفع حرارة المحرك.", "Fault in the cooling fan 1 control circuit; the engine may overheat.", [s("ارتفاع الحرارة في الزحام", "Overheating in traffic")], [s("ريليه/فيوز المروحة", "Fan relay/fuse"), s("موتور المروحة", "Fan motor")], [s("إصلاح الريليه/المروحة", "Repair relay/fan")], "urgent", "workshop"],
  ["P0481", "powertrain", "Fan 2 Control Circuit", "دائرة تحكم مروحة التبريد 2", "خلل في دائرة المروحة الثانية.", "Fault in the cooling fan 2 control circuit.", [s("ارتفاع الحرارة أو ضعف المكيف", "Overheating or weak A/C")], [s("ريليه/فيوز", "Relay/fuse"), s("موتور المروحة", "Fan motor")], [s("إصلاح الريليه/المروحة", "Repair relay/fan")], "soon", "workshop"],
  ["P0496", "powertrain", "Evaporative Emission System High Purge Flow", "تدفق سحب أبخرة مرتفع", "صمام Purge يسمح بتدفق أكثر من اللازم (غالبًا عالق مفتوحًا).", "Purge flow is too high (valve often stuck open).", [s("صعوبة تشغيل بعد التعبئة", "Hard start after refuelling")], [s("صمام Purge عالق مفتوحًا", "Purge valve stuck open")], [s("استبدال صمام Purge بعد التأكيد", "Replace the purge valve once confirmed")], "monitor", "workshop"],
  ["P0505", "powertrain", "Idle Air Control System", "نظام التحكم بهواء الخمول", "دورات الخمول لا تنضبط كما يجب.", "Idle speed is not being controlled properly.", [roughIdle, s("انطفاء عند التوقف", "Stalling when stopping")], [s("بوابة خانق متسخة", "Dirty throttle body"), s("صمام IAC", "IAC valve"), s("تسريب هواء", "Air leak")], [s("تنظيف البوابة وإعادة تعلّم الخمول", "Clean the throttle body and relearn idle")], "soon", "intermediate", undefined, [C.scan, vacuumCheck]],
  ["P0506", "powertrain", "Idle Air Control System RPM Lower Than Expected", "دورات الخمول أقل من المتوقع", "الخمول منخفض عن المطلوب.", "Idle rpm is lower than expected.", [roughIdle, s("انطفاء", "Stalling")], [s("بوابة خانق متسخة", "Dirty throttle body"), s("حمل زائد (مكيف/ديناموا)", "Extra load (A/C, alternator)")], [s("تنظيف البوابة وإعادة تعلّم الخمول", "Clean the throttle body and relearn idle")], "soon", "intermediate"],
  ["P0507", "powertrain", "Idle Air Control System RPM Higher Than Expected", "دورات الخمول أعلى من المتوقع", "الخمول أعلى من المطلوب، وغالبًا السبب تسريب هواء.", "Idle rpm is higher than expected, often an air leak.", [s("خمول مرتفع", "High idle")], [s("تسريب هواء", "Air leak"), s("بوابة خانق", "Throttle body")], [s("إصلاح التسريب وإعادة التعلّم", "Fix the leak and relearn")], "soon", "intermediate", undefined, [C.scan, vacuumCheck, smoke]],
  ["P0524", "powertrain", "Engine Oil Pressure Too Low", "ضغط زيت المحرك منخفض جدًا", "ضغط الزيت أقل من الحد الآمن. أوقف المحرك بأسرع وقت آمن؛ التشغيل بلا ضغط زيت يتلف المحرك خلال دقائق.", "Oil pressure is below the safe limit. Stop the engine as soon as safely possible; running without oil pressure destroys an engine within minutes.", [s("ضوء ضغط الزيت", "Oil-pressure light"), s("طقطقة من المحرك", "Ticking/knocking from the engine")], [s("مستوى زيت منخفض", "Low oil level"), s("مضخة زيت ضعيفة أو مصفاة مسدودة", "Weak oil pump or clogged pickup"), s("حساس ضغط الزيت", "Oil pressure sensor")], [s("لا تكمل القيادة؛ افحص المستوى واطلب سحب السيارة إن لزم", "Don't keep driving; check the level and get the car towed if needed")], "urgent", "workshop", undefined, [chk("oil-level", "home", 0, "أوقف المحرك على أرض مستوية وانتظر دقائق ثم افحص مستوى الزيت بالعصا.", "Stop on level ground, wait a few minutes, then check the oil level with the dipstick.", "المستوى بين العلامتين.", "Level between the marks.", ["Dipstick"]), chk("oil-pressure-mech", "workshop", 3, "قياس ضغط الزيت بساعة ميكانيكية.", "Measure oil pressure with a mechanical gauge.", "ضمن المواصفة.", "Within spec.", ["Oil pressure gauge"])]],
  ["P0534", "powertrain", "Air Conditioner Refrigerant Charge Loss", "فقدان غاز المكيف", "ضغط غاز المكيف منخفض؛ غالبًا يوجد تسريب.", "A/C refrigerant pressure is low; a leak is likely.", [s("المكيف لا يبرد", "A/C not cooling")], [s("تسريب في الدورة", "Leak in the circuit")], [s("كشف التسريب وإصلاحه قبل إعادة التعبئة", "Find and fix the leak before recharging")], "monitor", "workshop"],
  ["P0560", "powertrain", "System Voltage", "جهد النظام الكهربائي", "جهد التغذية خارج المدى.", "Supply voltage out of range.", [s("إضاءة خافتة", "Dim lights")], [s("بطارية/دينمو/توصيلات", "Battery/alternator/connections")], [s("فحص نظام الشحن", "Test the charging system")], "soon", "diy", undefined, [C.battery]],
  ["P0561", "powertrain", "System Voltage Unstable", "جهد النظام غير مستقر", "جهد التغذية يتذبذب.", "Supply voltage is unstable.", [s("وميض الأضواء", "Flickering lights")], [s("أقطاب مرتخية", "Loose terminals"), s("دينمو", "Alternator")], [s("شد الأقطاب وفحص الدينمو", "Tighten terminals and test the alternator")], "soon", "diy", undefined, [C.battery]],
  ["P0563", "powertrain", "System Voltage High", "جهد النظام مرتفع", "جهد التغذية أعلى من المسموح؛ منظم الدينمو غالبًا لا يعمل.", "Supply voltage too high; the alternator regulator is likely faulty.", [s("لمبات تحترق كثيرًا", "Bulbs burning out")], [s("منظم جهد الدينمو", "Alternator voltage regulator")], [s("إصلاح/استبدال الدينمو بعد القياس", "Repair/replace the alternator after measuring")], "urgent", "workshop", undefined, [C.battery]],
  ["P0571", "powertrain", "Brake Switch \"A\" Circuit", "دائرة مفتاح الفرامل A", "خلل في مفتاح دواسة الفرامل؛ قد لا تعمل أضواء الفرامل أو مثبت السرعة أو نقل القير من P.", "Brake pedal switch fault; brake lights, cruise control or shift-out-of-Park may not work.", [s("أضواء الفرامل لا تعمل", "Brake lights not working"), s("مثبت السرعة لا يعمل", "Cruise control inoperative")], [s("مفتاح الفرامل", "Brake switch"), s("فيوز", "Fuse")], [s("استبدال المفتاح/الفيوز لدى ورشة", "Replace switch/fuse at a workshop")], "urgent", "workshop", "brakes"],
  ["P0600", "powertrain", "Serial Communication Link", "خلل في خط الاتصال التسلسلي", "خلل في اتصال وحدة المحرك بوحدات أخرى.", "Fault in the engine module's serial communication.", [s("أكواد اتصال متعددة", "Multiple communication codes")], [s("أسلاك الشبكة", "Network wiring"), s("جهد بطارية", "Battery voltage")], [s("فحص الشبكة والجهد", "Check network and voltage")], "urgent", "specialist"],
  ["P0601", "powertrain", "Internal Control Module Memory Check Sum Error", "خطأ في ذاكرة وحدة التحكم", "الوحدة رصدت خطأ في برمجيتها/ذاكرتها.", "The module detected a memory/software checksum error.", [s("عدم تشغيل أو سلوك غير منتظم", "No start or erratic behaviour")], [s("برمجة تالفة", "Corrupted software"), s("وحدة التحكم", "Control module")], [s("إعادة برمجة الوحدة لدى الوكالة/مختص", "Reprogram the module at a dealer/specialist")], "urgent", "specialist"],
  ["P0602", "powertrain", "Control Module Programming Error", "خطأ في برمجة وحدة التحكم", "الوحدة غير مبرمجة بشكل صحيح.", "The module is not programmed correctly.", [s("ضوء المحرك", "Check-engine light")], [s("برمجة ناقصة", "Incomplete programming")], [s("إعادة البرمجة لدى مختص", "Reprogram at a specialist")], "urgent", "specialist"],
  ["P0603", "powertrain", "Internal Control Module Keep Alive Memory (KAM) Error", "خطأ في ذاكرة KAM لوحدة التحكم", "الوحدة فقدت ذاكرة التعلّم، غالبًا بعد فصل البطارية أو تغذية ضعيفة.", "The module lost its keep-alive memory, often after battery disconnect or poor supply.", [roughIdle], [s("انقطاع تغذية الوحدة", "Loss of module supply"), s("وحدة التحكم", "Control module")], [s("فحص الفيوز والتغذية الدائمة", "Check the fuse and permanent supply")], "soon", "workshop"],
  ["P0607", "powertrain", "Control Module Performance", "أداء وحدة التحكم", "الوحدة رصدت خللًا في أدائها الداخلي.", "The module detected an internal performance fault.", [s("سلوك غير منتظم", "Erratic behaviour")], [s("جهد/أرضي", "Voltage/ground"), s("الوحدة", "Module")], [s("تأكد من التغذية والأرضيات قبل الحكم على الوحدة", "Verify power and grounds before blaming the module")], "urgent", "specialist"],
  ["P0638", "powertrain", "Throttle Actuator Control Range/Performance (Bank 1)", "أداء مشغّل الخانق الإلكتروني خارج المدى", "الخانق الإلكتروني لا يتحرك كما تطلبه الوحدة.", "The electronic throttle does not move as commanded.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("بوابة خانق متسخة", "Dirty throttle body"), s("موتور الخانق", "Throttle motor")], [s("تنظيف البوابة وإعادة التعلّم، ثم الاستبدال إن لزم", "Clean and relearn, replace if needed")], "urgent", "workshop"],
  ["P0641", "powertrain", "Sensor Reference Voltage \"A\" Circuit/Open", "دائرة الجهد المرجعي للحساسات A", "تغذية 5 فولت المشتركة لعدة حساسات بها قصر أو قطع؛ تظهر عادة أكواد حساسات متعددة.", "The shared 5 V reference for several sensors is shorted or open; multiple sensor codes usually appear.", [lowPower, s("أكواد حساسات متعددة", "Multiple sensor codes")], [s("حساس به قصر داخلي يسحب الجهد", "A shorted sensor pulling the reference down"), s("أسلاك", "Wiring")], [s("افصل الحساسات واحدًا تلو الآخر لتحديد المسبب", "Unplug sensors one by one to find the culprit")], "urgent", "workshop"],
  ["P0651", "powertrain", "Sensor Reference Voltage \"B\" Circuit/Open", "دائرة الجهد المرجعي للحساسات B", "مثل P0641 للدائرة B.", "Like P0641 for reference circuit B.", [lowPower], [s("حساس به قصر", "Shorted sensor"), s("أسلاك", "Wiring")], [s("عزل الحساس المسبب", "Isolate the shorted sensor")], "urgent", "workshop"],
  ["P0670", "powertrain", "Glow Plug Control Module Control Circuit", "دائرة تحكم موديول شمعات التسخين", "خلل في دائرة موديول شمعات التسخين (ديزل).", "Fault in the glow plug control module circuit (diesel).", [hardStart], [s("الموديول", "Module"), s("أسلاك", "Wiring")], [s("إصلاح الدائرة/الموديول", "Repair circuit/module")], "soon", "workshop"],
  ["P2002", "powertrain", "Diesel Particulate Filter Efficiency Below Threshold (Bank 1)", "كفاءة فلتر جزيئات الديزل (DPF) أقل من الحد", "فلتر DPF لا يحجز الدخان كما يجب (تالف أو مثقوب).", "The DPF is not trapping soot as it should (damaged or cracked).", [s("دخان أسود", "Black smoke")], [s("DPF تالف", "Damaged DPF"), s("حساس الضغط التفاضلي", "Differential pressure sensor")], [s("تشخيص لدى ورشة ديزل", "Diagnose at a diesel workshop")], "soon", "workshop"],
  ["P242F", "powertrain", "Diesel Particulate Filter Restriction - Ash Accumulation", "انسداد فلتر DPF بالرماد", "تراكم الرماد في فلتر DPF؛ الرماد لا يحترق بالتجديد.", "Ash has accumulated in the DPF; ash does not burn off during regeneration.", [lowPower], [s("عمر الفلتر", "Filter age"), s("زيت غير مناسب (رماد عالٍ)", "Wrong (high-ash) engine oil")], [s("تنظيف احترافي أو استبدال DPF", "Professional cleaning or DPF replacement")], "soon", "workshop"],
  ["P2463", "powertrain", "Diesel Particulate Filter Restriction - Soot Accumulation", "انسداد فلتر DPF بالسخام", "تراكم السخام في DPF أكثر من الحد؛ غالبًا بسبب القيادة القصيرة داخل المدينة.", "Soot load in the DPF is over the limit, usually from short urban trips.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("تجديد DPF لم يكتمل", "Incomplete DPF regeneration"), s("حساس الضغط", "Pressure sensor")], [s("تجديد قسري لدى ورشة ثم قيادة على الطريق السريع", "Forced regeneration at a workshop, then highway driving")], "soon", "workshop"],
  ["P2096", "powertrain", "Post Catalyst Fuel Trim System Too Lean (Bank 1)", "تصحيح الوقود بعد المحفّز فقير — البنك 1", "حساس الأوكسجين الخلفي يرى خليطًا فقيرًا باستمرار.", "The downstream O2 sensor sees a lean mixture persistently.", [], [s("تسريب عادم", "Exhaust leak"), s("خليط فقير", "Lean mixture")], [s("إصلاح التسريب/السبب", "Fix leak/cause")], "soon", "workshop"],
  ["P2097", "powertrain", "Post Catalyst Fuel Trim System Too Rich (Bank 1)", "تصحيح الوقود بعد المحفّز غني — البنك 1", "حساس الأوكسجين الخلفي يرى خليطًا غنيًا باستمرار.", "The downstream O2 sensor sees a rich mixture persistently.", [fuelUse], [s("بخاخ يسرّب", "Leaking injector"), s("حساس أمامي", "Upstream sensor")], [s("إصلاح السبب", "Fix the cause")], "soon", "workshop"],
  ["P2101", "powertrain", "Throttle Actuator Control Motor Circuit Range/Performance", "أداء موتور الخانق الإلكتروني", "موتور الخانق لا يستجيب كما يجب.", "The throttle actuator motor is not responding properly.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("بوابة خانق متسخة أو موتور تالف", "Dirty throttle body or failed motor"), s("أسلاك", "Wiring")], [s("تنظيف وإعادة تعلّم أو استبدال البوابة", "Clean & relearn or replace throttle body")], "urgent", "workshop"],
  ["P2111", "powertrain", "Throttle Actuator Control System - Stuck Open", "الخانق الإلكتروني عالق مفتوحًا", "الخانق لا يعود للإغلاق كما يجب.", "The throttle is not closing as commanded.", [s("خمول مرتفع", "High idle")], [s("بوابة خانق", "Throttle body")], [s("فحص البوابة لدى ورشة", "Inspect the throttle body at a workshop")], "urgent", "workshop"],
  ["P2112", "powertrain", "Throttle Actuator Control System - Stuck Closed", "الخانق الإلكتروني عالق مغلقًا", "الخانق لا يفتح كما يجب.", "The throttle is not opening as commanded.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("ترسبات كربون", "Carbon build-up"), s("موتور الخانق", "Throttle motor")], [s("تنظيف/استبدال البوابة", "Clean/replace throttle body")], "urgent", "workshop"],
  ["P2119", "powertrain", "Throttle Actuator Control Throttle Body Range/Performance", "أداء بوابة الخانق الإلكتروني", "موضع الخانق الفعلي لا يطابق المطلوب.", "Actual throttle position does not match the commanded position.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("بوابة متسخة", "Dirty throttle body"), s("حساسات الموضع", "Position sensors")], [s("تنظيف وإعادة تعلّم", "Clean and relearn")], "urgent", "workshop"],
  ["P2135", "powertrain", "Throttle/Pedal Position Sensor/Switch \"A\"/\"B\" Voltage Correlation", "عدم تطابق جهد حساسي موضع الخانق A/B", "الحساسان المزدوجان للخانق يعطيان قراءات غير متطابقة.", "The two redundant throttle position sensors disagree.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("بوابة الخانق (الحساس مدمج)", "Throttle body (integrated sensor)"), s("أسلاك", "Wiring")], [s("إصلاح الأسلاك أو استبدال البوابة بعد التأكيد", "Fix wiring or replace throttle body once confirmed")], "urgent", "workshop"],
  ["P2138", "powertrain", "Throttle/Pedal Position Sensor/Switch \"D\"/\"E\" Voltage Correlation", "عدم تطابق جهد حساسي دواسة الوقود D/E", "حساسا دواسة الوقود يعطيان قراءات غير متطابقة.", "The two accelerator pedal sensors disagree.", [lowPower, s("وضع الطوارئ", "Limp mode")], [s("دواسة الوقود", "Accelerator pedal assembly"), s("أسلاك", "Wiring")], [s("استبدال مجموعة الدواسة بعد التأكيد", "Replace the pedal assembly once confirmed")], "urgent", "workshop"],
  ["P2187", "powertrain", "System Too Lean at Idle (Bank 1)", "الخليط فقير على الخمول — البنك 1", "الخليط فقير على الخمول فقط؛ أكثر الأسباب تسريب فاكيوم.", "Lean at idle only; the most common cause is a vacuum leak.", [roughIdle], [s("تسريب فاكيوم", "Vacuum leak"), s("صمام PCV", "PCV valve")], [s("إصلاح التسريب", "Fix the leak")], "soon", "intermediate", undefined, [C.scan, vacuumCheck, smoke]],
  ["P2188", "powertrain", "System Too Rich at Idle (Bank 1)", "الخليط غني على الخمول — البنك 1", "الخليط غني على الخمول.", "Rich at idle.", [roughIdle, fuelUse], [s("بخاخ يسرّب", "Leaking injector"), s("صمام Purge عالق", "Stuck purge valve")], [s("إصلاح السبب", "Fix the cause")], "soon", "intermediate"],
  ["P2195", "powertrain", "O2 Sensor Signal Biased/Stuck Lean (Bank 1 Sensor 1)", "إشارة حساس الأوكسجين الأمامي عالقة على فقير — البنك 1", "الحساس يشير إلى فقير باستمرار.", "The upstream sensor reads lean persistently.", [fuelUse], [s("تسريب هواء", "Air leak"), s("حساس قديم", "Aged sensor")], [s("إصلاح التسريب ثم فحص الحساس", "Fix leaks then test the sensor")], "soon", "workshop"],
  ["P2196", "powertrain", "O2 Sensor Signal Biased/Stuck Rich (Bank 1 Sensor 1)", "إشارة حساس الأوكسجين الأمامي عالقة على غني — البنك 1", "الحساس يشير إلى غني باستمرار.", "The upstream sensor reads rich persistently.", [fuelUse], [s("بخاخ يسرّب", "Leaking injector"), s("حساس ملوث", "Contaminated sensor")], [s("إصلاح السبب", "Fix the cause")], "soon", "workshop"],
  ["P2270", "powertrain", "O2 Sensor Signal Biased/Stuck Lean (Bank 1 Sensor 2)", "إشارة حساس الأوكسجين الخلفي عالقة على فقير", "الحساس الخلفي يقرأ فقيرًا باستمرار، وغالبًا السبب تسريب عادم.", "The downstream sensor reads lean, often an exhaust leak.", [], [s("تسريب عادم", "Exhaust leak"), s("حساس قديم", "Aged sensor")], [s("إصلاح التسريب ثم الحساس", "Fix leak then sensor")], "monitor", "workshop"],
  ["P2271", "powertrain", "O2 Sensor Signal Biased/Stuck Rich (Bank 1 Sensor 2)", "إشارة حساس الأوكسجين الخلفي عالقة على غني", "الحساس الخلفي يقرأ غنيًا باستمرار.", "The downstream sensor reads rich persistently.", [], [s("خليط غني", "Rich mixture"), s("حساس", "Sensor")], [s("إصلاح السبب", "Fix the cause")], "monitor", "workshop"],
  ["P2263", "powertrain", "Turbocharger/Supercharger Boost System Performance", "أداء نظام ضغط التيربو", "ضغط التيربو لا يطابق المطلوب.", "Boost does not match the commanded value.", [lowPower], [s("تسريب ضغط", "Boost leak"), s("صمام VGT/Wastegate", "VGT/wastegate"), s("حساس", "Sensor")], [s("اختبار التسريب أولًا", "Leak test first")], "soon", "workshop"],
  ["P2610", "powertrain", "ECM/PCM Internal Engine Off Timer Performance", "أداء مؤقت إطفاء المحرك داخل الوحدة", "مؤقت داخلي في الوحدة لا يعمل كما يجب.", "An internal engine-off timer in the module is not performing.", [], [s("برمجة الوحدة", "Module software"), s("الوحدة", "Module")], [s("تحديث برمجي لدى الوكالة", "Software update at a dealer")], "monitor", "specialist"],
  ["P2A00", "powertrain", "O2 Sensor Circuit Range/Performance (Bank 1 Sensor 1)", "أداء حساس الأوكسجين الأمامي خارج المدى", "قراءة الحساس لا تتوافق مع حالة المحرك.", "Sensor reading does not agree with engine conditions.", [fuelUse], [s("حساس قديم", "Aged sensor"), s("تسريب عادم/هواء", "Exhaust/air leak")], [s("إصلاح التسريب ثم الحساس", "Fix leak then sensor")], "soon", "workshop"],
  ["P2004", "powertrain", "Intake Manifold Runner Control Stuck Open (Bank 1)", "صمامات مجاري السحب عالقة مفتوحة — البنك 1", "صمامات تغيير طول مجاري السحب لا تُغلق.", "Intake runner flaps are not closing.", [lowPower], [s("ترسبات كربون", "Carbon deposits"), s("مشغّل الصمامات", "Runner actuator")], [s("تنظيف/إصلاح آلية المجاري", "Clean/repair the runner mechanism")], "monitor", "workshop"],
  ["P20EE", "powertrain", "SCR NOx Catalyst Efficiency Below Threshold (Bank 1)", "كفاءة محفّز SCR لأكاسيد النيتروجين منخفضة (ديزل)", "نظام AdBlue/SCR لا يخفض أكاسيد النيتروجين كفاية.", "The AdBlue/SCR system is not reducing NOx enough.", [s("قد تقل قدرة المحرك", "Power may be reduced")], [s("سائل AdBlue رديء أو ناقص", "Poor or low AdBlue"), s("حاقن AdBlue", "AdBlue injector"), s("حساس NOx", "NOx sensor")], [s("فحص جودة AdBlue والنظام لدى ورشة", "Check AdBlue quality and system at a workshop")], "soon", "workshop"],
  ["P2200", "powertrain", "NOx Sensor Circuit (Bank 1)", "دائرة حساس أكاسيد النيتروجين NOx", "خلل في حساس NOx (ديزل غالبًا).", "Fault in the NOx sensor circuit (mostly diesel).", [], [s("حساس NOx", "NOx sensor"), s("أسلاك", "Wiring")], [s("إصلاح بعد التشخيص", "Repair after diagnosis")], "soon", "workshop"],
  ["P2299", "powertrain", "Brake Pedal Position/Accelerator Pedal Position Incompatible", "دواسة الفرامل والبنزين مضغوطتان معًا", "رُصد ضغط الفرامل والبنزين معًا؛ الوحدة تقلل العزم للسلامة.", "Brake and accelerator were pressed together; the module cuts torque for safety.", [s("فقدان مؤقت للعزم", "Temporary loss of power")], [s("أسلوب القيادة", "Driving habit"), s("مفتاح الفرامل", "Brake switch"), s("دواسة بنزين عالقة/سجادة", "Stuck pedal / floor mat")], [s("تأكد من عدم إعاقة السجادة للدواسة وافحص مفتاح الفرامل", "Make sure the mat doesn't trap the pedal; check the brake switch")], "urgent", "workshop", "brakes"],
  ["P0A0F", "powertrain", "Engine Failed to Start", "المحرك لم يشتغل (هجين)", "في السيارات الهجينة، طلب النظام تشغيل محرك البنزين ولم يشتغل.", "On hybrids, the system requested engine start and it did not start.", [s("ضوء النظام الهجين", "Hybrid system warning")], [s("وقود/إشعال", "Fuel/ignition"), s("نظام الجهد العالي", "High-voltage system")], [s("فحص لدى ورشة مؤهلة للجهد العالي", "Inspect at an HV-qualified workshop")], "urgent", "specialist", "high_voltage"],
  ["P0A7F", "powertrain", "Hybrid/EV Battery Pack Deterioration", "تدهور بطارية الجهد العالي", "سعة البطارية الهجينة انخفضت عن الحد.", "The hybrid battery capacity has dropped below the limit.", [lowPower, fuelUse], [s("تقادم الخلايا", "Cell ageing"), s("تبريد البطارية", "Battery cooling")], [s("فحص الخلايا لدى ورشة مؤهلة للجهد العالي", "Cell test at an HV-qualified workshop")], "urgent", "specialist", "high_voltage"],
  ["P0AA6", "powertrain", "Hybrid/EV Battery Voltage System Isolation Fault", "خلل عزل نظام الجهد العالي", "رُصد تسرب كهربائي من دائرة الجهد العالي إلى هيكل السيارة. خطر صعق؛ لا تلمس الكيبلات البرتقالية.", "Leakage from the high-voltage circuit to the chassis was detected. Shock hazard; do not touch orange cables.", [s("ضوء النظام الهجين", "Hybrid warning"), s("قد لا تشتغل السيارة", "Car may not start")], [s("تلف عزل كيبل أو مكوّن جهد عالٍ", "Damaged insulation of an HV cable or component"), s("ماء داخل مكوّن", "Water ingress")], [s("لا تقُد السيارة؛ اطلب ورشة مؤهلة للجهد العالي", "Do not drive; call an HV-qualified workshop")], "urgent", "specialist", "high_voltage"],
  ["P0A93", "powertrain", "Inverter \"A\" Cooling System Performance", "أداء تبريد العاكس (Inverter)", "دائرة تبريد العاكس في السيارة الهجينة لا تبرد كما يجب.", "The hybrid inverter cooling circuit is not performing.", [s("ضوء النظام الهجين", "Hybrid warning")], [s("مضخة تبريد العاكس", "Inverter coolant pump"), s("سائل تبريد ناقص", "Low coolant")], [s("فحص لدى ورشة مؤهلة", "Inspect at a qualified workshop")], "urgent", "specialist", "high_voltage"],
  ["P0A94", "powertrain", "DC/DC Converter Performance", "أداء محوّل DC/DC", "المحوّل الذي يشحن بطارية 12 فولت من الجهد العالي لا يعمل كما يجب.", "The converter that charges the 12 V battery from the HV system is not performing.", [s("بطارية 12 فولت تفرغ", "12 V battery drains")], [s("المحوّل", "Converter"), s("التبريد", "Cooling")], [s("فحص لدى ورشة مؤهلة", "Inspect at a qualified workshop")], "urgent", "specialist", "high_voltage"],
];

// ---------------------------------------------------------------- network (U), chassis (C), body (B)
const net = (code: string, en: string, ar: string, modAr: string, modEn: string, safety?: SeedDtc["safetyArea"]): SeedDtcWithFixes => ({
  code, system: "network", baseUrgency: "urgent", skillLevel: "workshop", safetyArea: safety, titleEn: en, titleAr: ar,
  meaningAr: `وحدة أخرى فقدت الاتصال أو استلمت بيانات غير صالحة من ${modAr} عبر شبكة السيارة. كثيرًا ما يكون السبب جهدًا منخفضًا أو موصلًا أو أرضيًا.`,
  meaningEn: `Another module lost communication with, or received invalid data from, the ${modEn} on the vehicle network. Low voltage, connectors or grounds are common causes.`,
  symptoms: [s("أضواء تحذير متعددة", "Multiple warning lights"), s("وظائف الوحدة المعنية لا تعمل", "Functions of that module not working")],
  causes: [s("جهد بطارية منخفض", "Low battery voltage"), s("موصل أو أرضي الوحدة", "Module connector or ground"), s("أسلاك شبكة CAN", "CAN network wiring"), s(`${modAr} نفسها`, `The ${modEn} itself`)],
  checks: [C.battery, chk("network-check", "workshop", 3, "فحص تغذية وأرضي الوحدة ومقاومة شبكة CAN (حوالي 60 أوم بين CAN-H وCAN-L في كثير من السيارات).", "Check module power/ground and CAN resistance (about 60 Ω between CAN-H and CAN-L on many cars).", "القيم ضمن المواصفة.", "Values within spec.", ["Multimeter", "Oscilloscope"])],
  fixes: [s("شحن/استبدال البطارية الضعيفة أولًا", "Charge/replace a weak battery first"), s("إصلاح الموصل أو الأرضي", "Repair connector or ground"), s("استبدال أو برمجة الوحدة فقط بعد استبعاد الأسلاك", "Replace or program the module only after ruling out wiring"), confirmFix],
});
const NETWORK: SeedDtcWithFixes[] = [
  net("U0001", "High Speed CAN Communication Bus", "خلل في شبكة CAN عالية السرعة", "شبكة CAN", "high-speed CAN bus"),
  net("U0073", "Control Module Communication Bus \"A\" Off", "شبكة اتصال الوحدات A متوقفة", "الشبكة", "communication bus A"),
  net("U0101", "Lost Communication with TCM", "فقدان الاتصال مع وحدة ناقل الحركة", "وحدة ناقل الحركة (TCM)", "transmission control module (TCM)"),
  net("U0102", "Lost Communication with Transfer Case Control Module", "فقدان الاتصال مع وحدة الدفع الرباعي", "وحدة علبة التوزيع", "transfer case control module"),
  net("U0121", "Lost Communication With Anti-Lock Brake System (ABS) Control Module", "فقدان الاتصال مع وحدة ABS", "وحدة ABS", "ABS control module", "brakes"),
  net("U0140", "Lost Communication With Body Control Module", "فقدان الاتصال مع وحدة الهيكل BCM", "وحدة الهيكل (BCM)", "body control module (BCM)"),
  net("U0151", "Lost Communication With Restraints Control Module", "فقدان الاتصال مع وحدة الوسائد الهوائية", "وحدة الوسائد الهوائية", "restraints (airbag) control module", "airbag"),
  net("U0155", "Lost Communication With Instrument Panel Cluster (IPC) Control Module", "فقدان الاتصال مع الطبلون", "الطبلون (العدادات)", "instrument cluster"),
  net("U0164", "Lost Communication With HVAC Control Module", "فقدان الاتصال مع وحدة التكييف", "وحدة التكييف", "HVAC control module"),
  net("U0401", "Invalid Data Received From ECM/PCM \"A\"", "بيانات غير صالحة من وحدة المحرك", "وحدة المحرك", "engine control module"),
  net("U0415", "Invalid Data Received From Anti-Lock Brake System (ABS) Control Module", "بيانات غير صالحة من وحدة ABS", "وحدة ABS", "ABS control module", "brakes"),
  net("U0422", "Invalid Data Received From Body Control Module", "بيانات غير صالحة من وحدة الهيكل", "وحدة الهيكل", "body control module"),
];
const wheel = (code: string, posEn: string, posAr: string): SeedDtcWithFixes => ({
  code, system: "chassis", baseUrgency: "urgent", skillLevel: "workshop", safetyArea: "brakes",
  titleEn: `${posEn} Wheel Speed Sensor Circuit`, titleAr: `دائرة حساس سرعة العجلة ${posAr}`,
  meaningAr: `وحدة ABS لا ترى إشارة سليمة من حساس العجلة ${posAr}، فيتعطل منع انغلاق العجلات وقد يتعطل التحكم بالثبات.`,
  meaningEn: `The ABS module is not getting a valid signal from the ${posEn.toLowerCase()} wheel sensor; anti-lock braking and possibly stability control are disabled.`,
  symptoms: [s("ضوء ABS", "ABS light"), s("ضوء التحكم بالثبات", "Stability control light")],
  causes: [s("الحساس", "Sensor"), s("سلك تالف قرب العجلة", "Damaged wire near the wheel"), s("حلقة الإشارة أو الرولمان", "Tone ring or hub bearing")],
  checks: [chk("wss-pro", "workshop", 2, "افحص إشارات حساسات العجلات بجهاز الفحص ثم الأسلاك.", "Check wheel-speed signals with a scan tool, then the wiring.", "إشارة الحساس تطابق باقي العجلات.", "Sensor signal matches the other wheels.", ["Scan tool"])],
  fixes: [s("إصلاح السلك أو استبدال الحساس/الرولمان لدى ورشة", "Repair wire or replace sensor/hub at a workshop"), confirmFix],
});
const CHASSIS: SeedDtcWithFixes[] = [wheel("C0040", "Right Front", "الأمامية اليمنى"), wheel("C0045", "Left Rear", "الخلفية اليسرى"), wheel("C0050", "Right Rear", "الخلفية اليمنى")];
const BODY: SeedDtcWithFixes[] = [{
  code: "B0002", system: "body", baseUrgency: "urgent", skillLevel: "specialist", safetyArea: "airbag",
  titleEn: "Driver Frontal Stage 2 Deployment Control", titleAr: "دائرة تفعيل الوسادة الهوائية للسائق — المرحلة 2",
  meaningAr: "عطل في دائرة المرحلة الثانية للوسادة الهوائية الأمامية للسائق. العمل على الوسائد الهوائية خطر ويحتاج مختصًا.", meaningEn: "Fault in the driver frontal airbag stage-2 circuit. Airbag work is hazardous and needs a specialist.",
  symptoms: [s("ضوء الوسادة الهوائية", "Airbag light")], causes: [s("الشريط الحلزوني (Clock spring)", "Clock spring"), s("موصل أو أسلاك", "Connector or wiring")],
  checks: [chk("srs-pro", "specialist", 4, "فحص نظام الوسائد الهوائية لدى مختص بالإجراءات الآمنة.", "Airbag system inspection by a specialist with proper safety procedure.", "تحديد الجزء المسبب.", "Identify the faulty part.", ["SRS-capable scan tool"])],
  fixes: [s("إصلاح لدى مختص فقط", "Repair by a specialist only"), confirmFix],
}];

/** Every generated family, de-duplicated by code (first definition wins). */
export function buildFamilyLibrary(exclude: Set<string>): SeedDtcWithFixes[] {
  const all = [
    ...SENSORS.flatMap(sensorFamily), ...misfires(), ...coils(), ...injectors(), ...o2Sensors(), ...camTiming(), ...transmission(),
    ...ONEOFFS.map(one), ...NETWORK, ...CHASSIS, ...BODY,
  ];
  const seen = new Set(exclude);
  return all.filter((d) => (seen.has(d.code) ? false : (seen.add(d.code), true)));
}
