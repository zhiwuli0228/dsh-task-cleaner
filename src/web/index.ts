/**
 * Web shell barrel. Importing this module pulls browser DOM types but no
 * Node-only code; `main.ts` stays separate for the Node CLI bundle.
 */

export * from "./views.js";
export * from "./confirm.js";
export * from "./view-states.js";
