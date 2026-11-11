import type { CheckStep, LocalisedItem } from "../schema/knowledge";

/**
 * AutoCare editorial DRAFT definitions for a small set of GENERIC
 * SAE J2012 codes. Titles follow the standard generic code names; meanings,
 * symptoms, causes and checks are general automotive knowledge written by the
 * project and are NOT reviewed by a qualified technician yet (reviewStatus
 * "draft" is shown to users). Manufacturer-specific codes are intentionally
 * absent: they require a licensed manufacturer data source.
 */

export interface SeedDtc {
  code: string;
  system: "powertrain" | "chassis" | "body" | "network";
  titleEn: string;
  titleAr: string;
  meaningAr: string;
  meaningEn: string;
  symptoms: LocalisedItem[];
  causes: LocalisedItem[];
  checks: CheckStep[];
  skillLevel: "diy" | "intermediate" | "workshop" | "specialist";
  safetyArea?: "brakes" | "steering" | "airbag" | "fuel" | "high_voltage";
  baseUrgency: "urgent" | "soon" | "monitor";
}

const c = (id: string, where: CheckStep["where"], invasiveness: number, ar: string, en: string, expectedAr: string, expectedEn: string, tools: string[] = [], onFailAr?: string, onFailEn?: string): CheckStep => ({
  id, where, invasiveness, ar, en, expectedAr, expectedEn, tools, onFailAr, onFailEn,
});
const s = (ar: string, en: string): LocalisedItem => ({ ar, en });

// Shared checks
const SCAN_FREEZE = c("scan-freeze-frame", "home", 0, "اقرأ الأكواد مع بيانات Freeze Frame (السرعة، الحرارة، الحمل) بجهاز OBD-II.", "Read codes with freeze-frame data (speed, temperature, load) using an OBD-II scanner.", "تعرف الظروف التي ظهر فيها العطل.", "You learn the conditions when the fault set.", ["OBD-II scanner"]);
const VISUAL_VACUUM = c("visual-vacuum-hoses", "home", 1, "افحص بصريًا خراطيم الفاكيوم ومجرى الهواء بعد حساس الهواء بحثًا عن تشقق أو انفصال والمحرك مطفأ.", "With the engine off, visually inspect vacuum hoses and the intake duct after the MAF for cracks or disconnections.", "لا تشققات ولا وصلات مفصولة.", "No cracks or loose joints.", ["Flashlight"], "استبدال الخرطوم المتشقق يحتاج تأكيدًا بفحص تسريب.", "A cracked hose should be confirmed with a leak test.");
const BATTERY_VOLT = c("battery-voltage", "home", 1, "قِس جهد البطارية والمحرك مطفأ ثم وهو يعمل.", "Measure battery voltage engine-off and running.", "حوالي 12.4–12.7 فولت مطفأ، و13.5–14.7 فولت أثناء التشغيل في أغلب السيارات.", "About 12.4–12.7 V off and 13.5–14.7 V running on most cars.", ["Multimeter"]);
const SMOKE_TEST = c("smoke-test", "workshop", 3, "اختبار دخان لنظام السحب أو EVAP في الورشة.", "Workshop smoke test of the intake or EVAP system.", "تحديد مكان التسريب إن وجد.", "Locates any leak.", ["Smoke machine"]);
const LIVE_DATA_FT = c("live-fuel-trims", "workshop", 2, "مراقبة Fuel Trim القصير والطويل في البيانات الحية على الخمول وعند 2500 دورة.", "Watch short- and long-term fuel trims in live data at idle and 2500 rpm.", "إذا تحسّن الخليط عند ارتفاع الدورات فالأرجح تسريب هواء؛ إذا بقي فقد تكون مشكلة وقود أو حساس.", "If trims improve at higher rpm a vacuum leak is likely; if not, fuel delivery or a sensor.", ["Scan tool with live data"]);

