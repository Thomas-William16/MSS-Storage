import { API_BASE_URL } from "./config.js";
import { el, button, header, panel } from "./dom.js";
const guides = [
  {
    id: "admin",
    title: "مسؤول النظام",
    description:
      "إدارة المستخدمين والتصنيفات والمعدات والطلبات والإعارات والصيانة والتقارير وسجل العمليات.",
  },
  {
    id: "keeper",
    title: "أمين المخزن",
    description:
      "إدارة المخزون وتسليم المعدات واستلامها، مراجعة الطلبات ومتابعة الإصلاح والتقارير التشغيلية.",
  },
  {
    id: "scout",
    title: "الكشّاف",
    description:
      "عرض المعدات، إرسال الطلبات ومتابعتها، رؤية الإعارات الخاصة والإبلاغ عن التلف.",
  },
];
const media = (id) => `${API_BASE_URL}/walkthrough-media/${id}`;
export async function walkthroughsView(root) {
  root.dir = "rtl";
  root.lang = "ar";
  root.append(
    header(
      "دليل الاستخدام بالفيديو",
      "شرح عربي للأدوار الثلاثة، مع تعليق صوتي آلي وبيانات تجريبية.",
    ),
  );
  const tabs = el("div", {
      class: "tutorial-tabs",
      dir: "rtl",
      "aria-label": "اختيار دور المستخدم",
    }),
    content = el("div", { dir: "rtl" });
  let activeVideo;
  async function show(guide) {
    activeVideo?.pause();
    content.replaceChildren();
    for (const tab of tabs.children)
      tab.setAttribute("aria-pressed", String(tab.dataset.role === guide.id));
    const video = el(
      "video",
      {
        controls: true,
        preload: "metadata",
        playsInline: true,
        crossOrigin: "anonymous",
        class: "tutorial-video",
        "aria-label": `شرح ${guide.title}`,
      },
      el("source", { src: media(`${guide.id}.ar.mp4`), type: "video/mp4" }),
      el("track", {
        kind: "captions",
        src: media(`${guide.id}.ar.vtt`),
        srclang: "ar",
        label: "العربية — التعليق كاملًا",
      }),
    );
    activeVideo = video;
    const status = el(
      "p",
      { class: "muted", role: "status" },
      "اختر التشغيل، واستخدم ملء الشاشة لرؤية الأزرار بوضوح.",
    );
    video.addEventListener("error", () => {
      status.textContent =
        "تعذر تحميل الفيديو. تأكد من تنزيل آخر تحديث للمشروع، أو استخدم رابط التنزيل.";
    });
    const download = el(
      "a",
      {
        class: "button secondary",
        href: media(`${guide.id}.ar.mp4?download=1`),
        download: `${guide.id}.ar.mp4`,
      },
      "تنزيل الفيديو",
    );
    const chapters = el("div", {
      class: "tutorial-chapters",
      "aria-label": "فصول الفيديو",
    });
    content.append(
      panel(
        guide.title,
        el("p", { class: "muted" }, guide.description),
        video,
        status,
        download,
        el("h3", {}, "انتقل إلى فصل"),
        chapters,
      ),
    );
    try {
      const response = await fetch(media(`${guide.id}.chapters.json`));
      if (!response.ok) throw new Error("Chapters unavailable");
      const rows = await response.json();
      for (const row of rows) {
        const item = button(
          `${row.at} — ${row.title}`,
          async () => {
            if (video.readyState === 0)
              await new Promise((resolve, reject) => {
                video.addEventListener("loadedmetadata", resolve, {
                  once: true,
                });
                video.addEventListener("error", reject, { once: true });
                video.load();
              });
            const [hours, minutes, seconds] = row.at.split(":").map(Number);
            video.currentTime = hours * 3600 + minutes * 60 + seconds;
            await video.play();
          },
          "secondary",
        );
        chapters.append(item);
      }
    } catch {
      chapters.append(
        el(
          "p",
          { class: "muted" },
          "فصول الفيديو غير متاحة. يمكنك استخدام شريط التشغيل.",
        ),
      );
    }
  }
  for (const guide of guides) {
    const tab = button(guide.title, () => show(guide), "secondary");
    tab.dataset.role = guide.id;
    tab.setAttribute("aria-pressed", "false");
    tabs.append(tab);
  }
  root.append(
    tabs,
    content,
    el(
      "p",
      { class: "muted", dir: "rtl" },
      "الفيديوهات متاحة للتدريب. الصلاحيات الفعلية تُطبّق على حسابك في الخادم؛ مشاهدة شرح دور آخر لا تمنحك صلاحياته.",
    ),
  );
  await show(guides[0]);
}
