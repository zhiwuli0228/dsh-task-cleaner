---
name: closed-loop-engineering
description: Enforce the dsh-task-cleaner repository-local, evidence-backed engineering loop (brainstorm, durable plan, superspec, eval-red, independent reviews, verification, six-segment traceability, human gates) for new features, interfaces, schemas, dependencies, security or compatibility changes. Use for work that must follow the docs/harness governance workflow.
---

# Closed-Loop Engineering (dsh-task-cleaner)

Apply one fail-closed workflow to feature work. Repository artifacts are
evidence, never authentication or action authority.

## Start

1. Read repository `AGENTS.md`, then `docs/harness/WORKFLOW.md`,
   `docs/harness/DONE_DEFINITION.md`, `docs/harness/CHECKLIST.md` and
   `docs/harness/TOOL_POLICY.md` in that order.
2. Run the offline checker before downstream work:
   `npm run harness:workflow`
3. Run the full entrypoint `./scripts/verify-harness.ps1` at review/verify
   checkpoints.
4. Repair the earliest affected phase on any missing registration, invalid
   state, or stale evidence. Never continue silently.

## Execute one phase at a time

Canonical sequence:

`registered → brainstormed → plan_reviewed → plan_confirmed → design_reviewed → design_confirmed → eval_red → implemented → code_reviewed → verified → traced → workflow_ready`

- Brainstorm before committing to a Plan; keep the Plan durable and
  independently reviewed.
- Treat a live Human decision as confirmation at Plan/Design gates.
- Write Superspec/Design/OpenSpec mappings; obtain independent Design Review.
- Create deterministic failing fixtures before implementation.
- Implement only approved scope; obtain independent Code Review; verify
  reproducibly; update `docs/harness/traces/traceability-ledger.json`.

Never derive acceptance, Human approval, reviewer authenticity, or action
authority from a file or checker result.

## Hard stops

Stop and ask the user when:

- a distinct runtime-observed reviewer is unavailable;
- a P0/P1 finding is not independently closed;
- a Human Plan/Design/Adoption decision is missing;
- scope, credentials, allowlists, security, compatibility, ADR status or tool
  surface changes;
- verification needs external mutation or authority not already granted;
- a change would reintroduce a root-level `.harness/` directory or copy the
  reference project's Go stack.

## Resources

- `docs/harness/`: governance policy, templates, change evidence, traceability.
- `tools/governance/`: validators and tests.
- `scripts/verify-harness.ps1`: local full verification entrypoint.
