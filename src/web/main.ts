import type { UxShellPorts } from "../shell/index.js";
import { mountApp } from "./dom.js";
import { createWebDemoPorts } from "./demo-ports.js";

/**
 * Web entry point (framework baseline demo). The production composition
 * root binds real backend use-cases to the same UxShellPorts interface.
 */

export function start(rootSelector: string, ports?: UxShellPorts): void {
  const root = document.querySelector<HTMLElement>(rootSelector);
  if (!root) {
    throw new Error(`web root '${rootSelector}' not found`);
  }
  mountApp(root, ports ?? createWebDemoPorts());
}

if (typeof document !== "undefined" && document.getElementById("app")) {
  start("#app");
}
