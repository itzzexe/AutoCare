import type { CheckStep, LocalisedItem } from "../schema/knowledge";
import type { SeedDtcWithFixes } from "./dtc-families";

/**
 * Extension of the generic library: additional generic codes grouped by
 * SUBSYSTEM. Each entry carries its standard generic title; the explanation,
 * causes, checks and fixes come from a reviewed-later subsystem template.
 * Unreviewed editorial drafts.
 */

const s = (ar: string, en: string): LocalisedItem => ({ ar, en });
const chk = (id: string, where: CheckStep["where"], inv: number, ar: string, en: string, expAr: string, expEn: string, tools: string[] = []): CheckStep => ({ id, where, invasiveness: inv, ar, en, expectedAr: expAr, expectedEn: expEn, tools });
const scan = chk("scan-freeze-frame", "home", 0, "اقرأ الأكواد مع بيانات Freeze Frame بجهاز OBD-II وسجّلها قبل أي مسح.", "Read the codes with freeze-frame data using an OBD-II scanner and note them before clearing anything.", "تعرف الظروف التي ظهر فيها العطل.", "You learn the conditions when the fault set.", ["OBD-II scanner"]);
const confirmFix = s("امسح الأكواد بعد الإصلاح وقُد السيارة دورة اختبار للتأكد أن الكود لم يعد.", "Clear codes after the repair and do a test drive to confirm the code does not return.");

export interface Sub {
  system: SeedDtcWithFixes["system"];
  meaningAr: string;
  meaningEn: string;
  symptoms: LocalisedItem[];
  causes: LocalisedItem[];
  checks: CheckStep[];
  fixes: LocalisedItem[];
  urgency: SeedDtcWithFixes["baseUrgency"];
  skill: SeedDtcWithFixes["skillLevel"];
  safety?: SeedDtcWithFixes["safetyArea"];
}

const wiring = (id: string, ar: string, en: string) => chk(`connector-${id}`, "home", 1, `افحص بصريًا موصل وأسلاك ${ar} والمحرك مطفأ.`, `With the engine off, visually inspect the ${en} connector and wiring.`, "سليمة ومثبتة.", "Intact and seated.", ["Flashlight"]);
const circuit = (id: string, ar: string, en: string) => chk(`circuit-${id}`, "workshop", 3, `قياس التغذية والأرضي والإشارة في دائرة ${ar} حسب المخطط.`, `Measure power, ground and signal of the ${en} circuit against the diagram.`, "ضمن المواصفة.", "Within spec.", ["Multimeter", "Wiring diagram"]);
const vac = chk("visual-vacuum-hoses", "home", 1, "افحص بصريًا خراطيم الفاكيوم ومجرى الهواء بعد حساس الهواء بحثًا عن تشقق أو انفصال والمحرك مطفأ.", "With the engine off, visually inspect vacuum hoses and the intake duct after the MAF for cracks or disconnections.", "لا تشققات ولا وصلات مفصولة.", "No cracks or loose joints.", ["Flashlight"]);
const smoke = chk("smoke-test", "workshop", 3, "اختبار دخان لنظام السحب أو EVAP في الورشة.", "Workshop smoke test of the intake or EVAP system.", "تحديد مكان التسريب إن وجد.", "Locates any leak.", ["Smoke machine"]);
const tcm = chk("read-tcm", "workshop", 1, "اقرأ أكواد وحدة ناقل الحركة (TCM) بجهاز يدعمها.", "Read transmission module (TCM) codes with a capable scanner.", "الحصول على الكود المحدد والبيانات الحية للقير.", "Get the specific code and live transmission data.", ["Scan tool with TCM access"]);
const atf = chk("atf-level", "workshop", 2, "افحص مستوى وحالة زيت القير حسب إجراء الشركة المصنّعة.", "Check transmission fluid level and condition per the manufacturer procedure.", "المستوى صحيح والزيت غير محروق.", "Correct level, not burnt.", []);
const battery = chk("battery-voltage", "home", 1, "قِس جهد البطارية والمحرك مطفأ ثم وهو يعمل.", "Measure battery voltage engine-off and running.", "حوالي 12.4–12.7 فولت مطفأ و13.5–14.7 فولت أثناء التشغيل.", "About 12.4–12.7 V off and 13.5–14.7 V running.", ["Multimeter"]);

