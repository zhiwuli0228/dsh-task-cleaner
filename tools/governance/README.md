# Governance toolchain (`tools/governance/`)

DevOps-owned, repository-local governance validators for the Harness baseline.
The governance root is always `docs/harness/`; the repository root must never
contain `.harness/`. No Go code is copied from the reference project — the
semantics of `cmd/harness-check`, `governance.Load/Validate/...` and
`check_workflow.py` are ported to TypeScript.

## Layout

| file | purpose |
|---|---|
| `index.ts` | traceability ledger load/validate + accepted-document validation + path containment |
| `layout-guard.ts` | `docs/harness/` layout guard incl. root `.harness/` regression assertion |
| `workflow-checker.ts` | fail-closed closed-loop state-machine checker (TS port) |
| `cli.ts` | unified CLI: `check` / `workflow` / `layout` |
| `*.test.ts` | vitest suite (also run by `scripts/verify-harness.ps1`) |

## Commands

```powershell
npm run harness:layout          # build + layout guard only (CI runs this unconditionally)
npm run harness:check           # build + ledger/accepted-documents/layout check
npm run harness:workflow        # build + workflow state machine + registration discovery
./scripts/verify-harness.ps1    # workflow -> governance tests -> check -> typecheck/lint/test/build
```

All commands fail closed: unknown/missing governance records are errors, never
silent passes.

## Decision #4 — `check_workflow`: TypeScript, not Python

The workflow checker is rewritten as `workflow-checker.ts` under the same
`tools/governance/` boundary as the ledger validator. Rationale:

- One toolchain for the whole repository: typecheck/lint/test/build already
  cover governance code, so CI and local `verify-harness.ps1` need no Python
  dependency.
- The checker shares `readJsonObject`, path containment, and layout constants
  with the ledger validator instead of maintaining a second runtime.
- Fail-closed semantics (phases, registration discovery, digest/state checks)
  are preserved and covered by vitest.

## Decision #5 — closed-loop-engineering skill packaging

Decision: keep the skill **repo-canonical under
`.codex/skills/closed-loop-engineering/`** (SKILL.md only), with its content of
record living in `docs/harness/` and its executable validators living in
`tools/governance/`.

- `.codex/skills/` is the portable repo convention used by the reference
  project and is understood by Codex/Claude-style agents working from the
  repository.
- Harness governance documents remain exclusively under `docs/harness/`; the
  skill is a loader/pointer, not a second governance store.
- In this Multica workspace the skill must additionally be imported into the
  workspace skill database (`multica skill import --url
  https://github.com/zhiwuli0228/dsh-task-cleaner/tree/<branch>/.codex/skills/closed-loop-engineering`)
  once the branch/PR is published; the repo copy stays the canonical source.

## DSH baseline lock (real-machine headless smoke)

See the issue reply for the smoke record. The locked npm dist-tags are:

- `@deepseek-ai/dsh@0.1.2-rc.1` (npm `latest`)
- `@deepseek-ai/cordis@4.0.2` (resolved inside the headless profile)

`0.1.5-alpha.2` remains the `next`/unstable observation line only.
