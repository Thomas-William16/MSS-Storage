import React, { useRef, useState } from "react";
import { useUI } from "./context.js";
export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  ...props
}) {
  const [busy, setBusy] = useState(false);
  const ui = useUI();
  const pending = useRef(false);
  return (
    <button
      type="button"
      className={`button ${variant}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
      onClick={async () => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        try {
          await onClick?.();
        } catch (error) {
          ui?.toast(error.message, "error");
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