export const SUBS: Record<string, Sub> = {
  fuel_trim: { system: "powertrain", meaningAr: "تصحيح الوقود في هذا الوضع خارج الحدود؛ الكود وصف لحالة الخليط وليس اسم قطعة.", meaningEn: "Fuel trim in this condition is outside its limits; the code describes the mixture, not a part.", symptoms: [s("خمول غير مستقر", "Unstable idle"), s("استهلاك وقود متغير", "Changed fuel consumption")], causes: [s("تسريب هواء (فقير)", "Air leak (lean)"), s("ضغط وقود غير صحيح", "Incorrect fuel pressure"), s("بخاخ يسرّب (غني)", "Leaking injector (rich)"), s("حساس MAF أو الأوكسجين", "MAF or O2 sensor")], checks: [scan, vac, chk("live-fuel-trims", "workshop", 2, "مراقبة Fuel Trim القصير والطويل على الخمول وعند 2500 دورة.", "Watch short/long fuel trims at idle and 2500 rpm.", "تحديد هل المشكلة على الخمول فقط (تسريب) أم تحت الحمل (وقود).", "Tells idle-only (leak) from load (fuel).", ["Scan tool"]), smoke], fixes: [s("إصلاح التسريب أو مصدر الوقود حسب البيانات", "Fix the leak or fuel source the data points to"), confirmFix], urgency: "soon", skill: "intermediate" },
  o2_biased: { system: "powertrain", meaningAr: "إشارة حساس الأوكسجين منحازة أو عالقة على اتجاه واحد مقارنة بالمتوقع.", meaningEn: "The oxygen sensor signal is biased or stuck to one side compared with expectations.", symptoms: [s("ارتفاع استهلاك الوقود", "Higher fuel use")], causes: [s("حساس متقادم أو ملوث", "Aged or contaminated sensor"), s("تسريب عادم أو هواء", "Exhaust or air leak"), s("مشكلة خليط حقيقية", "A real mixture problem")], checks: [scan, chk("o2-waveforms", "workshop", 2, "مراقبة إشارة الحساس في البيانات الحية.", "Watch the sensor signal in live data.", "استجابة طبيعية.", "Normal response.", ["Scan tool"]), chk("exhaust-leak", "workshop", 2, "فحص تسريب العادم قرب الحساس.", "Check exhaust leaks near the sensor.", "لا تسريب.", "No leak.", [])], fixes: [s("إصلاح التسريب أولًا ثم استبدال الحساس إذا ثبت عطله", "Fix leaks first, then replace the sensor if proven faulty"), confirmFix], urgency: "soon", skill: "workshop" },
  wideband: { system: "powertrain", meaningAr: "خلل في دائرة تحكم تيار حساس الأوكسجين العريض النطاق (Wideband/A-F).", meaningEn: "Fault in the wideband (air-fuel) oxygen sensor current-control circuit.", symptoms: [s("ضوء المحرك", "Check-engine light"), s("استهلاك أعلى", "Higher consumption")], causes: [s("الحساس", "Sensor"), s("أسلاك/موصل قرب العادم", "Wiring/connector near the exhaust")], checks: [scan, wiring("af", "حساس الأوكسجين", "oxygen sensor"), circuit("af", "حساس الأوكسجين", "oxygen sensor")], fixes: [s("إصلاح الأسلاك أو استبدال الحساس بعد القياس", "Repair wiring or replace the sensor after measurement"), confirmFix], urgency: "soon", skill: "workshop" },
  intake_leak: { system: "powertrain", meaningAr: "الوحدة رصدت هواءً داخلًا لا يقيسه حساس الهواء (تسريب في نظام السحب).", meaningEn: "The module detected unmetered air entering the intake (intake leak).", symptoms: [s("خمول غير مستقر", "Unstable idle"), s("صوت هسهسة", "Hissing noise")], causes: [s("خرطوم فاكيوم أو كاسكيت مجمع السحب", "Vacuum hose or intake gasket"), s("صمام PCV أو غطاء الزيت", "PCV valve or oil cap")], checks: [scan, vac, smoke], fixes: [s("إصلاح مكان التسريب الذي يحدده اختبار الدخان", "Repair the leak found by the smoke test"), confirmFix], urgency: "soon", skill: "intermediate" },
  runner: { system: "powertrain", meaningAr: "صمامات تغيير طول مجاري السحب لا تعمل كما تطلبه الوحدة.", meaningEn: "Intake runner control flaps are not working as commanded.", symptoms: [s("ضعف عزم في بعض الدورات", "Weak torque in some rpm bands")], causes: [s("ترسبات كربون", "Carbon build-up"), s("مشغّل/حساس الصمامات", "Runner actuator/sensor"), s("خرطوم فاكيوم للمشغّل", "Actuator vacuum hose")], checks: [scan, vac, chk("runner-command", "workshop", 2, "تفعيل مشغّل المجاري بجهاز الفحص ومراقبة الحركة.", "Command the runner actuator and watch movement.", "يتحرك بحرية.", "Moves freely.", ["Bidirectional scan tool"])], fixes: [s("تنظيف أو إصلاح آلية المجاري", "Clean or repair the runner mechanism"), confirmFix], urgency: "monitor", skill: "workshop" },
  throttle: { system: "powertrain", meaningAr: "خلل في نظام الخانق الإلكتروني (موتور الخانق أو حساسات الموضع أو الدواسة)، وقد تدخل السيارة وضع الطوارئ.", meaningEn: "Fault in the electronic throttle system (motor, position sensors or pedal); the car may enter limp mode.", symptoms: [s("وضع الطوارئ (عزم محدود)", "Limp mode (reduced power)"), s("استجابة متأخرة للدواسة", "Delayed pedal response")], causes: [s("بوابة خانق متسخة", "Dirty throttle body"), s("موتور أو حساس داخل البوابة", "Motor or sensor in the throttle body"), s("دواسة الوقود", "Accelerator pedal"), s("أسلاك/موصل", "Wiring/connector")], checks: [scan, wiring("etc", "بوابة الخانق والدواسة", "throttle body and pedal"), chk("etc-live", "workshop", 2, "مقارنة موضع الخانق المطلوب بالفعلي وحساسي الدواسة في البيانات الحية.", "Compare commanded vs actual throttle and both pedal sensors in live data.", "متطابقة.", "In agreement.", ["Scan tool"]), circuit("etc", "الخانق", "throttle")], fixes: [s("تنظيف البوابة وإجراء إعادة تعلّم الخانق", "Clean the throttle body and run a throttle relearn"), s("إصلاح الأسلاك أو استبدال البوابة/الدواسة بعد التأكيد", "Repair wiring or replace throttle body/pedal once confirmed"), confirmFix], urgency: "urgent", skill: "workshop" },
  baro: { system: "powertrain", meaningAr: "خلل في دائرة حساس الضغط الجوي الذي تستخدمه الوحدة لحساب الخليط والارتفاع.", meaningEn: "Fault in the barometric pressure sensor circuit used for mixture and altitude correction.", symptoms: [s("ضعف أداء خفيف", "Slight loss of performance")], causes: [s("الحساس (أحيانًا مدمج في وحدة المحرك)", "Sensor (sometimes inside the ECM)"), s("أسلاك", "Wiring")], checks: [scan, chk("baro-live", "workshop", 2, "مقارنة قراءة الضغط الجوي بالقيمة الفعلية للمنطقة والمحرك مطفأ.", "Compare the barometric reading with local pressure, engine off.", "قريبة من الحقيقية.", "Close to actual.", ["Scan tool"])], fixes: [s("إصلاح الأسلاك أو استبدال الحساس", "Repair wiring or replace the sensor"), confirmFix], urgency: "monitor", skill: "workshop" },
  cooling: { system: "powertrain", meaningAr: "خلل في أداء نظام التبريد أو أحد حساساته أو مضخاته الكهربائية.", meaningEn: "Fault in cooling-system performance, a sensor or an electric pump.", symptoms: [s("حرارة غير مستقرة", "Unstable temperature"), s("تدفئة ضعيفة أو ارتفاع حرارة", "Weak heat or overheating")], causes: [s("ثرموستات", "Thermostat"), s("سائل تبريد ناقص أو هواء في الدورة", "Low coolant or air in the system"), s("مضخة ماء كهربائية/حساس", "Electric pump/sensor")], checks: [scan, chk("coolant-level-cold", "home", 1, "افحص مستوى سائل التبريد والمحرك بارد فقط.", "Check coolant level with the engine COLD only.", "بين MIN وMAX.", "Between MIN and MAX.", []), chk("ect-live", "workshop", 2, "مراقبة الحرارة في البيانات الحية أثناء الإحماء.", "Watch temperatures in live data while warming up.", "ارتفاع منتظم للحرارة.", "Steady rise.", ["Scan tool"])], fixes: [s("تصحيح المستوى وتنفيس الهواء", "Correct level and bleed air"), s("استبدال الثرموستات/المضخة/الحساس بعد التأكيد", "Replace thermostat/pump/sensor once confirmed"), confirmFix], urgency: "soon", skill: "workshop" },
  evap: { system: "powertrain", meaningAr: "خلل كهربائي أو تسريب في نظام أبخرة الوقود EVAP. لا يؤثر عادة على القيادة.", meaningEn: "Electrical fault or leak in the EVAP system. Usually no effect on driving.", symptoms: [s("ضوء المحرك فقط غالبًا", "Usually only the check-engine light")], causes: [s("صمام Purge/Vent", "Purge/vent valve"), s("أسلاك/موصل", "Wiring/connector"), s("غطاء الخزان", "Fuel cap")], checks: [chk("fuel-cap", "home", 0, "تأكد أن غطاء الخزان محكم وسليم.", "Make sure the fuel cap is tight and intact.", "محكم.", "Tight.", []), wiring("evap", "صمامات EVAP", "EVAP valves"), smoke], fixes: [s("إصلاح الصمام/الدائرة/التسريب المحدد", "Repair the identified valve/circuit/leak"), confirmFix], urgency: "monitor", skill: "workshop" },
  secondary_air: { system: "powertrain", meaningAr: "خلل في نظام حقن الهواء الثانوي الذي يسرّع إحماء المحفّز.", meaningEn: "Fault in the secondary air system that speeds up catalyst warm-up.", symptoms: [s("صوت غير طبيعي من المضخة عند التشغيل البارد", "Unusual pump noise at cold start")], causes: [s("مضخة الهواء", "Air pump"), s("صمام عدم الرجوع/التبديل", "Check/switching valve"), s("ريليه/فيوز", "Relay/fuse")], checks: [scan, chk("sai-pump", "workshop", 2, "تشغيل مضخة الهواء الثانوي وفحص التدفق.", "Run the secondary air pump and check flow.", "تدفق موجود.", "Flow present.", ["Bidirectional scan tool"])], fixes: [s("استبدال المكوّن المتأكد عطله", "Replace the confirmed component"), confirmFix], urgency: "monitor", skill: "workshop" },
  brake_switch: { system: "powertrain", meaningAr: "إشارات مفتاح دواسة الفرامل غير منطقية. قد يؤثر على أضواء الفرامل ومثبت السرعة.", meaningEn: "Brake pedal switch signals are implausible. May affect brake lights and cruise control.", symptoms: [s("أضواء الفرامل لا تعمل أو تبقى مضاءة", "Brake lights off or stuck on"), s("مثبت السرعة لا يعمل", "Cruise control inoperative")], causes: [s("مفتاح الفرامل أو ضبطه", "Brake switch or its adjustment"), s("فيوز/أسلاك", "Fuse/wiring")], checks: [chk("brake-lights", "home", 0, "اطلب من شخص التأكد أن أضواء الفرامل تضيء عند الضغط وتنطفئ عند الرفع.", "Ask someone to confirm brake lights come on and go off with the pedal.", "تعمل بشكل صحيح.", "They work correctly.", [])], fixes: [s("ضبط أو استبدال مفتاح الفرامل لدى ورشة", "Adjust or replace the brake switch at a workshop"), confirmFix], urgency: "urgent", skill: "workshop", safety: "brakes" },
  iac: { system: "powertrain", meaningAr: "خلل في دائرة صمام التحكم بهواء الخمول.", meaningEn: "Fault in the idle air control valve circuit.", symptoms: [s("خمول مرتفع أو منخفض", "High or low idle"), s("انطفاء عند التوقف", "Stalling at stops")], causes: [s("صمام IAC متسخ أو تالف", "Dirty or failed IAC valve"), s("أسلاك", "Wiring")], checks: [scan, wiring("iac", "صمام الخمول", "idle valve"), circuit("iac", "صمام الخمول", "idle valve")], fixes: [s("تنظيف/استبدال الصمام وإعادة تعلّم الخمول", "Clean/replace the valve and relearn idle"), confirmFix], urgency: "soon", skill: "intermediate" },
  cruise: { system: "powertrain", meaningAr: "خلل في إشارات أزرار أو دائرة مثبت السرعة.", meaningEn: "Fault in cruise-control switch signals or circuit.", symptoms: [s("مثبت السرعة لا يعمل", "Cruise control does not work")], causes: [s("أزرار المقود/الشريط الحلزوني", "Steering-wheel switches/clock spring"), s("مفتاح الفرامل", "Brake switch")], checks: [chk("cruise-switch", "workshop", 2, "مراقبة إشارات الأزرار في البيانات الحية.", "Watch switch signals in live data.", "تتغير عند الضغط.", "Change when pressed.", ["Scan tool"])], fixes: [s("إصلاح الأزرار أو الدائرة", "Repair switches or circuit"), confirmFix], urgency: "monitor", skill: "workshop" },
  starter: { system: "powertrain", meaningAr: "خلل في دائرة ريليه أو تحكم بادئ الحركة (السلف).", meaningEn: "Fault in the starter relay/control circuit.", symptoms: [s("السيارة لا تدور أحيانًا", "Sometimes won't crank")], causes: [s("ريليه السلف", "Starter relay"), s("أسلاك/فيوز", "Wiring/fuse"), s("مفتاح وضع القير", "Range switch")], checks: [battery, circuit("starter", "السلف", "starter")], fixes: [s("استبدال الريليه/إصلاح الدائرة", "Replace relay / repair circuit"), confirmFix], urgency: "soon", skill: "workshop" },
  charging: { system: "powertrain", meaningAr: "خلل في دائرة تحكم أو مراقبة الدينمو (المولد).", meaningEn: "Fault in the alternator control or monitoring circuit.", symptoms: [s("ضوء البطارية", "Battery light"), s("بطارية تفرغ", "Battery drains")], causes: [s("الدينمو أو منظم الجهد", "Alternator or regulator"), s("أسلاك/موصل الدينمو", "Alternator wiring/connector")], checks: [battery, circuit("alternator", "الدينمو", "alternator")], fixes: [s("إصلاح الموصل أو استبدال الدينمو بعد الاختبار", "Repair connector or replace the alternator after testing"), confirmFix], urgency: "urgent", skill: "workshop" },
  fuel_pump_ctrl: { system: "powertrain", meaningAr: "خلل في دائرة تحكم مضخة الوقود.", meaningEn: "Fault in the fuel pump control circuit.", symptoms: [s("صعوبة تشغيل أو انطفاء", "Hard start or stalling"), s("ضعف عزم", "Low power")], causes: [s("وحدة/ريليه المضخة", "Pump module/relay"), s("أسلاك", "Wiring"), s("المضخة", "Pump")], checks: [scan, circuit("fuel-pump", "مضخة الوقود", "fuel pump")], fixes: [s("الإصلاح لدى ورشة؛ لا تفتح نظام الوقود بنفسك", "Repair at a workshop; don't open the fuel system yourself"), confirmFix], urgency: "urgent", skill: "workshop", safety: "fuel" },
  immobiliser: { system: "powertrain", meaningAr: "وحدة المحرك لا تتعرف على المفتاح أو على برمجة السيارة.", meaningEn: "The engine module does not recognise the key or the vehicle programming.", symptoms: [s("المحرك لا يشتغل أو يشتغل وينطفئ", "No start, or starts then dies"), s("ضوء المفتاح يومض", "Key light flashing")], causes: [s("شريحة المفتاح", "Key transponder"), s("برمجة الوحدة/رقم الشاصي", "Module programming/VIN"), s("هوائي المفتاح", "Key antenna")], checks: [chk("spare-key", "home", 0, "جرّب المفتاح الاحتياطي.", "Try the spare key.", "يشتغل بالاحتياطي = المفتاح هو المشكلة.", "Starts with spare = key problem.", [])], fixes: [s("برمجة المفتاح أو الوحدة لدى مختص/الوكالة", "Key or module programming at a specialist/dealer"), confirmFix], urgency: "soon", skill: "specialist" },
  ref_voltage: { system: "powertrain", meaningAr: "جهد التغذية المرجعي المشترك لعدة حساسات منخفض أو مرتفع؛ تظهر عادة أكواد حساسات متعددة معًا.", meaningEn: "The shared sensor reference voltage is low or high; several sensor codes usually appear together.", symptoms: [s("أكواد حساسات متعددة", "Multiple sensor codes"), s("وضع الطوارئ", "Limp mode")], causes: [s("حساس به قصر داخلي", "A sensor with an internal short"), s("أسلاك ملامسة للأرضي/التغذية", "Wiring shorted to ground/voltage")], checks: [scan, chk("isolate-sensors", "workshop", 3, "افصل الحساسات على نفس دائرة المرجع واحدًا تلو الآخر حتى يعود الجهد لطبيعته.", "Unplug sensors on the same reference one at a time until the voltage recovers.", "تحديد الحساس المسبب.", "Culprit found.", ["Multimeter"])], fixes: [s("إصلاح الأسلاك أو استبدال الحساس المسبب", "Repair the wiring or replace the culprit sensor"), confirmFix], urgency: "urgent", skill: "workshop" },
  relay: { system: "powertrain", meaningAr: "خلل في دائرة ريليه أو مشغّل تتحكم به وحدة المحرك.", meaningEn: "Fault in a relay/actuator control circuit driven by the engine module.", symptoms: [s("الوظيفة المعنية لا تعمل", "The related function does not work")], causes: [s("الريليه", "Relay"), s("أسلاك/فيوز", "Wiring/fuse")], checks: [scan, circuit("relay", "الريليه", "relay")], fixes: [s("استبدال الريليه/الفيوز أو إصلاح الدائرة", "Replace relay/fuse or repair circuit"), confirmFix], urgency: "soon", skill: "workshop" },
  fan_ctrl: { system: "powertrain", meaningAr: "خلل في دائرة تحكم مروحة التبريد؛ قد ترتفع الحرارة في الزحام.", meaningEn: "Fault in the cooling-fan control circuit; may overheat in traffic.", symptoms: [s("ارتفاع حرارة في الزحام", "Overheating in traffic"), s("المكيف يضعف عند التوقف", "A/C weak when stopped")], causes: [s("ريليه/موديول المروحة", "Fan relay/module"), s("موتور المروحة", "Fan motor")], checks: [chk("fan-runs", "home", 0, "شغّل المكيف وتأكد أن المروحة تعمل.", "Turn the A/C on and check the fan runs.", "تعمل.", "Runs.", []), circuit("fan", "المروحة", "fan")], fixes: [s("إصلاح الريليه/المروحة", "Repair relay/fan"), confirmFix], urgency: "urgent", skill: "workshop" },
  glow: { system: "powertrain", meaningAr: "خلل في دائرة شمعة تسخين لأسطوانة محددة (ديزل)؛ يؤثر على التشغيل البارد.", meaningEn: "Fault in a specific cylinder's glow plug circuit (diesel); affects cold starts.", symptoms: [s("صعوبة تشغيل بارد", "Hard cold start"), s("دخان أبيض عند التشغيل", "White smoke at start")], causes: [s("شمعة التسخين", "Glow plug"), s("أسلاك/موديول", "Wiring/module")], checks: [chk("glow-res", "workshop", 3, "قياس مقاومة شمعة التسخين.", "Measure glow plug resistance.", "ضمن المواصفة.", "Within spec.", ["Multimeter"])], fixes: [s("استبدال الشمعة التالفة (بحذر لتجنب كسرها في الرأس)", "Replace the failed plug (carefully to avoid breaking it in the head)"), confirmFix], urgency: "soon", skill: "workshop" },
  trans_elec: { system: "powertrain", meaningAr: "خلل كهربائي أو منطقي في نظام التحكم بناقل الحركة أو أحد مفاتيحه/حساساته.", meaningEn: "Electrical or logic fault in the transmission control system or one of its switches/sensors.", symptoms: [s("تبديل قاسٍ أو متأخر أو وضع الطوارئ", "Harsh/late shifting or limp mode")], causes: [s("حساس/مفتاح", "Sensor/switch"), s("أسلاك/موصل القير", "Transmission harness/connector"), s("زيت القير", "Transmission fluid")], checks: [tcm, atf], fixes: [s("إصلاح الأسلاك أو المكوّن المحدد؛ لا تبديل كامل للقير قبل التشخيص", "Repair wiring or the specific part; no transmission swap before diagnosis"), confirmFix], urgency: "urgent", skill: "workshop" },
  trans_pressure: { system: "powertrain", meaningAr: "سولينويد التحكم بضغط زيت القير لا يعمل كما يجب، فتصبح التبديلات قاسية أو منزلقة.", meaningEn: "A transmission pressure-control solenoid is not working correctly, making shifts harsh or slipping.", symptoms: [s("تبديل قاسٍ أو انزلاق", "Harsh shifts or slipping")], causes: [s("سولينويد الضغط", "Pressure solenoid"), s("زيت متسخ", "Dirty fluid"), s("جسم الصمامات", "Valve body")], checks: [tcm, atf], fixes: [s("تبديل الزيت ثم استبدال السولينويد/جسم الصمامات بعد التأكيد", "Fluid service, then solenoid/valve body once confirmed"), confirmFix], urgency: "urgent", skill: "workshop" },
  trans_shift: { system: "powertrain", meaningAr: "الانتقال بين غيارين محددين لم يتم كما هو متوقع.", meaningEn: "A specific gear-to-gear shift did not happen as expected.", symptoms: [s("تأخر أو قسوة في تبديل معين", "Delayed or harsh specific shift")], causes: [s("سولينويد", "Solenoid"), s("زيت القير", "Fluid"), s("تآكل داخلي", "Internal wear")], checks: [tcm, atf], fixes: [s("تشخيص لدى ورشة قير", "Diagnose at a transmission shop"), confirmFix], urgency: "urgent", skill: "workshop" },
  network: { system: "network", meaningAr: "فقدان الاتصال أو بيانات غير صالحة من وحدة أخرى عبر شبكة السيارة. الجهد المنخفض والموصلات والأرضيات أكثر الأسباب شيوعًا.", meaningEn: "Lost communication or invalid data from another module over the vehicle network. Low voltage, connectors and grounds are the most common causes.", symptoms: [s("أضواء تحذير متعددة", "Multiple warning lights"), s("وظائف الوحدة المعنية لا تعمل", "Functions of that module not working")], causes: [s("جهد بطارية منخفض", "Low battery voltage"), s("موصل/أرضي الوحدة", "Module connector/ground"), s("أسلاك الشبكة", "Network wiring"), s("الوحدة نفسها أو برمجتها", "The module or its software")], checks: [battery, chk("network-check", "workshop", 3, "فحص تغذية وأرضي الوحدة وشبكة CAN.", "Check module power/ground and the CAN network.", "ضمن المواصفة.", "Within spec.", ["Multimeter", "Oscilloscope"])], fixes: [s("معالجة البطارية/الأرضي أولًا", "Fix battery/ground first"), s("استبدال أو برمجة الوحدة فقط بعد استبعاد الأسلاك", "Replace or program the module only after ruling out wiring"), confirmFix], urgency: "urgent", skill: "workshop" },
  ps: { system: "powertrain", meaningAr: "خلل في حساس/مفتاح ضغط زيت الباور الذي يرفع الخمول عند لف المقود.", meaningEn: "Fault in the power-steering pressure sensor/switch used to raise idle while steering.", symptoms: [s("انخفاض الخمول أو انطفاء عند لف المقود", "Idle dip or stalling while steering")], causes: [s("الحساس/المفتاح", "Sensor/switch"), s("أسلاك", "Wiring")], checks: [wiring("ps", "حساس الباور", "power-steering sensor")], fixes: [s("إصلاح الأسلاك أو استبدال الحساس", "Repair wiring or replace the sensor"), confirmFix], urgency: "soon", skill: "workshop", safety: "steering" },
};

