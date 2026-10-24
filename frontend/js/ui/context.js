import { createContext, useContext } from "react";
export const UI = createContext(null);
export const useUI = () => useContext(UI);
