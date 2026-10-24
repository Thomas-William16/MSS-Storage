import { dateText } from "../i18n.js";
export const fmt = dateText;
export const short = (value) =>
  String(value || "")
    .slice(-8)
    .toUpperCase();
export const opts = (values) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
export const inputDate = (value) => {
  const d = new Date(value || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const iso = (value) => new Date(value).toISOString();
