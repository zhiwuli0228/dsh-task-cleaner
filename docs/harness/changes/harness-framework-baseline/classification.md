# Classification: harness-framework-baseline

- Change ID: `harness-framework-baseline`
- Standard sources: `E:\009workspace\codex\dv-troubleshooting` (semantics only)
- Governance root: `docs/harness/` (no root-level `.harness/`)
- Stack: TypeScript/Node/ESM; no Go stack is copied

## Impact questionnaire

| field | answer |
|---|---|
| new_behavior | yes |
| new_interface_or_module | yes |
| schema_data_or_default | yes |
| dependency_behavior | yes |
| security_credentials_allowlist | no |
| compatibility | yes |
| external_effect | no |
| milestone_scope | yes |
| performance_or_limits | no |
| uncertainty | yes |

## Scope

This baseline bootstrap adds the repository-local Harness governance root
(policy, traceability schema, templates), the governance toolchain in
`tools/governance/` (TS ledger validator, layout guard, workflow checker),
`scripts/verify-harness.ps1`, dev scripts, and CI. It intentionally does not
implement cleanup business logic.
