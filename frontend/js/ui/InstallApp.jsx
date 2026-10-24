import React, { createContext, useContext, useEffect, useState } from "react";
import { Panel } from "./primitives.jsx";
import { Button } from "./Button.jsx";

const Installation = createContext(null);

export function InstallProvider({ children }) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(display.matches || navigator.standalone === true);
    const available = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    const complete = () => {
      setPrompt(null);
      setInstalled(true);
    };
    update();
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    display.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      display.removeEventListener("change", update);
    };
  }, []);
  const install = async () => {
    if (!prompt) return;
    // Call inside the click handler to retain the browser's user activation.
    const result = prompt.prompt();
    setPrompt(null);
    await result;
  };
  return (
    <Installation.Provider
      value={{ available: Boolean(prompt), installed, install }}
    >
      {children}
    </Installation.Provider>
  );
}

export function InstallApp() {
  const { available, installed, install } = useContext(Installation);
  return (
    <Panel title="Install on your phone">
      {installed ? (
        <p>Scout Storage is running as an app.</p>
      ) : (
        <>
          <p>Add Scout Storage to your home screen for quick access.</p>
          {available && (
            <Button variant="primary" onClick={install}>
              Install app
            </Button>
          )}
          <p>
            <strong>Android:</strong>{" "}
            <span>
              Open this website in Chrome, then choose Install app or Add to
              Home screen from the browser menu.
            </span>
          </p>
          <p>
            <strong>iPhone:</strong>{" "}
            <span>
              Open this website in Safari, tap Share, then Add to Home Screen.
              Enable Open as Web App if offered.
            </span>
          </p>
        </>
      )}
      <p className="muted">
        An internet connection is required. You can also keep using the website
        in your browser.
      </p>
    </Panel>
  );
}
