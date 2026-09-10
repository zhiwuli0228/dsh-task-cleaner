# ADR-005: Governance Toolchain Boundary

- Status: Proposed (2026-09-09)
- Change: harness-framework-baseline
- Related: open questions #2/#3/#4/#5

## Context

The reference project validates governance with `cmd/harness-check/main.go`,
`scripts/verify-harness.ps1`, and a Python `check_workflow.py`. This project
does not copy the Go stack, must enforce the `docs/harness/` layout, and keeps
governance tooling out of the DSH runtime bundle.

## Decision

1. Open question #3: the TS governance checker lives in
   `tools/governance/` as a library plus CLI:
   - `index.ts` – traceability ledger load/validate and accepted-document/
     human-gate checks;
   - `workflow-checker.ts` – fail-closed closed-loop state machine;
   - `layout-guard.ts` – asserts no root `.harness/` and confines governance
     artifacts to `docs/harness/`;
   - `cli.ts` – `check|workflow|layout` entry.
   Governance tooling is excluded from the published npm bundle.
2. Open question #2 (adjudicated by DataEngineerAgent, adopted here):
   - schema: `docs/harness/traceability.schema.json`;
   - ledger: `docs/harness/traces/traceability-ledger.json`;
   - immutable snapshots: `docs/harness/traces/snapshots/`.
3. `scripts/verify-harness.ps1` order: workflow-checker -> governance unit
   tests -> harness-check -> typecheck/lint/test (replacing Go steps from the
   reference).
4. Open question #4 (DevOpsAgent): the workflow checker is a TS port; the
   repository toolchain is TypeScript-only.
5. Open question #5 (DevOpsAgent): the closed-loop skill ships in-repo at
   `.codex/skills/closed-loop-engineering/` with a SKILL.md pointer; governance
   truth stays under `docs/harness/` and the checker under `tools/governance/`.
6. The registry (`docs/harness/closed-loop-registry.json`) tracks covered
   paths per change, including this change's evidence and design artifacts, so
   the repository is self-auditable without Multica comments.

## Consequences

- `docs/harness/` remains the single normative governance root for the
  checker, CI, and humans.
- Layout regressions are caught by the same guard in local verification and
  CI.
- The toolchain boundary keeps governance dependencies out of the runtime
  package consumers install.
