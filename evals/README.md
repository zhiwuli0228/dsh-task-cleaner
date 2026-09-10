# evals/

Repository-root executable-acceptance layer (ADR-001, open question #1
adjudication).

Evals are declarative, reproducible acceptance checks derived from the
acceptance criteria in the task brief. They complement — and never replace —
`tests/` and `scripts/verify-harness.ps1`. A declarative eval is a baseline;
the authoritative evidence is the executed command output recorded in the
verification artifacts.

## Conventions

- One file per milestone: `evals/<milestone>.eval.md`.
- Each entry states WHEN/THEN, the exact command, and the expected outcome.
- No eval may require network mutation, credentials, or destructive action.

## Milestones

- `harness-baseline.eval.md` — framework-baseline acceptance checks.