type Row = [code: string, en: string, ar: string, sub: keyof typeof SUBS];
const ROWS: Row[] = [
  // fuel trim / O2 (P2xxx)
  ["P2098", "Post Catalyst Fuel Trim System Too Lean (Bank 2)", "تصحيح الوقود بعد المحفّز فقير — البنك 2", "fuel_trim"],
  ["P2099", "Post Catalyst Fuel Trim System Too Rich (Bank 2)", "تصحيح الوقود بعد المحفّز غني — البنك 2", "fuel_trim"],
  ["P2177", "System Too Lean Off Idle (Bank 1)", "الخليط فقير خارج الخمول — البنك 1", "fuel_trim"],
  ["P2178", "System Too Rich Off Idle (Bank 1)", "الخليط غني خارج الخمول — البنك 1", "fuel_trim"],
  ["P2179", "System Too Lean Off Idle (Bank 2)", "الخليط فقير خارج الخمول — البنك 2", "fuel_trim"],
  ["P2180", "System Too Rich Off Idle (Bank 2)", "الخليط غني خارج الخمول — البنك 2", "fuel_trim"],
  ["P2189", "System Too Lean at Idle (Bank 2)", "الخليط فقير على الخمول — البنك 2", "fuel_trim"],
  ["P2190", "System Too Rich at Idle (Bank 2)", "الخليط غني على الخمول — البنك 2", "fuel_trim"],
  ["P2197", "O2 Sensor Signal Biased/Stuck Lean (Bank 2 Sensor 1)", "إشارة حساس الأوكسجين الأمامي عالقة على فقير — البنك 2", "o2_biased"],
  ["P2198", "O2 Sensor Signal Biased/Stuck Rich (Bank 2 Sensor 1)", "إشارة حساس الأوكسجين الأمامي عالقة على غني — البنك 2", "o2_biased"],
  ["P2272", "O2 Sensor Signal Biased/Stuck Lean (Bank 2 Sensor 2)", "إشارة حساس الأوكسجين الخلفي عالقة على فقير — البنك 2", "o2_biased"],
  ["P2273", "O2 Sensor Signal Biased/Stuck Rich (Bank 2 Sensor 2)", "إشارة حساس الأوكسجين الخلفي عالقة على غني — البنك 2", "o2_biased"],
  ["P2237", "O2 Sensor Positive Current Control Circuit/Open (Bank 1 Sensor 1)", "دائرة تحكم التيار الموجب لحساس الأوكسجين العريض — البنك 1", "wideband"],
  ["P2251", "O2 Sensor Negative Current Control Circuit/Open (Bank 1 Sensor 1)", "دائرة تحكم التيار السالب لحساس الأوكسجين العريض — البنك 1", "wideband"],
  ["P2279", "Intake Air System Leak", "تسريب في نظام هواء السحب", "intake_leak"],
  // intake runners
  ["P2005", "Intake Manifold Runner Control Stuck Open (Bank 2)", "صمامات مجاري السحب عالقة مفتوحة — البنك 2", "runner"],
  ["P2006", "Intake Manifold Runner Control Stuck Closed (Bank 1)", "صمامات مجاري السحب عالقة مغلقة — البنك 1", "runner"],
  ["P2007", "Intake Manifold Runner Control Stuck Closed (Bank 2)", "صمامات مجاري السحب عالقة مغلقة — البنك 2", "runner"],
  ["P2008", "Intake Manifold Runner Control Circuit/Open (Bank 1)", "دائرة تحكم مجاري السحب مفتوحة — البنك 1", "runner"],
  ["P2015", "Intake Manifold Runner Position Sensor/Switch Circuit Range/Performance (Bank 1)", "حساس موضع مجاري السحب خارج المدى — البنك 1", "runner"],
  ["P0660", "Intake Manifold Tuning Valve Control Circuit/Open (Bank 1)", "دائرة صمام ضبط مجمع السحب مفتوحة — البنك 1", "runner"],
  // electronic throttle
  ["P2100", "Throttle Actuator Control Motor Circuit/Open", "دائرة موتور الخانق الإلكتروني مفتوحة", "throttle"],
  ["P2102", "Throttle Actuator Control Motor Circuit Low", "دائرة موتور الخانق الإلكتروني منخفضة", "throttle"],
  ["P2103", "Throttle Actuator Control Motor Circuit High", "دائرة موتور الخانق الإلكتروني مرتفعة", "throttle"],
  ["P2106", "Throttle Actuator Control System - Forced Limited Power", "نظام الخانق الإلكتروني — عزم محدود إجباري", "throttle"],
  ["P2110", "Throttle Actuator Control System - Forced Limited RPM", "نظام الخانق الإلكتروني — دورات محدودة إجباريًا", "throttle"],
  ["P2118", "Throttle Actuator Control Motor Current Range/Performance", "تيار موتور الخانق خارج المدى", "throttle"],
  ["P2122", "Throttle/Pedal Position Sensor/Switch \"D\" Circuit Low", "حساس دواسة الوقود D: إشارة منخفضة", "throttle"],
  ["P2123", "Throttle/Pedal Position Sensor/Switch \"D\" Circuit High", "حساس دواسة الوقود D: إشارة مرتفعة", "throttle"],
  ["P2127", "Throttle/Pedal Position Sensor/Switch \"E\" Circuit Low", "حساس دواسة الوقود E: إشارة منخفضة", "throttle"],
  ["P2128", "Throttle/Pedal Position Sensor/Switch \"E\" Circuit High", "حساس دواسة الوقود E: إشارة مرتفعة", "throttle"],
  ["P2176", "Throttle Actuator Control System - Idle Position Not Learned", "الخانق الإلكتروني — لم يُتعلَّم موضع الخمول", "throttle"],
  // baro
  ["P2227", "Barometric Pressure Circuit Range/Performance", "حساس الضغط الجوي خارج المدى", "baro"],
  ["P2228", "Barometric Pressure Circuit Low", "حساس الضغط الجوي: إشارة منخفضة", "baro"],
  ["P2229", "Barometric Pressure Circuit High", "حساس الضغط الجوي: إشارة مرتفعة", "baro"],
  // cooling
  ["P2181", "Cooling System Performance", "أداء نظام التبريد", "cooling"],
  ["P2183", "Engine Coolant Temperature Sensor 2 Circuit Range/Performance", "حساس حرارة سائل التبريد 2 خارج المدى", "cooling"],
  ["P2184", "Engine Coolant Temperature Sensor 2 Circuit Low", "حساس حرارة سائل التبريد 2: إشارة منخفضة", "cooling"],
  ["P2185", "Engine Coolant Temperature Sensor 2 Circuit High", "حساس حرارة سائل التبريد 2: إشارة مرتفعة", "cooling"],
  ["P2600", "Coolant Pump \"A\" Control Circuit/Open", "دائرة تحكم مضخة سائل التبريد A مفتوحة", "cooling"],
  ["P2601", "Coolant Pump \"A\" Control Circuit Range/Performance", "أداء دائرة مضخة سائل التبريد A", "cooling"],
  // EVAP
  ["P0444", "Evaporative Emission System Purge Control Valve \"A\" Circuit Open", "دائرة صمام Purge مفتوحة", "evap"],
  ["P0445", "Evaporative Emission System Purge Control Valve \"A\" Circuit Shorted", "دائرة صمام Purge بها قصر", "evap"],
  ["P0447", "Evaporative Emission System Vent Control Circuit Open", "دائرة صمام التهوية EVAP مفتوحة", "evap"],
  ["P0448", "Evaporative Emission System Vent Control Circuit Shorted", "دائرة صمام التهوية EVAP بها قصر", "evap"],
  ["P0454", "Evaporative Emission System Pressure Sensor/Switch Intermittent", "انقطاع متقطع في حساس ضغط EVAP", "evap"],
  ["P0458", "Evaporative Emission System Purge Control Valve \"A\" Circuit Low", "دائرة صمام Purge منخفضة", "evap"],
  ["P0459", "Evaporative Emission System Purge Control Valve \"A\" Circuit High", "دائرة صمام Purge مرتفعة", "evap"],
  ["P0497", "Evaporative Emission System Low Purge Flow", "تدفق سحب أبخرة منخفض", "evap"],
  ["P0498", "Evaporative Emission System Vent Valve Control Circuit Low", "دائرة صمام التهوية EVAP منخفضة", "evap"],
  ["P0499", "Evaporative Emission System Vent Valve Control Circuit High", "دائرة صمام التهوية EVAP مرتفعة", "evap"],
  ["P0464", "Fuel Level Sensor \"A\" Circuit Intermittent", "انقطاع متقطع في حساس مستوى الوقود", "evap"],
  // secondary air
  ["P0412", "Secondary Air Injection System Switching Valve \"A\" Circuit", "دائرة صمام تبديل الهواء الثانوي A", "secondary_air"],
  ["P0491", "Secondary Air Injection System Insufficient Flow (Bank 1)", "تدفق هواء ثانوي غير كافٍ — البنك 1", "secondary_air"],
  ["P0492", "Secondary Air Injection System Insufficient Flow (Bank 2)", "تدفق هواء ثانوي غير كافٍ — البنك 2", "secondary_air"],
  ["P2440", "Secondary Air Injection System Switching Valve Stuck Open (Bank 1)", "صمام الهواء الثانوي عالق مفتوحًا — البنك 1", "secondary_air"],
  ["P2444", "Secondary Air Injection System Pump Stuck On (Bank 1)", "مضخة الهواء الثانوي عالقة تعمل — البنك 1", "secondary_air"],
  // idle, brake switch, cruise, PS
  ["P0504", "Brake Switch \"A\"/\"B\" Correlation", "عدم تطابق إشارتي مفتاح الفرامل A/B", "brake_switch"],
  ["P0703", "Brake Switch \"B\" Circuit", "دائرة مفتاح الفرامل B", "brake_switch"],
  ["P0508", "Idle Air Control System Circuit Low", "دائرة صمام هواء الخمول منخفضة", "iac"],
  ["P0509", "Idle Air Control System Circuit High", "دائرة صمام هواء الخمول مرتفعة", "iac"],
  ["P0510", "Closed Throttle Position Switch", "مفتاح موضع الخانق المغلق", "iac"],
  ["P0565", "Cruise Control On Signal", "إشارة تشغيل مثبت السرعة", "cruise"],
  ["P0566", "Cruise Control Off Signal", "إشارة إيقاف مثبت السرعة", "cruise"],
  ["P0567", "Cruise Control Resume Signal", "إشارة استئناف مثبت السرعة", "cruise"],
  ["P0568", "Cruise Control Set Signal", "إشارة ضبط مثبت السرعة", "cruise"],
  ["P0575", "Cruise Control Input Circuit", "دائرة مدخلات مثبت السرعة", "cruise"],
  ["P0550", "Power Steering Pressure Sensor/Switch Circuit", "دائرة حساس/مفتاح ضغط الباور", "ps"],
  // starting, charging, fuel pump, immobiliser, reference, relays, fans, glow
  ["P0615", "Starter Relay Circuit", "دائرة ريليه السلف", "starter"],
  ["P0616", "Starter Relay Circuit Low", "دائرة ريليه السلف منخفضة", "starter"],
  ["P0617", "Starter Relay Circuit High", "دائرة ريليه السلف مرتفعة", "starter"],
  ["P0620", "Generator Control Circuit", "دائرة تحكم الدينمو", "charging"],
  ["P0621", "Generator Lamp/L Terminal Circuit", "دائرة طرف L/لمبة الدينمو", "charging"],
  ["P0622", "Generator Field/F Terminal Circuit", "دائرة طرف F (المجال) للدينمو", "charging"],
  ["P0627", "Fuel Pump \"A\" Control Circuit/Open", "دائرة تحكم مضخة الوقود A مفتوحة", "fuel_pump_ctrl"],
  ["P0628", "Fuel Pump \"A\" Control Circuit Low", "دائرة تحكم مضخة الوقود A منخفضة", "fuel_pump_ctrl"],
  ["P0629", "Fuel Pump \"A\" Control Circuit High", "دائرة تحكم مضخة الوقود A مرتفعة", "fuel_pump_ctrl"],
  ["P0231", "Fuel Pump Secondary Circuit Low", "الدائرة الثانوية لمضخة الوقود منخفضة", "fuel_pump_ctrl"],
  ["P0232", "Fuel Pump Secondary Circuit High", "الدائرة الثانوية لمضخة الوقود مرتفعة", "fuel_pump_ctrl"],
  ["P0513", "Invalid Immobilizer Key", "مفتاح منع السرقة غير صالح", "immobiliser"],
  ["P0630", "VIN Not Programmed or Incompatible - ECM/PCM", "رقم الشاصي غير مبرمج أو غير متوافق في وحدة المحرك", "immobiliser"],
  ["P0642", "Sensor Reference Voltage \"A\" Circuit Low", "الجهد المرجعي للحساسات A منخفض", "ref_voltage"],
  ["P0643", "Sensor Reference Voltage \"A\" Circuit High", "الجهد المرجعي للحساسات A مرتفع", "ref_voltage"],
  ["P0652", "Sensor Reference Voltage \"B\" Circuit Low", "الجهد المرجعي للحساسات B منخفض", "ref_voltage"],
  ["P0653", "Sensor Reference Voltage \"B\" Circuit High", "الجهد المرجعي للحساسات B مرتفع", "ref_voltage"],
  ["P0645", "A/C Clutch Relay Control Circuit", "دائرة ريليه كلتش المكيف", "relay"],
  ["P0685", "ECM/PCM Power Relay Control Circuit/Open", "دائرة ريليه تغذية وحدة المحرك مفتوحة", "relay"],
  ["P0691", "Fan 1 Control Circuit Low", "دائرة مروحة التبريد 1 منخفضة", "fan_ctrl"],
  ["P0692", "Fan 1 Control Circuit High", "دائرة مروحة التبريد 1 مرتفعة", "fan_ctrl"],
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n): Row => [`P067${n}`, `Cylinder ${n} Glow Plug Circuit`, `دائرة شمعة التسخين للأسطوانة ${n}`, "glow"]),
  ["P0381", "Glow Plug/Heater Indicator Circuit", "دائرة لمبة شمعات التسخين", "glow"],
  // transmission
  ["P0701", "Transmission Control System Range/Performance", "أداء نظام التحكم بالقير خارج المدى", "trans_elec"],
  ["P0702", "Transmission Control System Electrical", "خلل كهربائي في نظام التحكم بالقير", "trans_elec"],
  ["P0707", "Transmission Range Sensor \"A\" Circuit Low", "حساس وضع ذراع القير A: إشارة منخفضة", "trans_elec"],
  ["P0708", "Transmission Range Sensor \"A\" Circuit High", "حساس وضع ذراع القير A: إشارة مرتفعة", "trans_elec"],
  ["P0714", "Transmission Fluid Temperature Sensor \"A\" Circuit Intermittent", "انقطاع متقطع في حساس حرارة زيت القير", "trans_elec"],
  ["P0718", "Turbine/Input Shaft Speed Sensor \"A\" Circuit Intermittent", "انقطاع متقطع في حساس سرعة دخول القير", "trans_elec"],
  ["P0723", "Output Shaft Speed Sensor Circuit Intermittent", "انقطاع متقطع في حساس سرعة خروج القير", "trans_elec"],
  ["P0729", "Gear 6 Incorrect Ratio", "نسبة الغيار السادس غير صحيحة", "trans_shift"],
  ["P0744", "Torque Converter Clutch Solenoid Circuit Intermittent", "انقطاع متقطع في سولينويد قفل محوّل العزم", "trans_pressure"],
  ["P0745", "Pressure Control Solenoid \"A\"", "سولينويد التحكم بالضغط A", "trans_pressure"],
  ["P0746", "Pressure Control Solenoid \"A\" Performance/Stuck Off", "سولينويد الضغط A: أداء ضعيف/عالق مغلقًا", "trans_pressure"],
  ["P0747", "Pressure Control Solenoid \"A\" Stuck On", "سولينويد الضغط A عالق فعّالًا", "trans_pressure"],
  ["P0748", "Pressure Control Solenoid \"A\" Electrical", "سولينويد الضغط A: خلل كهربائي", "trans_pressure"],
  ["P0775", "Pressure Control Solenoid \"B\"", "سولينويد التحكم بالضغط B", "trans_pressure"],
  ["P0776", "Pressure Control Solenoid \"B\" Performance/Stuck Off", "سولينويد الضغط B: أداء ضعيف/عالق مغلقًا", "trans_pressure"],
  ["P0777", "Pressure Control Solenoid \"B\" Stuck On", "سولينويد الضغط B عالق فعّالًا", "trans_pressure"],
  ["P0778", "Pressure Control Solenoid \"B\" Electrical", "سولينويد الضغط B: خلل كهربائي", "trans_pressure"],
  ["P0781", "1-2 Shift", "خلل في التبديل من الأول للثاني", "trans_shift"],
  ["P0782", "2-3 Shift", "خلل في التبديل من الثاني للثالث", "trans_shift"],
  ["P0783", "3-4 Shift", "خلل في التبديل من الثالث للرابع", "trans_shift"],
  ["P0784", "4-5 Shift", "خلل في التبديل من الرابع للخامس", "trans_shift"],
  ["P0850", "Park/Neutral Switch Input Circuit", "دائرة مفتاح وضع P/N", "trans_elec"],
  // network
  ["U0103", "Lost Communication With Gear Shift Control Module \"A\"", "فقدان الاتصال مع وحدة ذراع القير", "network"],
  ["U0107", "Lost Communication With Throttle Actuator Control Module", "فقدان الاتصال مع وحدة الخانق الإلكتروني", "network"],
  ["U0109", "Lost Communication With Fuel Pump Control Module", "فقدان الاتصال مع وحدة مضخة الوقود", "network"],
  ["U0122", "Lost Communication With Vehicle Dynamics Control Module", "فقدان الاتصال مع وحدة التحكم بالثبات", "network"],
  ["U0126", "Lost Communication With Steering Angle Sensor Module", "فقدان الاتصال مع حساس زاوية المقود", "network"],
  ["U0131", "Lost Communication With Power Steering Control Module", "فقدان الاتصال مع وحدة مساعدة التوجيه", "network"],
  ["U0146", "Lost Communication With Gateway \"A\"", "فقدان الاتصال مع وحدة البوابة (Gateway)", "network"],
  ["U0167", "Lost Communication With Vehicle Immobilizer Control Module", "فقدان الاتصال مع وحدة منع السرقة", "network"],
  ["U0184", "Lost Communication With Radio", "فقدان الاتصال مع الراديو", "network"],
  ["U0199", "Lost Communication With Door Control Module \"A\"", "فقدان الاتصال مع وحدة الباب A", "network"],
  ["U0212", "Lost Communication With Steering Column Control Module", "فقدان الاتصال مع وحدة عمود المقود", "network"],
  ["U0300", "Internal Control Module Software Incompatibility", "عدم توافق برمجيات الوحدات", "network"],
  ["U0402", "Invalid Data Received From Transmission Control Module", "بيانات غير صالحة من وحدة القير", "network"],
  ["U0416", "Invalid Data Received From Vehicle Dynamics Control Module", "بيانات غير صالحة من وحدة التحكم بالثبات", "network"],
];

const SAFETY_BY_CODE: Record<string, SeedDtcWithFixes["safetyArea"]> = { U0122: "brakes", U0126: "steering", U0131: "steering", U0212: "steering", U0416: "brakes" };

export function buildExtendedLibrary(exclude: Set<string>): SeedDtcWithFixes[] {
  const seen = new Set(exclude);
  const out: SeedDtcWithFixes[] = [];
  for (const [code, en, ar, key] of ROWS) {
    if (seen.has(code)) continue;
    seen.add(code);
    const t = SUBS[key]!;
    out.push({
      code, titleEn: en, titleAr: ar, system: t.system, meaningAr: t.meaningAr, meaningEn: t.meaningEn,
      symptoms: t.symptoms, causes: t.causes, checks: t.checks, fixes: t.fixes, baseUrgency: t.urgency, skillLevel: t.skill,
      safetyArea: SAFETY_BY_CODE[code] ?? t.safety,
    });
  }
  return out;
}
