/**
 * Shell contract barrel (ux-shell-contract.md §7). Importing this module
 * must never pull Node-only or DOM-only code into the shared bundle.
 */

export * from "./vm-types.js";
export * from "./ux-shell-ports.js";
export * from "./json-envelope.js";
export * from "./format.js";
export * from "./state-machine.js";
export * from "./vm-mapping.js";
