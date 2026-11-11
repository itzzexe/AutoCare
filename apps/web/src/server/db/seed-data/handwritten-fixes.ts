import type { LocalisedItem } from "../schema/knowledge";

/** Common repairs for the hand-written v0.1 definitions — only after the checks confirm the cause. */
const s = (ar: string, en: string): LocalisedItem => ({ ar, en });
const clear = s("امسح الأكواد بعد الإصلاح وقُد دورة اختبار للتأكد أن الكود لم يعد.", "Clear codes after the repair and test-drive to confirm the code does not return.");

export const HANDWRITTEN_FIXES: Record<string, LocalisedItem[]> = {
  P0300: [s("استبدال البواجي المتآكلة (الطقم كاملًا)", "Replace worn spark plugs (full set)"), s("استبدال الكويل الذي ينتقل معه الخلل", "Replace the coil the misfire follows"), s("إصلاح تسريب الفاكيوم إن وُجد", "Fix any vacuum leak"), clear],
  P0301: [s("استبدال بوجي/كويل الأسطوانة 1 بعد اختبار التبديل", "Replace cylinder 1 plug/coil after the swap test"), s("تنظيف/استبدال البخاخ إذا ثبت عطله", "Clean/replace the injector if proven faulty"), clear],
  P0171: [s("إصلاح تسريب الهواء (خرطوم، كاسكيت مجمع السحب، صمام PCV)", "Fix the air leak (hose, intake gasket, PCV valve)"), s("تنظيف حساس MAF بمنظف مخصص", "Clean the MAF sensor with dedicated cleaner"), s("استبدال فلتر/مضخة الوقود إذا كان الضغط منخفضًا", "Replace fuel filter/pump if pressure is low"), clear],
  P0174: [s("إصلاح تسريب الهواء المشترك للبنكين", "Fix the air leak common to both banks"), s("تنظيف MAF أو إصلاح ضغط الوقود", "Clean the MAF or fix fuel pressure"), clear],
  P0172: [s("استبدال فلتر الهواء المسدود", "Replace a clogged air filter"), s("إصلاح البخاخ المسرّب أو حساس MAF", "Repair a leaking injector or MAF"), clear],
  P0420: [s("إصلاح أكواد الاحتراق/الخليط وتسريب العادم أولًا", "First fix misfire/mixture codes and exhaust leaks"), s("استبدال حساس الأوكسجين الخلفي إن ثبت بطؤه", "Replace a slow downstream O2 sensor"), s("استبدال المحفّز فقط بعد تأكيد ضعفه بالاختبار", "Replace the catalyst only after testing confirms it"), clear],
  P0442: [s("استبدال غطاء الخزان إذا كانت حلقته تالفة", "Replace the fuel cap if its seal is worn"), s("إصلاح الخرطوم/الصمام الذي يحدده اختبار الدخان", "Repair the hose/valve found by the smoke test"), clear],
  P0455: [s("إحكام أو استبدال غطاء الخزان", "Tighten or replace the fuel cap"), s("إعادة توصيل/استبدال خرطوم EVAP المفصول", "Reconnect/replace the disconnected EVAP hose"), clear],
  P0128: [s("استبدال الثرموستات بالحرارة الصحيحة", "Replace the thermostat with the correct rating"), s("تعبئة سائل التبريد إن كان ناقصًا", "Top up coolant if low"), clear],
  P0118: [s("إصلاح الموصل أو السلك", "Repair connector or wire"), s("استبدال حساس الحرارة إذا كانت مقاومته خارج الجدول", "Replace the sensor if resistance is off-table"), clear],
  P0101: [s("تنظيف MAF وإصلاح أي تسريب", "Clean MAF and fix any leak"), s("استبدال فلتر الهواء", "Replace air filter"), s("استبدال MAF إذا بقيت القراءة خارج المرجع", "Replace MAF if readings stay off-reference"), clear],
  P0133: [s("إصلاح تسريب العادم قبل الحساس", "Fix the exhaust leak before the sensor"), s("استبدال حساس الأوكسجين الأمامي", "Replace the upstream O2 sensor"), clear],
  P0135: [s("استبدال الفيوز التالف", "Replace a blown fuse"), s("استبدال الحساس إذا كان السخان مفتوحًا", "Replace the sensor if the heater is open"), clear],
  P0401: [s("تنظيف صمام EGR وممراته من الكربون", "Clean carbon from the EGR valve and passages"), s("استبدال الصمام إذا لم يستجب", "Replace the valve if it doesn't respond"), clear],
  P0335: [s("إصلاح الأسلاك أو استبدال حساس الكرنك", "Repair wiring or replace the crank sensor"), clear],
  P0340: [s("إصلاح الأسلاك أو استبدال حساس الكامات", "Repair wiring or replace the cam sensor"), s("فحص التوقيت إذا تكرر الكود", "Check timing if the code returns"), clear],
  P0087: [s("الإصلاح لدى ورشة متخصصة: فلتر/مضخة/منظم الضغط", "Specialist repair: filter/pump/regulator"), clear],
  P0562: [s("شد وتنظيف الأقطاب", "Clean and tighten terminals"), s("استبدال البطارية أو الدينمو بعد الاختبار", "Replace battery or alternator after testing"), clear],
  P0700: [s("قراءة كود TCM المحدد ثم إصلاحه؛ لا تبدل القير بسبب هذا الكود وحده", "Read the specific TCM code and fix it; never replace the transmission for this code alone"), clear],
  P0500: [s("إصلاح الأسلاك أو استبدال الحساس المعني", "Repair wiring or replace the relevant sensor"), clear],
  C0035: [s("إصلاح السلك أو استبدال حساس العجلة/الرولمان لدى ورشة", "Repair wire or replace wheel sensor/hub at a workshop"), clear],
  B0001: [s("الإصلاح لدى مختص فقط بالإجراءات الآمنة", "Repair by a specialist only with safe procedures"), clear],
  U0100: [s("إصلاح البطارية/الأرضي/الموصل أولًا", "Fix battery/ground/connector first"), s("استبدال الوحدة فقط بعد استبعاد الأسلاك", "Replace the module only after ruling out wiring"), clear],
  P0A80: [s("فحص الخلايا والتبريد لدى ورشة مؤهلة للجهد العالي", "Cell and cooling diagnosis at an HV-qualified workshop"), clear],
  P0606: [s("التحقق من التغذية والأرضيات وتحديث البرمجة قبل استبدال الوحدة", "Verify power/grounds and software before replacing the module"), clear],
};
