import { useEffect, useState } from "react";
import { api } from "../api.js";
export function useResource(path, revision = 0, loader) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    (loader ? loader() : api(path, { signal: controller.signal }))
      .then((result) => {
        if (active) setState({ ...result, loading: false });
      })
      .catch((error) => {
        if (active)
          setState((current) => ({ ...current, loading: false, error }));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, revision]);
  return state;
}
export function useReload() {
  const [revision, setRevision] = useState(0);
  return [revision, () => setRevision((current) => current + 1)];
}
