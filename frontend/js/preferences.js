import { translateText } from "./i18n.js";
let language = "en",
  theme = "light";
try {
  language = localStorage.getItem("scout-language") === "ar" ? "ar" : "en";
  theme = localStorage.getItem("scout-theme") === "dark" ? "dark" : "light";
} catch {}
const originals = new WeakMap();
function translateNode(node) {
  if (node.parentElement.closest("script, style, [data-preferences]")) return;
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
function translate(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    translateNode(node);
  }
  const selector = "[placeholder], [aria-label], [title], [data-label]";
  const nodes = [...root.querySelectorAll(selector)];
  if (root.matches?.(selector)) nodes.unshift(root);
  for (const node of nodes) {
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
const listeners = new Set();
export const preferenceSnapshot = () => `${language}:${theme}`;
export function subscribePreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function toggleLanguage() {
  language = language === "en" ? "ar" : "en";
  apply();
}
export function toggleTheme() {
  theme = theme === "light" ? "dark" : "light";
  apply(false);
}
let originalTitle = document.title;
export function updateTitle(title) {
  originalTitle = title;
  document.title = title
    .split(" · ")
    .map((part) => translateText(part, language))
    .join(" · ");
}
function apply(translateAll = true) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = theme;
  if (translateAll) translate(document.body);
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
  for (const listener of listeners) listener();
}
const observer = new MutationObserver((records) => {
  // Only visit changed text and newly inserted subtrees. Avoid rescanning all
  // tables and dialogs whenever a toast, loading label, or cart total changes.
  const roots = new Set();
  for (const record of records) {
    if (record.type === "characterData") roots.add(record.target);
    else
      for (const node of record.addedNodes) {
        if (
          node.nodeType === Node.ELEMENT_NODE ||
          node.nodeType === Node.TEXT_NODE
        )
          roots.add(node);
      }
  }
  observer.disconnect();
  try {
    for (const root of roots) {
      if (!root.isConnected) continue;
      let covered = false;
      for (let parent = root.parentNode; parent; parent = parent.parentNode) {
        if (roots.has(parent)) {
          covered = true;
          break;
        }
      }
      if (!covered) translate(root);
    }
  } finally {
    observe();
  }
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
