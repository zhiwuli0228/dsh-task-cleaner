# AGENTS.md — dsh-task-cleaner

Entry guide for coding agents and human contributors. This file is a product
artifact (ADR-001), not a governance state source.

## Required reading order

1. `docs/harness/WORKFLOW.md` — the single closed-loop state machine.
2. `docs/harness/DONE_DEFINITION.md` — implemented vs. accepted.
3. `docs/harness/CHECKLIST.md` — review checklist and evidence expectations.
4. `docs/harness/TOOL_POLICY.md` — read-only default; destructive actions
   require explicit human authorization.
5. `docs/harness/STANDARDS_MAPPING.md` — the reference standard and its
   per-item mapping into this repository.

`docs/harness/` is the only normative governance root. Never create or
reintroduce a root-level `.harness/` directory.

## Non-negotiable rules

- Fail closed. A missing or ambiguous fact is a deny, never an implicit allow.
- This milestone ships no destructive path: dry-run by default, quarantine and
  restore are explicit denies, and there is no delete/unlink/PURGE primitive
  anywhere in the runtime (S-07).
- Candidate protections must stay enforced through the real `FsPort`/`GitPort`
  adapters: canonical `realpath`, strict workspace containment, refusal to
  follow symlinks/junctions, file-identity matching, and Git tracked-file
  protection (S-02..S-04).
- `@deepseek-ai/*` imports are confined to `src/adapter/dsh/` (ADR-002).
- Do not copy the reference project's Go stack or root-level `.harness/`
  layout; adapt its semantics to `docs/harness/` (ADR-001).

## Commands

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run verify          # typecheck + lint + test + all builds
./scripts/verify-harness.ps1   # full closed-loop entrypoint
```

## Change workflow

- Register every changed path in `docs/harness/closed-loop-registry.json`;
  otherwise `npm run harness:check` fails with `missing_registration`.
- Record workflow state in
  `docs/harness/changes/<change-id>/state.json` and advance phases one step at
  a time per `docs/harness/WORKFLOW.md`.
- ADR status stays `Proposed` until a human gate records acceptance in
  `docs/harness/human-gates.json`.
- Stop and ask the user when a Human Plan/Design/Adoption decision, a distinct
  independent reviewer, or a scope/security/compatibility change is required.
