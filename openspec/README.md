# openspec/

Repository-root spec-input layer (ADR-001, open question #1 adjudication).

`openspec/` holds spec-driven change inputs: the requirement-level WHY/WHAT
before implementation, mapped one-to-one onto `docs/harness/` governance
evidence. It is an engineering input layer, never a governance state source:
workflow state lives only in `docs/harness/changes/<id>/state.json`.

## Layout

- `openspec/changes/<change-id>/` — active change inputs.
- `openspec/changes/archive/` — completed change inputs.

`tools/governance/workflow-checker.ts` scans `openspec/changes` for active
directories and fails any change that is not registered in
`docs/harness/closed-loop-registry.json`.

## Current state

The `harness-framework-baseline` milestone is tracked through
`docs/harness/changes/harness-framework-baseline/`; its spec input is the
task brief and `docs/harness/STANDARDS_MAPPING.md` mapping recorded in the
Multica task LZWW-2.
