import { translateText } from "./i18n.js";
let language = "en",
  theme = "light";
try {
  language = localStorage.getItem("scout-language") === "ar" ? "ar" : "en";
  theme = localStorage.getItem("scout-theme") === "dark" ? "dark" : "light";
} catch {}
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
      language === "ar"
        ? source.replace(key, translateText(key, language))
        : source;
    originals.set(node, { source, rendered });
    if (node.textContent !== rendered) node.textContent = rendered;
  }
  for (const node of root.querySelectorAll(
    "[placeholder], [aria-label], [title], [data-label]",
  )) {
    if (node.closest("[data-preferences]")) continue;
    for (const attr of ["placeholder", "aria-label", "title", "data-label"]) {
      if (!node.hasAttribute(attr)) continue;
      const key = `data-original-${attr}`;
      if (!node.hasAttribute(key))
        node.setAttribute(key, node.getAttribute(attr));
      const source = node.getAttribute(key);
      node.setAttribute(
        attr,
        language === "ar" ? translateText(source, language) : source,
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
let originalTitle = document.title;
export function updateTitle(title) {
  originalTitle = title;
  document.title = title
    .split(" · ")
    .map((part) => translateText(part, language))
    .join(" · ");
}
export function mountPreferences(container) {
  container.append(controls);
  apply();
  return () => controls.remove();
}
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
  document.title = originalTitle
    .split(" · ")
    .map((part) => translateText(part, language))
    .join(" · ");
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
