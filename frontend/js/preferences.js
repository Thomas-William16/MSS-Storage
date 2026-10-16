// Shared preferences apply to every role and to the sign-in page.
const translations = {
  Overview: "نظرة عامة",
  Equipment: "المعدات",
  Borrowings: "الاستعارات",
  Requests: "الطلبات",
  Maintenance: "الصيانة",
  Categories: "الفئات",
  Reports: "التقارير",
  Users: "المستخدمون",
  "Audit trail": "سجل التدقيق",
  Settings: "الإعدادات",
  "Sign out": "تسجيل الخروج",
  "Scout Storage": "مخزن الكشافة",
  "Ready for adventure": "مستعدون للمغامرة",
  WORKSPACE: "مساحة العمل",
  Workspace: "مساحة العمل",
  "Skip to content": "تخطي إلى المحتوى",
  "Toggle navigation": "فتح القائمة",
  "Loading your workspace…": "جارٍ تحميل مساحة العمل…",
  "Care for our gear.": "اعتنوا بمعداتنا.",
  "Make every adventure possible.": "لنجعل كل مغامرة ممكنة.",
  "WELCOME BACK": "مرحباً بعودتك",
  "Sign in to your storage": "تسجيل الدخول إلى المخزن",
  "Use the account provided by your administrator.":
    "استخدم الحساب الذي وفره مسؤول النظام.",
  "Email address": "البريد الإلكتروني",
  Password: "كلمة المرور",
  "Sign in": "تسجيل الدخول",
  "Signing in…": "جارٍ تسجيل الدخول…",
  "Good gear.": "معدات جيدة.",
  "Great adventures.": "مغامرات رائعة.",
  "Prepared today. Ready for tomorrow.": "مستعدون اليوم. جاهزون للغد.",
  "Protected access · Your session expires after 8 hours":
    "دخول آمن · تنتهي جلستك بعد ٨ ساعات",
  "Storage overview": "نظرة عامة على المخزن",
  Available: "متاح",
  Borrowed: "مستعار",
  "Total equipment": "إجمالي المعدات",
  "Recent borrowings": "الاستعارات الأخيرة",
  "My borrowing history": "سجل استعاراتي",
  "Borrowing register": "سجل الاستعارات",
  "Track issued equipment, due dates, and partial returns.":
    "تابع المعدات المستعارة ومواعيد الإرجاع والإرجاع الجزئي.",
  Reference: "المرجع",
  Borrower: "المستعير",
  Purpose: "الغرض",
  Due: "موعد الإرجاع",
  Status: "الحالة",
  "All statuses": "كل الحالات",
  "Record returns": "تسجيل الإرجاع",
  "Return or resolve items": "إرجاع القطع أو تسوية حالتها",
  Return: "إرجاع",
  Item: "القطعة",
  Condition: "الحالة الفنية",
  Lost: "مفقود",
  Notes: "ملاحظات",
  "Returned condition": "الحالة عند الإرجاع",
  "Mark lost": "تحديد كمفقود",
  "Return notes": "ملاحظات الإرجاع",
  "Select all": "تحديد الكل",
  "Clear selection": "إلغاء التحديد",
  "Select at least one item": "حدد قطعة واحدة على الأقل",
  "Select only the items being returned now. Damaged items enter maintenance; lost items are recorded as lost.":
    "حدد القطع التي تُرجع الآن فقط. تُحال القطع التالفة إلى الصيانة وتُسجل القطع المفقودة كمفقودة.",
  Cancel: "إلغاء",
  Save: "حفظ",
  "Saved successfully": "تم الحفظ بنجاح",
  Confirm: "تأكيد",
  Close: "إغلاق",
  Actions: "الإجراءات",
  Name: "الاسم",
  Description: "الوصف",
  Quantity: "الكمية",
  Search: "بحث",
  "Search…": "بحث…",
  Previous: "السابق",
  Next: "التالي",
  "No results": "لا توجد نتائج",
  "No records found": "لا توجد سجلات",
  "Add new": "إضافة جديد",
  "New equipment": "معدات جديدة",
  "Equipment name": "اسم المعدات",
  "Total stock": "إجمالي المخزون",
  "Available stock": "المخزون المتاح",
  Edit: "تعديل",
  Delete: "حذف",
  Update: "تحديث",
  "New request": "طلب جديد",
  "My requests": "طلباتي",
  "Request register": "سجل الطلبات",
  "Needed from": "مطلوب من",
  "Needed until": "مطلوب حتى",
  Approve: "موافقة",
  Reject: "رفض",
  "Report damage": "الإبلاغ عن تلف",
  "My damage reports": "بلاغات التلف الخاصة بي",
  "Repair register": "سجل الإصلاحات",
  "Report damaged equipment": "الإبلاغ عن معدات تالفة",
  "Damage description": "وصف التلف",
  Cost: "التكلفة",
  Complete: "إكمال",
  "New user": "مستخدم جديد",
  Role: "الدور",
  Active: "نشط",
  Email: "البريد الإلكتروني",
  Profile: "الملف الشخصي",
  "Change password": "تغيير كلمة المرور",
  "Current password": "كلمة المرور الحالية",
  "New password": "كلمة المرور الجديدة",
  ADMIN: "مسؤول النظام",
  "STORAGE KEEPER": "أمين المخزن",
  SCOUT: "كشاف",
  ACTIVE: "نشطة",
  PARTIAL: "إرجاع جزئي",
  RETURNED: "تم الإرجاع",
  CANCELLED: "ملغاة",
  OVERDUE: "متأخرة",
  AVAILABLE: "متاحة",
  BORROWED: "مستعارة",
  MAINTENANCE: "صيانة",
  LOST: "مفقودة",
  GOOD: "جيدة",
  NEW: "جديدة",
  FAIR: "مقبولة",
  DAMAGED: "تالفة",
  PENDING: "قيد الانتظار",
  APPROVED: "موافق عليها",
  REJECTED: "مرفوضة",
  ISSUED: "تم التسليم",
  OPEN: "مفتوحة",
  "IN PROGRESS": "قيد التنفيذ",
  COMPLETED: "مكتملة",
  By: "بواسطة",
  At: "في",
  "Status history": "سجل الحالة",
  "Physical items": "القطع الفعلية",
  "＋ Issue equipment": "＋ تسليم معدات",
  "New borrowing": "استعارة جديدة",
  "Confirm issuance": "تأكيد التسليم",
  "Available equipment": "المعدات المتاحة",
  "Borrowing cart": "سلة الاستعارة",
  "Add to cart": "إضافة إلى السلة",
  Remove: "إزالة",
  "Find equipment…": "ابحث عن معدات…",
  "Expected return (your local time)": "الإرجاع المتوقع (بتوقيتك المحلي)",
  "Cancel erroneous issuance": "إلغاء تسليم خاطئ",
  Reason: "السبب",
  "Item code": "رمز القطعة",
};
let language = "en",
  theme = "light";
