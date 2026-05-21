import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SineApp } from "./SineApp";
import "./sine.css";

createRoot(document.getElementById("sine-root") as HTMLElement).render(
  <StrictMode>
    <SineApp />
  </StrictMode>,
);
