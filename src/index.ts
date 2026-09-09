/**
 * dsh-task-cleaner framework baseline.
 *
 * The Cordis `apply(ctx, config)` composition root is implemented by the
 * backend track. This barrel exists so consumers can import the shared
 * shell/view-model contract without pulling Node or DOM entry points.
 */

export * from "./shell/index.js";
