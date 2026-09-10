# Eval: harness-framework-baseline

Declarative acceptance checks for LZWW-2「建立 Harness 标准框架基线」.

## E1 — toolchain gates

- WHEN `npm ci` has completed
- THEN `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run build:web` and `npm run build:governance` all exit 0
- AND `./scripts/verify-harness.ps1` exits 0

## E2 — governance layout

- WHEN the layout guard runs (`npm run harness:layout`)
- THEN no root-level `.harness/` segment exists anywhere in the repository
- AND every governance file/directory required by
  `tools/governance/layout-guard.ts` exists under `docs/harness/`

## E3 — no destructive surface

- WHEN the runtime sources are scanned
- THEN no deletable/unlink/purge primitive exists in `src/`
- AND quarantine and restore remain explicit denies in the baseline
  (`cleanup-orchestrator.ts`)

## E4 — candidate protections are enforced through real ports

- WHEN a candidate is decided through `DefaultDenySafetyKernel`
- THEN the kernel consults the real `FsPort`/`GitPort` adapters and denies with
  the specific reason code:
  - path missing → `missing_real_path`
  - lstat/realpath failure → `unresolvable_path`
  - symlink/junction → `symlink_not_followed`
  - canonical path outside the workspace root → `outside_workspace`
  - dev/ino mismatch → `identity_mismatch`
  - Git tracked (HEAD or index) → `git_tracked`
- AND a candidate that passes every predicate still falls through to
  `not_implemented_default_deny` (no positive cleanup path in this milestone)
- EVIDENCE: `tests/safety-kernel.test.ts`,
  `tests/protection-integration.test.ts`

## E5 — DSH plugin loads

- WHEN the plugin tree is loaded against the locked DSH `0.1.2-rc.1` headless
  profile
- THEN the version gate passes and the composed config shows the
  `dsh-task-cleaner` row with `dryRun: true`
