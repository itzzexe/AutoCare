/**
 * Legal DRAFTS for review by a qualified lawyer in Iraq (and any other
 * jurisdiction where the service is offered or hosted). They describe what
 * the software actually does; they do not assert compliance with any law.
 */
type Doc = { title: string; sections: Array<{ h: string; p: string[] }> };

export const LEGAL: Record<string, { version: string; ar: Doc; en: Doc }> = {
  privacy: {
    version: "privacy-2026.10-draft",
    ar: {
      title: "سياسة الخصوصية (مسودة)",
      sections: [
        { h: "ما نجمعه", p: ["بيانات الحساب: البريد الإلكتروني والاسم الظاهر وكلمة المرور (نحفظ بصمتها بخوارزمية Argon2id ولا نحفظ الكلمة نفسها).", "بيانات السيارة التي تدخلها: الشركة والموديل والسنة والمحرك والعداد، ورقم الشاصي (VIN) إن أدخلته، ويُحفظ مشفّرًا.", "جلسات التشخيص: الأكواد والأعراض ونتائج الفحوص التي تسجلها، والنتيجة المولّدة.", "الطلبات: عنوان التسليم ورقم الهاتف (مشفّران) وتفاصيل الطلب.", "بيانات تقنية محدودة: جزء مختصر من عنوان IP لأغراض الأمان، ونوع المتصفح للجلسات."] },
        { h: "لماذا", p: ["لتقديم الخدمة التي تطلبها، ولحماية الحسابات من الاحتيال والاختراق، وللوفاء بالطلبات مع التجار والورش."] },
        { h: "مع من نشارك", p: ["التاجر يرى وصف القطعة ومواصفات السيارة بدون هويتك. عند الطلب يرى عنوان التسليم الخاص بجزئه من الطلب فقط بعد تأكيده.", "الورشة ترى مواصفات السيارة وملاحظتك، وتقرير التشخيص فقط إذا اخترت مشاركته.", "عند ضغطك «اقرأ بيانات الشاصي» يُرسل رقم الشاصي إلى خدمة NHTSA الأمريكية العامة لقراءته.", "لا نبيع بياناتك. لا نرسل بياناتك إلى نماذج ذكاء اصطناعي سحابية؛ النموذج يعمل على خادم تحت إدارتنا."] },
        { h: "التحسين والتعلّم", p: ["لا تُستخدم حالاتك لتحسين الخدمة إلا بموافقة منفصلة اختيارية يمكنك سحبها. انظر «موافقة المساهمة في التحسين»."] },
        { h: "حقوقك", p: ["تنزيل نسخة من بياناتك، وتصحيحها، وحذف حسابك من صفحة «الخصوصية والبيانات».", "عند الحذف تُزال بياناتك الشخصية؛ تبقى سجلات الطلبات لدى التاجر بدون عنوانك لأغراض المحاسبة، وتنتهي النسخ الاحتياطية وفق جدول الاحتفاظ."] },
        { h: "الاحتفاظ", p: ["سجلات الأمان والتدقيق: حتى ١٢ شهرًا. النسخ الاحتياطية: حتى ٣٥ يومًا. تفاصيل كاملة في وثيقة الاحتفاظ والحذف."] },
      ],
    },
    en: {
      title: "Privacy policy (draft)",
      sections: [
        { h: "What we collect", p: ["Account data: email, display name and password (we store an Argon2id hash, never the password).", "Vehicle data you enter, and the VIN if you provide it (stored encrypted).", "Diagnostic sessions: codes, symptoms, check results and the generated result.", "Orders: delivery address and phone (encrypted) and order details.", "Limited technical data: a truncated IP prefix for security and the browser type for sessions."] },
        { h: "Why", p: ["To provide the service you request, protect accounts from fraud and abuse, and fulfil orders with merchants and workshops."] },
        { h: "Who sees what", p: ["Merchants see the part description and vehicle specs without your identity; on an order they see the delivery address for their own part only after confirming it.", "Workshops see the vehicle specs and your note, and the diagnostic report only if you choose to share it.", "When you press 'Decode VIN' the VIN is sent to the public US NHTSA service.", "We don't sell your data. We don't send it to cloud AI models; the model runs on a server we operate."] },
        { h: "Improvement and learning", p: ["Your cases are used for improvement only with separate, optional, withdrawable consent."] },
        { h: "Your rights", p: ["Download, correct or delete your data from 'Privacy & data'.", "On deletion personal data is removed; merchant order records remain without your address for accounting; backups age out per the retention schedule."] },
        { h: "Retention", p: ["Security/audit logs: up to 12 months. Backups: up to 35 days. See the retention document."] },
      ],
    },
  },
  terms: {
    version: "terms-2026.10-draft",
    ar: {
      title: "شروط الاستخدام (مسودة)",
      sections: [
        { h: "طبيعة الخدمة", p: ["الخدمة تقدم إرشادًا فنيًا عامًا مبنيًا على مصادر محددة، وليست تشخيصًا نهائيًا. القرار النهائي للفحص الفعلي لدى مختص.", "لا نضمن تغطية كل السيارات أو كل الأكواد، ونوضح حدود التغطية في كل صفحة."] },
        { h: "السلامة", p: ["عند أي مؤشر على خطر (رائحة وقود، دخان، ضعف فرامل، أنظمة الجهد العالي) أوقف السيارة بأمان وتواصل مع مختص. لا تنفذ إجراءات على أنظمة السلامة بنفسك."] },
        { h: "السوق", p: ["البيع يتم بين المشتري والتاجر. نعرض ادعاءات التاجر (الأصالة، التوافق) كما هي، ونميزها عما راجعه المشرف أو ما ورد في مصدر مرخّص.", "الإعلانات المدفوعة مميزة بوضوح ولا تؤثر على التوصيات الفنية."] },
        { h: "الحساب", p: ["أنت مسؤول عن سرية كلمة المرور. يمكنك إنهاء جلساتك من صفحة الأمان."] },
      ],
    },
    en: {
      title: "Terms of use (draft)",
      sections: [
        { h: "Nature of the service", p: ["General technical guidance from identified sources, not a final diagnosis. A physical inspection by a professional is decisive.", "We don't guarantee coverage of every vehicle or code and state coverage limits on each page."] },
        { h: "Safety", p: ["On any sign of danger (fuel smell, smoke, weak brakes, high-voltage systems) stop safely and contact a professional. Don't work on safety systems yourself."] },
        { h: "Marketplace", p: ["Sales are between buyer and merchant. Merchant claims (authenticity, fitment) are shown as claims, distinct from moderator-verified or licensed-source data.", "Paid placements are labelled and never affect technical recommendations."] },
        { h: "Account", p: ["Keep your password secret. You can end sessions from the security page."] },
      ],
    },
  },
  "learning-consent": {
    version: "consent-text",
    ar: {
      title: "موافقة المساهمة في تحسين التشخيص",
      sections: [
        { h: "ما الذي توافق عليه", p: ["نسخ حالاتك التي اعتمدها مراجع فني بعد إزالة الاسم ورقم الشاصي والهاتف والعنوان والصور، واستخدام النسخة لتحسين البحث وترتيب الأسباب، وربما لتدريب دوري للنموذج المحلي بعد موافقة إدارية."] },
        { h: "ما لا يحدث", p: ["لا تُستخدم الحالات غير المعتمدة. لا تُرسل البيانات إلى جهات خارجية أو نماذج سحابية. الموافقة ليست شرطًا لاستخدام الخدمة."] },
        { h: "السحب", p: ["يمكنك السحب في أي وقت. نحذف النسخ ونوقف استخدامها فورًا. إذا استُخدمت نسخة في تدريب سابق فلا يمكن إزالة أثرها من ذلك النموذج المدرّب، لكنها تُستبعد من أي تدريب لاحق، ويمكن سحب النموذج حسب سياسة المعالجة."] },
      ],
    },
    en: {
      title: "Consent to help improve diagnosis",
      sections: [
        { h: "What you agree to", p: ["Copying your technician-verified cases after removing name, VIN, phone, address and photos, and using the copy to improve search and cause ranking, and possibly periodic training of the local model after administrative approval."] },
        { h: "What does not happen", p: ["Unverified cases are not used. Data is not sent to third parties or cloud models. Consent is not a condition of using the service."] },
        { h: "Withdrawal", p: ["Withdraw anytime. Copies are deleted and use stops immediately. A copy already used in past training can't be removed from that trained model, but it is excluded from all future training."] },
      ],
    },
  },
  "merchant-policy": {
    version: "merchant-2026.10-draft",
    ar: {
      title: "سياسة التجار والإرجاع (مسودة)",
      sections: [
        { h: "الاعتماد", p: ["يُفعّل حساب التاجر بعد مراجعة المشرف. يمكن تعليق الحساب عند الإخلال بالسياسة."] },
        { h: "الأوصاف", p: ["يجب أن يكون الوصف ورقم القطعة والحالة (جديد/مستعمل/مجدد) صحيحًا. كلمة «أصلي» ادعاء من التاجر حتى يراجعها المشرف بإثبات."] },
        { h: "الأسعار والمخزون", p: ["السعر المعروض ملزم عند تأكيد الطلب. لا يمكن بيع أكثر من المخزون المسجل."] },
        { h: "الإرجاع", p: ["يحق للمشتري طلب الإرجاع خلال مدة الإرجاع المعلنة للقطعة بعد التسليم. حالة الإرجاع تُتابع لكل طلب فرعي."] },
      ],
    },
    en: {
      title: "Merchant & returns policy (draft)",
      sections: [
        { h: "Approval", p: ["Merchant accounts are activated after moderator review and may be suspended for violations."] },
        { h: "Listings", p: ["Descriptions, part numbers and condition must be accurate. 'Genuine' is a seller claim until a moderator verifies evidence."] },
        { h: "Prices & stock", p: ["The listed price is binding at order confirmation. Overselling registered stock is prevented."] },
        { h: "Returns", p: ["Buyers may request a return within the item's stated return window after delivery; returns are tracked per merchant sub-order."] },
      ],
    },
  },
};