export const GENERIC_DTCS: SeedDtc[] = [
  {
    code: "P0300", system: "powertrain", baseUrgency: "urgent", skillLevel: "intermediate",
    titleEn: "Random/Multiple Cylinder Misfire Detected",
    titleAr: "اكتشاف احتراق غير منتظم في عدة أسطوانات",
    meaningAr: "وحدة المحرك رصدت احتراقًا ناقصًا (Misfire) في أكثر من أسطوانة أو بشكل عشوائي. الاحتراق الناقص المستمر قد يرفع حرارة المحفّز (دبة البيئة) ويتلفه.",
    meaningEn: "The engine computer detected misfires in more than one cylinder or randomly. Sustained misfire can overheat and damage the catalytic converter.",
    symptoms: [s("رجفة في المحرك خاصة على الخمول", "Rough idle / shaking"), s("ضعف في العزم عند التسارع", "Hesitation or loss of power"), s("ضوء المحرك قد يومض", "Check-engine light may flash"), s("زيادة استهلاك الوقود", "Higher fuel consumption")],
    causes: [s("بواجي متآكلة أو غير مناسبة", "Worn or wrong spark plugs"), s("كويلات أو أسلاك إشعال ضعيفة", "Weak ignition coils or leads"), s("تسريب هواء (فاكيوم)", "Vacuum (air) leak"), s("ضغط وقود منخفض أو بخاخات متسخة", "Low fuel pressure or dirty injectors"), s("مشاكل ميكانيكية مثل ضعف الكمبريشن", "Mechanical issues such as low compression")],
    checks: [SCAN_FREEZE, VISUAL_VACUUM,
      c("misfire-counters", "workshop", 2, "قراءة عدّادات الاحتراق الناقص لكل أسطوانة في البيانات الحية.", "Read per-cylinder misfire counters in live data.", "معرفة إن كانت أسطوانة معيّنة هي الأسوأ.", "Shows whether one cylinder dominates.", ["Scan tool with Mode 6 / live data"]),
      c("swap-coil", "workshop", 3, "تبديل كويل الأسطوانة المتأثرة مع أسطوانة أخرى ومراقبة انتقال العطل.", "Swap the affected cylinder's coil with another and see if the misfire follows.", "إذا انتقل العطل مع الكويل فالكويل هو السبب.", "If the misfire follows the coil, the coil is at fault.", ["Basic hand tools"]),
      c("compression-test", "workshop", 4, "اختبار الكمبريشن أو Leak-down.", "Compression or leak-down test.", "قيم متقاربة بين الأسطوانات.", "Similar values across cylinders.", ["Compression gauge"])],
  },
  {
    code: "P0301", system: "powertrain", baseUrgency: "urgent", skillLevel: "intermediate",
    titleEn: "Cylinder 1 Misfire Detected", titleAr: "احتراق ناقص في الأسطوانة 1",
    meaningAr: "رُصد احتراق ناقص في الأسطوانة رقم 1 تحديدًا. ترقيم الأسطوانات يختلف بين المحركات؛ راجع ترتيبها لمحركك.",
    meaningEn: "A misfire was detected specifically in cylinder 1. Cylinder numbering differs between engines; check your engine's layout.",
    symptoms: [s("رجفة على الخمول", "Rough idle"), s("ضعف تسارع", "Hesitation"), s("ضوء المحرك", "Check-engine light")],
    causes: [s("بوجي الأسطوانة 1", "Cylinder 1 spark plug"), s("كويل الأسطوانة 1", "Cylinder 1 ignition coil"), s("بخاخ الأسطوانة 1", "Cylinder 1 injector"), s("تسريب هواء قرب المجمّع", "Intake leak near the runner"), s("كمبريشن منخفض في الأسطوانة", "Low compression in that cylinder")],
    checks: [SCAN_FREEZE,
      c("swap-coil", "workshop", 3, "تبديل كويل الأسطوانة 1 مع أسطوانة مجاورة ومسح الأكواد ثم إعادة الاختبار.", "Swap the cylinder-1 coil with a neighbour, clear codes and retest.", "إذا انتقل العطل إلى الأسطوانة الأخرى فالكويل هو السبب.", "If the misfire moves, the coil is at fault.", ["Basic hand tools"]),
      c("inspect-plug", "workshop", 3, "فك البوجي وفحص الفجوة والترسبات.", "Remove and inspect the spark plug (gap, deposits).", "لون فاتح وفجوة ضمن المواصفة.", "Light colour, gap within spec.", ["Spark plug socket", "Feeler gauge"]),
      c("compression-test", "workshop", 4, "اختبار الكمبريشن للأسطوانة.", "Compression test on the cylinder.", "قريب من باقي الأسطوانات.", "Close to the other cylinders.", ["Compression gauge"])],
  },
  {
    code: "P0171", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "System Too Lean (Bank 1)", titleAr: "الخليط فقير (هواء زائد) — البنك 1",
    meaningAr: "وحدة المحرك تضيف وقودًا أكثر من الحد لتعويض هواء زائد أو وقود ناقص في البنك 1. هذا الكود وصف لحالة وليس اسم قطعة.",
    meaningEn: "The engine computer is adding more fuel than its limit to compensate for extra air or too little fuel on bank 1. It describes a condition, not a part.",
    symptoms: [s("خمول غير مستقر", "Unstable idle"), s("تقطيع عند التسارع", "Hesitation"), s("قد لا توجد أعراض واضحة", "Sometimes no obvious symptoms")],
    causes: [s("تسريب هواء بعد حساس الهواء", "Unmetered air leak after the MAF"), s("حساس تدفق الهواء MAF متسخ", "Dirty MAF sensor"), s("ضغط وقود منخفض (طرمبة/فلتر)", "Low fuel pressure (pump/filter)"), s("تسريب في العادم قبل حساس الأوكسجين", "Exhaust leak before the O2 sensor")],
    checks: [SCAN_FREEZE, VISUAL_VACUUM, LIVE_DATA_FT, SMOKE_TEST,
      c("fuel-pressure", "workshop", 3, "قياس ضغط الوقود ومقارنته بالمواصفة.", "Measure fuel pressure against specification.", "ضمن المواصفة تحت الحمل.", "Within spec under load.", ["Fuel pressure gauge"], "لا تفك خطوط الوقود بنفسك.", "Do not open fuel lines yourself.")],
  },
  {
    code: "P0174", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "System Too Lean (Bank 2)", titleAr: "الخليط فقير — البنك 2",
    meaningAr: "مثل P0171 لكن في البنك 2 (محركات V). ظهور P0171 وP0174 معًا يرجّح سببًا مشتركًا للبنكين مثل حساس الهواء أو ضغط الوقود أو تسريب في المجمّع.",
    meaningEn: "Like P0171 but on bank 2 (V engines). P0171 and P0174 together point to a cause common to both banks such as the MAF, fuel pressure or an intake leak.",
    symptoms: [s("خمول غير مستقر", "Unstable idle"), s("ضعف عند التسارع", "Hesitation")],
    causes: [s("تسريب هواء في المجمّع", "Intake manifold leak"), s("حساس MAF", "MAF sensor"), s("ضغط وقود منخفض", "Low fuel pressure")],
    checks: [SCAN_FREEZE, VISUAL_VACUUM, LIVE_DATA_FT, SMOKE_TEST],
  },
  {
    code: "P0172", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "System Too Rich (Bank 1)", titleAr: "الخليط غني (وقود زائد) — البنك 1",
    meaningAr: "وحدة المحرك تقلل الوقود لأقصى حد لتعويض وقود زائد أو هواء ناقص في البنك 1.",
    meaningEn: "The engine computer is removing as much fuel as it can to compensate for too much fuel or too little air on bank 1.",
    symptoms: [s("رائحة وقود من العادم", "Fuel smell from exhaust"), s("دخان أسود", "Black smoke"), s("استهلاك وقود عالٍ", "High fuel consumption")],
    causes: [s("فلتر هواء مسدود", "Clogged air filter"), s("حساس MAF يعطي قراءة خاطئة", "MAF reading wrong"), s("بخاخ يسرّب", "Leaking injector"), s("منظم ضغط وقود", "Fuel pressure regulator")],
    checks: [SCAN_FREEZE,
      c("air-filter", "home", 1, "افحص فلتر الهواء بصريًا.", "Visually inspect the air filter.", "نظيف وغير مسدود.", "Clean and not blocked.", []),
      LIVE_DATA_FT],
  },
  {
    code: "P0420", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "Catalyst System Efficiency Below Threshold (Bank 1)", titleAr: "كفاءة المحفّز (دبة البيئة) أقل من الحد — البنك 1",
    meaningAr: "حساس الأوكسجين بعد المحفّز يرى إشارة قريبة من الحساس الأمامي، ما يعني أن المحفّز لا يخزن الأوكسجين كما يجب. ليس دائمًا عطل المحفّز نفسه.",
    meaningEn: "The downstream O2 sensor signal looks too similar to the upstream one, meaning the converter is not storing oxygen as expected. It is not always the converter itself.",
    symptoms: [s("غالبًا لا أعراض قيادة", "Often no driveability symptoms"), s("قد تفشل السيارة في فحص الانبعاثات", "May fail an emissions test")],
    causes: [s("محفّز ضعيف", "Worn catalytic converter"), s("تسريب عادم قرب الحساسات", "Exhaust leak near the sensors"), s("حساس أوكسجين خلفي بطيء", "Slow downstream O2 sensor"), s("احتراق ناقص سابق أو زيت يحترق", "Previous misfire or oil burning")],
    checks: [SCAN_FREEZE,
      c("other-codes-first", "home", 0, "عالج أي أكواد احتراق ناقص أو خليط أولًا؛ استبدال المحفّز قبل ذلك قد يتلف المحفّز الجديد.", "Fix any misfire or mixture codes first; replacing the converter before that can damage the new one.", "لا توجد أكواد أخرى.", "No other codes present.", []),
      c("o2-waveforms", "workshop", 2, "مقارنة إشارات حساس الأوكسجين الأمامي والخلفي.", "Compare upstream and downstream O2 sensor signals.", "الخلفي ثابت نسبيًا بينما الأمامي يتذبذب.", "Downstream stays fairly steady while upstream switches.", ["Scan tool / oscilloscope"]),
      c("exhaust-leak", "workshop", 2, "فحص تسريب العادم.", "Check for exhaust leaks.", "لا تسريب.", "No leak.", [])],
  },
  {
    code: "P0442", system: "powertrain", baseUrgency: "monitor", skillLevel: "intermediate",
    titleEn: "Evaporative Emission System Leak Detected (Small Leak)", titleAr: "تسريب صغير في نظام أبخرة الوقود EVAP",
    meaningAr: "نظام EVAP الذي يحتجز أبخرة البنزين رصد تسريبًا صغيرًا. غالبًا لا يؤثر على القيادة.",
    meaningEn: "The EVAP system, which traps fuel vapour, detected a small leak. Usually no effect on driving.",
    symptoms: [s("ضوء المحرك فقط غالبًا", "Usually only the check-engine light"), s("رائحة بنزين خفيفة أحيانًا", "Sometimes a faint fuel smell")],
    causes: [s("غطاء خزان الوقود غير محكم أو تالف", "Loose or worn fuel cap"), s("خرطوم EVAP متشقق", "Cracked EVAP hose"), s("صمام Purge أو Vent", "Purge or vent valve")],
    checks: [c("fuel-cap", "home", 0, "تأكد أن غطاء الخزان مغلق حتى يطقطق، وأن الحلقة المطاطية سليمة.", "Make sure the fuel cap clicks shut and its rubber seal is intact.", "الغطاء محكم والسيل سليم.", "Cap tight and seal intact.", []), SMOKE_TEST],
  },
  {
    code: "P0455", system: "powertrain", baseUrgency: "monitor", skillLevel: "intermediate",
    titleEn: "Evaporative Emission System Leak Detected (Large Leak)", titleAr: "تسريب كبير في نظام أبخرة الوقود EVAP",
    meaningAr: "رُصد تسريب كبير في نظام EVAP، وأشهر أسبابه غطاء خزان مفتوح أو مفقود. إذا شممت رائحة بنزين قوية فهذا أمر مختلف ويحتاج فحصًا فوريًا.",
    meaningEn: "A large EVAP leak was detected; the most common cause is an open or missing fuel cap. A strong fuel smell is a different matter and needs immediate inspection.",
    symptoms: [s("ضوء المحرك", "Check-engine light"), s("رائحة بنزين أحيانًا", "Possible fuel smell")],
    causes: [s("غطاء خزان مفتوح أو مفقود", "Fuel cap open or missing"), s("خرطوم EVAP مفصول", "Disconnected EVAP hose"), s("صمام Vent عالق", "Stuck vent valve")],
    checks: [c("fuel-cap", "home", 0, "تأكد أن غطاء الخزان مغلق حتى يطقطق، وأن الحلقة المطاطية سليمة.", "Make sure the fuel cap clicks shut and its rubber seal is intact.", "الغطاء محكم والسيل سليم.", "Cap tight and seal intact.", []), SMOKE_TEST],
  },
  {
    code: "P0128", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)", titleAr: "حرارة سائل التبريد أقل من حرارة عمل الثرموستات",
    meaningAr: "المحرك يأخذ وقتًا أطول من المتوقع للوصول لحرارة العمل، وغالبًا الثرموستات عالق مفتوحًا.",
    meaningEn: "The engine takes longer than expected to reach operating temperature; often a thermostat stuck open.",
    symptoms: [s("مؤشر الحرارة منخفض", "Low temperature gauge"), s("التدفئة ضعيفة في الشتاء", "Weak cabin heat in winter"), s("استهلاك وقود أعلى", "Higher fuel use")],
    causes: [s("ثرموستات عالق مفتوحًا", "Thermostat stuck open"), s("حساس حرارة سائل التبريد", "Coolant temperature sensor"), s("مستوى سائل تبريد منخفض", "Low coolant level")],
    checks: [c("coolant-level-cold", "home", 1, "افحص مستوى سائل التبريد في الخزان الإضافي والمحرك بارد فقط.", "Check the coolant level in the reservoir with the engine COLD only.", "بين علامتي MIN وMAX.", "Between MIN and MAX marks.", [], "لا تفتح غطاء الرديتر والمحرك حار.", "Never open the radiator cap when hot."),
      c("ect-live", "workshop", 2, "مراقبة حرارة المحرك في البيانات الحية أثناء الإحماء.", "Watch engine coolant temperature in live data while warming up.", "ترتفع بانتظام لتصل نحو 85–100°م في أغلب السيارات.", "Rises steadily to roughly 85–100 °C on most cars.", ["Scan tool"])],
  },
  {
    code: "P0118", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "Engine Coolant Temperature Sensor 1 Circuit High", titleAr: "إشارة حساس حرارة سائل التبريد مرتفعة (دائرة)",
    meaningAr: "إشارة حساس حرارة المحرك خارج المدى (جهد عالٍ)، وغالبًا تعني دائرة مفتوحة أو موصلًا مفكوكًا وليس حرارة حقيقية.",
    meaningEn: "The coolant temperature sensor signal is out of range high, usually an open circuit or loose connector rather than real temperature.",
    symptoms: [s("مروحة الرديتر تعمل باستمرار", "Radiator fan runs constantly"), s("صعوبة تشغيل", "Hard starting"), s("قراءة حرارة غير منطقية", "Implausible temperature reading")],
    causes: [s("موصل الحساس مفكوك أو متأكسد", "Loose or corroded sensor connector"), s("سلك مقطوع", "Broken wire"), s("حساس تالف", "Failed sensor")],
    checks: [c("connector-visual", "home", 1, "افحص بصريًا موصل حساس الحرارة والمحرك بارد ومطفأ.", "Visually inspect the coolant sensor connector with the engine cold and off.", "مثبت وغير متأكسد.", "Seated and not corroded.", ["Flashlight"]),
      c("sensor-circuit", "workshop", 3, "قياس مقاومة الحساس وفحص الأسلاك بالمخطط.", "Measure sensor resistance and test wiring against the diagram.", "مطابق لجدول المواصفة.", "Matches the spec table.", ["Multimeter", "Wiring diagram"])],
  },
  {
    code: "P0101", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "Mass or Volume Air Flow Sensor \"A\" Circuit Range/Performance", titleAr: "أداء حساس تدفق الهواء MAF خارج المدى المتوقع",
    meaningAr: "قراءة حساس تدفق الهواء لا تتوافق مع ما تتوقعه وحدة المحرك من الدورات والحمل.",
    meaningEn: "The MAF reading does not agree with what the engine computer expects for the rpm and load.",
    symptoms: [s("ضعف عزم", "Low power"), s("تقطيع", "Hesitation"), s("خمول غير مستقر", "Unstable idle")],
    causes: [s("حساس MAF متسخ", "Dirty MAF"), s("تسريب هواء", "Air leak"), s("فلتر هواء مسدود", "Clogged air filter"), s("حساس تالف", "Failed sensor")],
    checks: [c("air-filter", "home", 1, "افحص فلتر الهواء بصريًا.", "Visually inspect the air filter.", "نظيف وغير مسدود.", "Clean and not blocked.", []), VISUAL_VACUUM,
      c("maf-live", "workshop", 2, "مقارنة قراءة MAF على الخمول والدورات العالية بالقيم المرجعية.", "Compare MAF readings at idle and higher rpm to reference values.", "ضمن المدى المرجعي للمحرك.", "Within the engine's reference range.", ["Scan tool"])],
  },
  {
    code: "P0133", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)", titleAr: "استجابة بطيئة لحساس الأوكسجين الأمامي — البنك 1",
    meaningAr: "حساس الأوكسجين قبل المحفّز يتبدل ببطء أكثر من المتوقع.",
    meaningEn: "The upstream oxygen sensor is switching more slowly than expected.",
    symptoms: [s("استهلاك وقود أعلى", "Higher fuel use"), s("غالبًا لا أعراض", "Often no symptoms")],
    causes: [s("حساس قديم أو ملوث", "Aged or contaminated sensor"), s("تسريب عادم قبل الحساس", "Exhaust leak before the sensor"), s("مشكلة خليط", "Mixture problem")],
    checks: [SCAN_FREEZE, c("o2-waveforms", "workshop", 2, "مراقبة إشارة الحساس الأمامي.", "Watch the upstream sensor signal.", "تبدّل سريع ومنتظم.", "Fast, regular switching.", ["Scan tool / oscilloscope"])],
  },
  {
    code: "P0135", system: "powertrain", baseUrgency: "soon", skillLevel: "intermediate",
    titleEn: "O2 Sensor Heater Circuit (Bank 1 Sensor 1)", titleAr: "دائرة تسخين حساس الأوكسجين الأمامي — البنك 1",
    meaningAr: "عطل في سخان حساس الأوكسجين أو دائرته (فيوز، سلك، أو السخان نفسه).",
    meaningEn: "Fault in the oxygen sensor heater or its circuit (fuse, wiring, or the heater element).",
    symptoms: [s("غالبًا ضوء المحرك فقط", "Usually only the check-engine light")],
    causes: [s("سخان الحساس تالف", "Failed heater element"), s("فيوز السخان", "Heater fuse"), s("سلك مقطوع", "Broken wire")],
    checks: [c("fuse-check", "home", 1, "افحص فيوز سخان الحساس حسب دليل السيارة.", "Check the O2 heater fuse per the owner's manual.", "الفيوز سليم.", "Fuse intact.", []),
      c("heater-resistance", "workshop", 3, "قياس مقاومة السخان وجهد التغذية.", "Measure heater resistance and supply voltage.", "ضمن المواصفة.", "Within spec.", ["Multimeter"])],
  },
  {
    code: "P0401", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "Exhaust Gas Recirculation \"A\" Flow Insufficient Detected", titleAr: "تدفق غير كافٍ في نظام EGR",
    meaningAr: "وحدة المحرك لم ترَ التغيير المتوقع عند فتح صمام إعادة تدوير غازات العادم.",
    meaningEn: "The engine computer did not see the expected change when the EGR valve was commanded open.",
    symptoms: [s("طقطقة عند التسارع (Knock)", "Pinging under acceleration"), s("قد لا توجد أعراض", "May have no symptoms")],
    causes: [s("ممرات EGR مسدودة بالكربون", "Carbon-clogged EGR passages"), s("صمام EGR عالق", "Stuck EGR valve"), s("حساس أو صمام تحكم", "Sensor or control solenoid")],
    checks: [SCAN_FREEZE, c("egr-command", "workshop", 2, "تشغيل صمام EGR بجهاز الفحص ومراقبة الاستجابة.", "Command the EGR valve with a scan tool and watch the response.", "تغيير واضح في الدورات أو MAP.", "Clear change in rpm or MAP.", ["Bidirectional scan tool"])],
  },
  {
    code: "P0335", system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop",
    titleEn: "Crankshaft Position Sensor \"A\" Circuit", titleAr: "دائرة حساس موضع عمود الكرنك",
    meaningAr: "وحدة المحرك لا ترى إشارة حساس الكرنك كما يجب. هذا قد يسبب انطفاء المحرك أثناء القيادة أو عدم التشغيل.",
    meaningEn: "The engine computer is not seeing a proper crankshaft position signal. This can cause stalling while driving or a no-start.",
    symptoms: [s("انطفاء مفاجئ", "Sudden stalling"), s("صعوبة أو عدم تشغيل", "Hard or no start"), s("عداد الدورات لا يتحرك عند التشغيل", "Tachometer does not move while cranking")],
    causes: [s("حساس الكرنك", "Crankshaft sensor"), s("موصل أو أسلاك", "Connector or wiring"), s("حلقة الإشارة تالفة", "Damaged reluctor ring")],
    checks: [SCAN_FREEZE, c("ckp-signal", "workshop", 3, "فحص إشارة الحساس بالأوسيلوسكوب وفحص الأسلاك.", "Check the sensor signal with a scope and test wiring.", "إشارة نظيفة ومنتظمة.", "Clean, regular signal.", ["Oscilloscope", "Wiring diagram"])],
  },
  {
    code: "P0340", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "Camshaft Position Sensor \"A\" Circuit (Bank 1 or Single Sensor)", titleAr: "دائرة حساس موضع عمود الكامات",
    meaningAr: "مشكلة في إشارة حساس الكامات. أحيانًا ترتبط بتوقيت المحرك (السير أو الجنزير).",
    meaningEn: "Problem with the camshaft sensor signal. Sometimes related to engine timing (belt or chain).",
    symptoms: [s("تشغيل طويل", "Long cranking"), s("ضعف أداء", "Poor performance")],
    causes: [s("الحساس", "The sensor"), s("أسلاك أو موصل", "Wiring or connector"), s("توقيت المحرك خارج الضبط", "Engine timing out of spec")],
    checks: [SCAN_FREEZE, c("cmp-signal", "workshop", 3, "فحص الإشارة وتزامنها مع حساس الكرنك.", "Check the signal and its correlation with the crank sensor.", "تزامن ضمن المواصفة.", "Correlation within spec.", ["Oscilloscope"])],
  },
  {
    code: "P0087", system: "powertrain", baseUrgency: "urgent", skillLevel: "workshop", safetyArea: "fuel",
    titleEn: "Fuel Rail/System Pressure - Too Low", titleAr: "ضغط الوقود في السكة/النظام منخفض جدًا",
    meaningAr: "ضغط الوقود أقل مما تطلبه وحدة المحرك. قد يسبب ضعفًا شديدًا أو انطفاءً. أنظمة الحقن المباشر والديزل تعمل بضغوط عالية جدًا وفكّها خطر.",
    meaningEn: "Fuel pressure is lower than commanded. It can cause severe power loss or stalling. Direct-injection and diesel systems run at very high pressure and are dangerous to open.",
    symptoms: [s("ضعف شديد في العزم", "Severe loss of power"), s("انطفاء", "Stalling"), s("صعوبة تشغيل", "Hard starting")],
    causes: [s("فلتر وقود مسدود", "Clogged fuel filter"), s("طرمبة وقود ضعيفة", "Weak fuel pump"), s("حساس ضغط السكة", "Rail pressure sensor"), s("منظم الضغط", "Pressure regulator")],
    checks: [SCAN_FREEZE, c("fuel-pressure-pro", "specialist", 4, "قياس ضغط الوقود المطلوب والفعلي بأدوات الورشة فقط.", "Measure commanded vs actual fuel pressure with workshop equipment only.", "الفعلي يتبع المطلوب.", "Actual follows commanded.", ["Scan tool", "Fuel pressure equipment"])],
  },
  {
    code: "P0562", system: "powertrain", baseUrgency: "soon", skillLevel: "diy",
    titleEn: "System Voltage Low", titleAr: "جهد النظام الكهربائي منخفض",
    meaningAr: "وحدة التحكم ترى جهد تغذية أقل من المتوقع. السبب غالبًا في البطارية أو الدينمو أو التوصيلات.",
    meaningEn: "A control module sees lower supply voltage than expected, usually the battery, alternator or connections.",
    symptoms: [s("إضاءة خافتة", "Dim lights"), s("صعوبة تشغيل", "Hard starting"), s("ضوء الشحن", "Charging light")],
    causes: [s("بطارية ضعيفة", "Weak battery"), s("دينمو (مولد) لا يشحن", "Alternator not charging"), s("أقطاب متأكسدة أو أرضي ضعيف", "Corroded terminals or poor ground"), s("سير الدينمو", "Alternator belt")],
    checks: [BATTERY_VOLT, c("terminals", "home", 1, "افحص أقطاب البطارية بصريًا وتأكد أنها مشدودة.", "Inspect battery terminals and make sure they are tight.", "نظيفة ومشدودة.", "Clean and tight.", ["Flashlight"]),
      c("charging-test", "workshop", 2, "اختبار نظام الشحن والبطارية بجهاز فحص البطاريات.", "Battery and charging system test with a tester.", "البطارية والدينمو ضمن المواصفة.", "Battery and alternator within spec.", ["Battery/charging tester"])],
  },
  {
    code: "P0700", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "Transmission Control System (MIL Request)", titleAr: "نظام التحكم بناقل الحركة يطلب إضاءة ضوء المحرك",
    meaningAr: "هذا الكود يعني أن وحدة ناقل الحركة سجّلت عطلًا خاصًا بها. الكود الحقيقي مخزن في وحدة ناقل الحركة ويحتاج جهازًا يقرأها.",
    meaningEn: "The transmission module stored its own fault. The specific code lives in the transmission module and needs a scanner that can read it.",
    symptoms: [s("تبديل قاسٍ أو متأخر", "Harsh or delayed shifts"), s("وضع الطوارئ (غيار واحد)", "Limp mode (one gear)")],
    causes: [s("أي عطل في نظام ناقل الحركة — يتحدد من كود وحدة TCM", "Any transmission fault — identified by the TCM code")],
    checks: [c("read-tcm", "workshop", 1, "قراءة أكواد وحدة ناقل الحركة (TCM) بجهاز يدعمها.", "Read transmission module (TCM) codes with a capable scanner.", "الحصول على الكود المحدد.", "Obtain the specific code.", ["Scan tool with TCM access"]),
      c("atf-level", "workshop", 2, "فحص مستوى وحالة زيت القير حسب إجراء الشركة المصنعة.", "Check transmission fluid level/condition per the manufacturer procedure.", "المستوى صحيح والزيت غير محروق.", "Correct level, not burnt.", [])],
  },
  {
    code: "P0500", system: "powertrain", baseUrgency: "soon", skillLevel: "workshop",
    titleEn: "Vehicle Speed Sensor \"A\"", titleAr: "حساس سرعة المركبة",
    meaningAr: "وحدة التحكم لا تستقبل إشارة سرعة منطقية.",
    meaningEn: "The control module is not receiving a plausible vehicle speed signal.",
    symptoms: [s("عداد السرعة لا يعمل", "Speedometer not working"), s("تبديل غير طبيعي", "Abnormal shifting"), s("قد يضيء ضوء ABS", "ABS light may come on")],
    causes: [s("الحساس", "Sensor"), s("أسلاك", "Wiring"), s("مصدر الإشارة من وحدة ABS في بعض السيارات", "Signal source is the ABS module on some cars")],
    checks: [SCAN_FREEZE, c("vss-live", "workshop", 2, "مقارنة سرعة الحساس بسرعة العجلات في البيانات الحية.", "Compare sensor speed with wheel speeds in live data.", "متطابقة.", "They match.", ["Scan tool"])],
  },
  {
    code: "C0035", system: "chassis", baseUrgency: "urgent", skillLevel: "workshop", safetyArea: "brakes",
    titleEn: "Left Front Wheel Speed Sensor Circuit", titleAr: "دائرة حساس سرعة العجلة الأمامية اليسرى",
    meaningAr: "وحدة ABS لا ترى إشارة سليمة من حساس العجلة الأمامية اليسرى، فيتعطل منع انغلاق العجلات وقد يتعطل التحكم بالثبات.",
    meaningEn: "The ABS module is not getting a valid signal from the left-front wheel sensor; anti-lock braking and possibly stability control are disabled.",
    symptoms: [s("ضوء ABS", "ABS light"), s("ضوء التحكم بالثبات", "Stability control light")],
    causes: [s("الحساس", "Sensor"), s("سلك تالف قرب العجلة", "Damaged wire near the wheel"), s("حلقة الإشارة أو الرولمان", "Tone ring or hub bearing")],
    checks: [c("wss-pro", "workshop", 2, "فحص إشارات حساسات العجلات بجهاز الفحص ثم الأسلاك.", "Check wheel-speed signals with a scan tool, then the wiring.", "إشارة الحساس تطابق باقي العجلات.", "Sensor signal matches the other wheels.", ["Scan tool"])],
  },
  {
    code: "B0001", system: "body", baseUrgency: "urgent", skillLevel: "specialist", safetyArea: "airbag",
    titleEn: "Driver Frontal Stage 1 Deployment Control", titleAr: "دائرة تفعيل الوسادة الهوائية الأمامية للسائق — المرحلة 1",
    meaningAr: "عطل في دائرة الوسادة الهوائية الأمامية للسائق. قد لا تنفتح الوسادة عند الحادث. العمل على الوسائد الهوائية خطر ويحتاج مختصًا.",
    meaningEn: "Fault in the driver frontal airbag circuit. The airbag may not deploy in a crash. Airbag work is hazardous and requires a specialist.",
    symptoms: [s("ضوء الوسادة الهوائية", "Airbag light")],
    causes: [s("الشريط الحلزوني (Clock spring)", "Clock spring"), s("موصل أو أسلاك", "Connector or wiring"), s("وحدة الوسادة", "Airbag module")],
    checks: [c("srs-pro", "specialist", 4, "فحص نظام الوسائد الهوائية لدى مختص بالأدوات والإجراءات الآمنة.", "Airbag system inspection by a specialist with proper tools and safety procedure.", "تحديد الجزء المسبب.", "Identify the faulty part.", ["SRS-capable scan tool"])],
  },
  {
    code: "U0100", system: "network", baseUrgency: "urgent", skillLevel: "workshop",
    titleEn: "Lost Communication With ECM/PCM \"A\"", titleAr: "فقدان الاتصال مع وحدة التحكم بالمحرك",
    meaningAr: "وحدة أخرى في السيارة فقدت الاتصال بوحدة المحرك عبر شبكة CAN. قد يرتبط بالجهد الكهربائي أو التوصيلات.",
    meaningEn: "Another module lost communication with the engine module over the CAN network, often related to voltage or connections.",
    symptoms: [s("أضواء تحذير متعددة", "Multiple warning lights"), s("عدم تشغيل أو انطفاء", "No-start or stalling"), s("عدادات لا تعمل", "Gauges not working")],
    causes: [s("جهد بطارية منخفض", "Low battery voltage"), s("موصلات أو أرضيات", "Connectors or grounds"), s("أسلاك الشبكة", "Network wiring"), s("وحدة المحرك", "Engine module")],
    checks: [BATTERY_VOLT, c("network-check", "workshop", 3, "فحص شبكة CAN (المقاومة والإشارات) والأرضيات.", "Test the CAN network (resistance and signals) and grounds.", "قيم ضمن المواصفة.", "Values within spec.", ["Multimeter", "Oscilloscope"])],
  },
  {
    code: "P0A80", system: "powertrain", baseUrgency: "urgent", skillLevel: "specialist", safetyArea: "high_voltage",
    titleEn: "Replace Hybrid Battery Pack", titleAr: "حزمة بطارية النظام الهجين تحتاج فحصًا/استبدالًا",
    meaningAr: "وحدة التحكم رصدت فرقًا غير طبيعي بين خلايا بطارية الجهد العالي. لا تلمس الكيبلات البرتقالية ولا تفتح البطارية؛ جهدها قاتل.",
    meaningEn: "The controller detected abnormal differences between high-voltage battery cells. Do not touch orange cables or open the pack; its voltage can kill.",
    symptoms: [s("ضوء النظام الهجين", "Hybrid system warning"), s("المحرك يعمل أكثر من المعتاد", "Engine runs more than usual"), s("ضعف في الأداء", "Reduced performance")],
    causes: [s("خلايا ضعيفة في البطارية", "Weak cells in the pack"), s("تبريد البطارية (مروحة أو فلتر مسدود)", "Battery cooling (blocked fan or filter)"), s("توصيلات داخلية", "Internal connections")],
    checks: [c("hv-cooling-vent", "home", 0, "تأكد أن فتحة تهوية بطارية الهجين (إن وجدت داخل المقصورة) غير مغطاة بأغراض.", "Make sure the hybrid battery air intake (if inside the cabin) is not blocked by objects.", "الفتحة مكشوفة.", "Vent is clear.", []),
      c("hv-pro", "specialist", 4, "فحص الخلايا والتبريد لدى ورشة مؤهلة للجهد العالي.", "Cell and cooling diagnosis at a high-voltage qualified workshop.", "تحديد الخلايا الضعيفة.", "Identify weak cells.", ["HV-qualified equipment"])],
  },
  {
    code: "P0606", system: "powertrain", baseUrgency: "urgent", skillLevel: "specialist",
    titleEn: "Control Module Processor", titleAr: "خلل في معالج وحدة التحكم",
    meaningAr: "وحدة التحكم رصدت خطأً داخليًا في معالجها. قبل الحكم على الوحدة يجب التأكد من الجهد والأرضيات.",
    meaningEn: "The control module detected an internal processor fault. Supply voltage and grounds must be verified before blaming the module.",
    symptoms: [s("انطفاء أو تصرفات غير منتظمة", "Stalling or erratic behaviour"), s("وضع الطوارئ", "Limp mode")],
    causes: [s("جهد أو أرضي سيئ", "Bad supply or ground"), s("تحديث برمجي مطلوب", "Software update required"), s("وحدة التحكم", "The control module")],
    checks: [BATTERY_VOLT, c("module-power", "specialist", 3, "فحص تغذية وأرضيات الوحدة والتحقق من نشرات الشركة.", "Verify module power/grounds and check manufacturer bulletins.", "التغذية سليمة.", "Power and grounds OK.", ["Multimeter", "OEM information"])],
  },
];

