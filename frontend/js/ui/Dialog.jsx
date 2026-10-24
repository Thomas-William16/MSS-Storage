import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
export function Dialog({ children, title, close, wide = false }) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}`}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        close(null);
      }}
      onClose={() => close(null)}
    >
      <h2 id={heading}>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}
