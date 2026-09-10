# ADR-001: Repository Layout and `docs/harness/` Governance Root

- Status: Proposed (2026-09-09)
- Change: harness-framework-baseline
- Related: ADR-002..005, `docs/harness/STANDARDS_MAPPING.md`

## Context

The milestone must establish a runnable framework baseline before any cleanup
logic exists. Two binding constraints come from the user-provided reference
standard (`dv-troubleshooting`) mapping:

- All Harness governance files, templates, state, change evidence, and trace
  records must live under `docs/`, with `docs/harness/` as the single normative
  root. A root-level `.harness/` must never reappear.
- The reference project is used for semantics, workflow, gates, and evidence
  standards only; its Go stack and root-level `.harness/` location are not
  copied.

This repository is a single npm package (ESM + tsc + vitest) that also ships as
a DeepSeek Harness (DSH) plugin bundle, so governance must stay decoupled from
the publishable runtime.

## Decision

1. `docs/harness/` is the single governance root:
   `WORKFLOW.md`, `DONE_DEFINITION.md`, `CHECKLIST.md`, `TOOL_POLICY.md`,
   `traceability.schema.json`, `closed-loop-registry.json`, `human-gates.json`,
   `discovery-baseline.json`, `templates/`, `task-templates/`,
   `changes/<id>/` (including `state.json`), `snapshots/`, `traces/`.
2. The repository root keeps only product/runtime files: `AGENTS.md`,
   `README.md`, `package.json`, `cordis.patch.yml`, `src/`, `tools/`,
   `tests/`, `scripts/`, `.github/`. Root-level `cordis.patch.yml` and
   `AGENTS.md` are DSH/product artifacts, not Harness governance files.
3. Product architecture records live in `docs/architecture/adr/`
   (ADR-001..005, Proposed). Product design contracts live in
   `docs/design/` (e.g. `ux-shell-contract.md`). Both are outside the
   `docs/harness/` governance tree.
4. Open question #1 is adjudicated: `openspec/` and `evals/` remain at the
   repository root. They are spec-input and executable-acceptance layers with
   their own tooling conventions in the source standard; the user's layout
   constraint targets the `.harness`/`docs-09-traces` equivalents
   (governance/state/evidence/traces), not engineering input artifacts.
5. Guardrails are executable and CI-enforced:
   - `tools/governance/layout-guard.ts` asserts no root-level `.harness/` and
     that governance artifacts are confined to `docs/harness/`;
   - `scripts/verify-harness.ps1` and CI run the layout guard unconditionally;
   - `tests/` include layout-guard unit tests with negative probes.

## Consequences

- Any future migration must update the layout guard and verification scripts
  together.
- `docs/harness/changes/<id>/state.json` remains the authoritative workflow
  state; `openspec/` and `evals/` are never governance state sources.
- ADR status changes to Accepted require a human gate per
  `docs/harness/WORKFLOW.md` and `docs/harness/human-gates.json`.

## Evidence

- Mapping and source inventory: `docs/harness/STANDARDS_MAPPING.md`
- Data contract alignment: `docs/harness/traces/traceability-ledger.json`
  (ledger path per DataEngineer ruling on open question #2).
