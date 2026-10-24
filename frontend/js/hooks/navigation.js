import { useEffect, useRef, useState } from "react";
import { currentUser } from "../api.js";
const listStates = new Map();
export function useListState(key, defaults = {}) {
  const scoped = `${currentUser?._id}:${location.pathname}:${key}`;
  const [state, setState] = useState(() => {
    const params = new URLSearchParams(location.search);
    const saved = listStates.get(scoped) || {};
    const values = { page: 1, search: "", ...defaults, ...saved };
    for (const name of Object.keys(values))
      if (params.has(name)) values[name] = params.get(name);
    values.page = Math.min(
      100000,
      Math.max(1, Math.floor(Number(values.page)) || 1),
    );
    return values;
  });
  function change(patch) {
    const next = { ...state, ...patch };
    listStates.set(scoped, next);
    const url = new URL(location.href);
    for (const [name, value] of Object.entries(next)) {
      if (value && !(name === "page" && value === 1))
        url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(history.state, "", url);
    setState(next);
  }
  return [state, change];
}
export function useRestoreScroll(ready) {
  const target = useRef(history.state?.scroll || 0);
  const restored = useRef(false);
  useEffect(() => {
    if (ready && !restored.current) {
      const frame = requestAnimationFrame(() => {
        window.scrollTo(0, target.current);
        restored.current = true;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [ready]);
}
