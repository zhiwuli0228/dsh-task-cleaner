# ADR-003: DSH Plugin Lifecycle Adapter and Version Compatibility Seam

- Status: Proposed (2026-09-09)
- Change: harness-framework-baseline
- Related: ADR-002; implementation in `src/adapter/dsh/`

## Context

DeepSeek Harness (DSH, `deepseek-ai/deepseek-harness`, MIT, open sourced
2026-08-13) is a Cordis-based plugin host in developer preview with explicitly
documented breaking-change risk. Official facts checked 2026-09-09:

- Plugins are Cordis plugins (function/object/Service) shipped as an npm bundle
  whose `package.json` declares `dsh.bundle.patch`, installed with
  `dsh plugin --profile <name> add .`, and booted with `dsh --profile <name>`.
- The closest official "task" concept is the same-session goal
  (`ctx.goals`; durable `goal/change` session event plus `goal/changed` emit;
  phases active/paused/blocked/complete). Sessions expose
  `session/created`, `session/disposed`, `session/event` (turn/step/tool), and
  the agent layer exposes `agent/turn-stopping`.
- npm dist-tags at review time: `latest=0.1.2-rc.1`, `next=0.1.2-rc.1`,
  `alpha=0.1.5-alpha.2`; GitHub's newest release is `dsh-v0.1.5-alpha.2`.

## Decision

1. Distribution shape: this repository is an npm bundle with
   `dsh.bundle.patch: ./cordis.patch.yml`; the patch inserts the
   `dsh-task-cleaner` plugin row. Config is validated by a Schemastery
   `Config` schema; `dryRun` defaults to `true`.
2. Baseline lock: `@deepseek-ai/dsh@0.1.2-rc.1` (npm `latest`) with
   `@deepseek-ai/cordis@4.0.2`. `0.1.5-alpha.2` is recorded as next/unstable
   and is not the default baseline.
3. Compatibility seam:
   - DSH version handling is concentrated in `src/adapter/dsh/version-gate.ts`
     as one constant plus a feature check.
   - Unsupported or unknown host versions fail closed: the plugin refuses to
     activate and logs the reason; no silent degradation.
   - A claimed support row in the compatibility matrix requires contract
     tests plus a real headless load smoke for that exact version.
4. Lifecycle mapping: a host-independent `TaskLifecyclePort` receives
   normalized transitions (started/completed/aborted/paused/blocked/cleared)
   plus a TaskScope snapshot (kind goal|session|turn; session/goal ids,
   workspace canonical path, cwd, timestamps). Default policy: goal lifecycle
   is the primary trigger; `session/disposed` is a fallback only for sessions
   with no observed goal activity. Turn-level mapping is optional and off by
   default.
5. DSH event payloads are untrusted input (T-10): the adapter guards and
   normalizes shapes, logs and skips malformed events, and never lets a
   listener throw uncaught into the host event dispatch.
6. This milestone registers listeners and a readiness probe only; no
   destructive or executing capability is registered. Automated paths are
   read-only and have no auto-approval.
7. Verification strategy:
   - Cordis simulator: mount `ctx`, inject stub services, replay fixture
     session/goal events, assert normalized transitions.
   - Real smoke: boot a headless DSH profile (`@deepseek-ai/dsh@0.1.2-rc.1`)
     with the plugin bundle mounted. DSH core source is never modified.

## Compatibility matrix (observed 2026-09-09)

| DSH version | npm tag | Status |
|---|---|---|
| 0.1.0-rc.6 .. 0.1.1-rc.2 | -- | legacy/untested; no support claim |
| 0.1.2-rc.1 | latest/next | default baseline; contract + headless smoke required |
| 0.1.3-alpha.* / 0.1.5-alpha.* | alpha | next/unstable observation; no support claim |

## Consequences

- A future DSH 0.2.x change affects only `src/adapter/dsh/` and the matrix;
  domain/ports do not change.
- The version gate protects users from an untested host even when npm
  resolution changes.