/** Iraqi / colloquial part names → technical terms. Draft list; needs field review with local mechanics. */
export const PART_TERMS: Array<{ local: string; ar: string; en: string; category: string }> = [
  { local: "دينمو", ar: "المولد (الدينمو)", en: "Alternator", category: "electrical" },
  { local: "سلف", ar: "بادئ الحركة (السلف)", en: "Starter motor", category: "electrical" },
  { local: "بواجي", ar: "شمعات الإشعال (البواجي)", en: "Spark plugs", category: "ignition" },
  { local: "بوجيات", ar: "شمعات الإشعال (البواجي)", en: "Spark plugs", category: "ignition" },
  { local: "كويل", ar: "ملف الإشعال", en: "Ignition coil", category: "ignition" },
  { local: "كويلات", ar: "ملفات الإشعال", en: "Ignition coils", category: "ignition" },
  { local: "رديتر", ar: "المبرد (الرديتر)", en: "Radiator", category: "cooling" },
  { local: "راديتر", ar: "المبرد (الرديتر)", en: "Radiator", category: "cooling" },
  { local: "ثرموستات", ar: "منظم الحرارة (الثرموستات)", en: "Thermostat", category: "cooling" },
  { local: "بلف", ar: "صمام", en: "Valve", category: "engine" },
  { local: "طرمبة بانزين", ar: "مضخة الوقود", en: "Fuel pump", category: "fuel" },
  { local: "طرمبة بنزين", ar: "مضخة الوقود", en: "Fuel pump", category: "fuel" },
  { local: "بمب بانزين", ar: "مضخة الوقود", en: "Fuel pump", category: "fuel" },
  { local: "طرمبة ماي", ar: "مضخة الماء", en: "Water pump", category: "cooling" },
  { local: "دبة البيئة", ar: "المحفّز (الكتلايزر)", en: "Catalytic converter", category: "exhaust" },
  { local: "كتلايزر", ar: "المحفّز (الكتلايزر)", en: "Catalytic converter", category: "exhaust" },
  { local: "حساس اوكسجين", ar: "حساس الأوكسجين", en: "Oxygen sensor", category: "sensors" },
  { local: "حساس هوا", ar: "حساس تدفق الهواء MAF", en: "Mass air flow sensor", category: "sensors" },
  { local: "بريك", ar: "الفرامل", en: "Brakes", category: "brakes" },
  { local: "قماشات", ar: "وسادات الفرامل (القماشات)", en: "Brake pads", category: "brakes" },
  { local: "هوبات", ar: "أقراص الفرامل", en: "Brake discs", category: "brakes" },
  { local: "رولمان", ar: "محمل (رولمان)", en: "Bearing", category: "suspension" },
  { local: "دبل", ar: "ممتص الصدمات", en: "Shock absorber", category: "suspension" },
  { local: "مساعدات", ar: "ممتصات الصدمات", en: "Shock absorbers", category: "suspension" },
  { local: "ستيرن", ar: "المقود / منظومة التوجيه", en: "Steering", category: "steering" },
  { local: "سكان", ar: "المقود / منظومة التوجيه", en: "Steering", category: "steering" },
  { local: "كير", ar: "ناقل الحركة (القير)", en: "Transmission", category: "transmission" },
  { local: "قير", ar: "ناقل الحركة (القير)", en: "Transmission", category: "transmission" },
  { local: "كلج", ar: "القابض (الكلتش)", en: "Clutch", category: "transmission" },
  { local: "ماطور", ar: "المحرك", en: "Engine", category: "engine" },
  { local: "سير", ar: "سير (حزام)", en: "Belt", category: "engine" },
  { local: "كمبريسن", ar: "ضاغط المكيف", en: "A/C compressor", category: "ac" },
  { local: "فريون", ar: "غاز التبريد (فريون)", en: "Refrigerant", category: "ac" },
  { local: "اكزوز", ar: "العادم", en: "Exhaust", category: "exhaust" },
  { local: "بطرية", ar: "البطارية", en: "Battery", category: "electrical" },
];