try {
  language = localStorage.getItem("scout-language") === "ar" ? "ar" : "en";
  theme = localStorage.getItem("scout-theme") === "dark" ? "dark" : "light";
} catch {
  /* Preferences still work when browser storage is unavailable. */
}
Object.assign(translations, {
  "Search records…": "ابحث في السجلات…",
  "Search records": "البحث في السجلات",
  "Loading records…": "جارٍ تحميل السجلات…",
  "No records found.": "لا توجد سجلات.",
  "Ready for the next adventure": "جاهزة للمغامرة القادمة",
  "Currently out with the group": "مع المجموعة حالياً",
  "Awaiting repair or inspection": "بانتظار الإصلاح أو الفحص",
  "Attention needed": "يحتاج إلى متابعة",
  "Overdue borrowings": "الاستعارات المتأخرة",
  "My overdue borrowings": "استعاراتي المتأخرة",
  "Review borrowings →": "مراجعة الاستعارات ←",
  "Pending requests": "الطلبات المعلقة",
  "My pending requests": "طلباتي المعلقة",
  "View requests →": "عرض الطلبات ←",
  "Lost items": "القطع المفقودة",
  "View lost report →": "عرض تقرير المفقودات ←",
  "Low-stock equipment": "معدات منخفضة المخزون",
  Minimum: "الحد الأدنى",
  "My recent borrowings": "استعاراتي الأخيرة",
  "Recent activity": "النشاط الأخير",
  "Equipment inventory": "جرد المعدات",
  "Manage equipment types and track each physical item.":
    "إدارة أنواع المعدات وتتبع كل قطعة.",
  "＋ New equipment": "＋ معدات جديدة",
  Category: "الفئة",
  "Edit equipment": "تعديل المعدات",
  "Add items": "إضافة قطع",
  Before: "قبل",
  After: "بعد",
  Outstanding: "لم تُرجع بعد",
  Resolved: "تمت التسوية",
  Resolution: "التسوية",
  "Request equipment": "طلب معدات",
  "Needed from (local time)": "مطلوب من (التوقيت المحلي)",
  "Needed until (local time)": "مطلوب حتى (التوقيت المحلي)",
  "Submit request": "إرسال الطلب",
  "Set a quantity for each equipment type you need. Requests do not reserve stock.":
    "حدد كمية كل نوع تحتاجه. الطلبات لا تحجز المخزون.",
  "Account & system": "الحساب والنظام",
  "Your account information and deployment configuration.":
    "معلومات حسابك وإعدادات النظام.",
  "My account": "حسابي",
  "Contact an administrator to change your account or password.":
    "تواصل مع المسؤول لتغيير حسابك أو كلمة المرور.",
  "System configuration": "إعدادات النظام",
  "Manage user accounts": "إدارة حسابات المستخدمين",
  "Report explorer": "استعراض التقارير",
  "Apply filters": "تطبيق المرشحات",
  "Export current page": "تصدير الصفحة الحالية",
  From: "من",
  Through: "حتى",
  Time: "الوقت",
  User: "المستخدم",
  System: "النظام",
  Action: "الإجراء",
  Entity: "الكيان",
  Details: "التفاصيل",
  "Activity log": "سجل النشاط",
  "A record of account access and important inventory changes.":
    "سجل الدخول إلى الحسابات والتغييرات المهمة في المخزون.",
  "Review operational data and export the current page as a safe CSV.":
    "راجع بيانات العمليات وصدّر الصفحة الحالية كملف CSV آمن.",
  "Record damage, track repairs, and return equipment to service.":
    "سجل التلف وتابع الإصلاحات وأعد المعدات للخدمة.",
  "A shared home for your group’s equipment. Keep it organized, cared for, and ready when it matters.":
    "مكان مشترك لمعدات مجموعتك. حافظ على تنظيمها والعناية بها وجاهزيتها عند الحاجة.",
});
function arabicText(source) {
  if (translations[source]) return translations[source];
  if (/^Borrowing BR-[A-Z0-9]+$/.test(source))
    return source.replace("Borrowing", "استعارة");
  return source
    .replace(
      /^Good (morning|afternoon|evening), (.+)\. Here’s the latest from your storage\.$/,
      "مرحباً، $2. إليك آخر أخبار المخزن.",
    )
    .replace(
      /^(\d+) records · Page (\d+) of (\d+)$/,
      "$1 سجل · الصفحة $2 من $3",
    )
    .replace(/^(\d+) equipment types$/, "$1 نوع من المعدات");
}
const originals = new WeakMap();
function translate(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (node.parentElement.closest("script, style, [data-preferences]"))
      continue;
    const previous = originals.get(node);
    const source =
      previous && node.textContent === previous.rendered
        ? previous.source
        : node.textContent;
    const key = source.trim();
    const rendered =
      language === "ar" ? source.replace(key, arabicText(key)) : source;
    originals.set(node, { source, rendered });
    if (node.textContent !== rendered) node.textContent = rendered;
  }
  for (const node of root.querySelectorAll(
    "[placeholder], [aria-label], [title]",
  )) {
    for (const attr of ["placeholder", "aria-label", "title"]) {
      if (!node.hasAttribute(attr)) continue;
      const key = `data-original-${attr}`;
      if (!node.hasAttribute(key))
        node.setAttribute(key, node.getAttribute(attr));
      const source = node.getAttribute(key);
      node.setAttribute(
        attr,
        language === "ar" ? translations[source] || source : source,
      );
    }
  }
}
const controls = document.createElement("div");
controls.className = "preference-controls";
controls.dataset.preferences = "true";
const languageButton = document.createElement("button");
const themeButton = document.createElement("button");
for (const button of [languageButton, themeButton]) {
  button.type = "button";
  button.className = "button secondary";
}
controls.append(languageButton, themeButton);
(
  document.querySelector(".topbar") || document.querySelector(".login-main")
).prepend(controls);
function apply() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = theme;
  languageButton.textContent = language === "ar" ? "English" : "العربية";
  languageButton.setAttribute(
    "aria-label",
    language === "ar" ? "Switch to English" : "التبديل إلى العربية",
  );
  themeButton.textContent = language === "ar" ? "الوضع الداكن" : "Dark mode";
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
  translate(document.body);
  try {
    localStorage.setItem("scout-language", language);
    localStorage.setItem("scout-theme", theme);
  } catch {
    /* Private browsing may disable localStorage. */
  }
}
languageButton.addEventListener("click", () => {
  language = language === "en" ? "ar" : "en";
  apply();
});
themeButton.addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  apply();
});
const observer = new MutationObserver(() => {
  observer.disconnect();
  translate(document.body);
  observe();
});
function observe() {
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
apply();
observe();
