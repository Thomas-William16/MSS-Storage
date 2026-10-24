import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UI } from "./context.js";
import { FormDialog, ConfirmDialog } from "./forms.jsx";
export function UIProvider({ children }) {
  const [dialogs, setDialogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const pending = useRef(new Map());
  const timers = useRef(new Set());
  const open = (Component, props = {}) =>
    new Promise((resolve) => {
      const id = crypto.randomUUID();
      pending.current.set(id, resolve);
      setDialogs((items) => [...items, { id, Component, props }]);
    });
  const close = (id, value) => {
    const resolve = pending.current.get(id);
    pending.current.delete(id);
    resolve?.(value);
    setDialogs((items) => items.filter((item) => item.id !== id));
  };
  const dismiss = () => {
    for (const resolve of pending.current.values()) resolve(null);
    pending.current.clear();
    setDialogs([]);
  };
  useEffect(() => {
    window.addEventListener("popstate", dismiss);
    window.addEventListener("scout:signed-out", dismiss);
    return () => {
      window.removeEventListener("popstate", dismiss);
      window.removeEventListener("scout:signed-out", dismiss);
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);
  const toast = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 7000);
    timers.current.add(timer);
  };
  const ui = {
    open,
    toast,
    form: (props) => open(FormDialog, props),
    confirm: (title, message, action) =>
      open(ConfirmDialog, { title, message, action }),
  };
  return (
    <UI.Provider value={ui}>
      {children}
      {dialogs.map(({ id, Component, props }) => (
        <Component key={id} {...props} close={(value) => close(id, value)} />
      ))}
      {createPortal(
        toasts.map((item) => (
          <div
            key={item.id}
            className={`toast ${item.type}`}
            role={item.type === "error" ? "alert" : "status"}
          >
            {item.message}
          </div>
        )),
        document.getElementById("toasts"),
      )}
    </UI.Provider>
  );
}
