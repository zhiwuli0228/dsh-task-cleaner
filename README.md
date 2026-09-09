# dsh-task-cleaner

A safety-first DeepSeek Harness plugin for task-scoped workspace cleanup.

## Status

Project initialization. The first milestone will define task lifecycle integration, artifact classification, dry-run reports, quarantine, restore, and audited cleanup.

## Safety principles

- Dry-run by default
- Never delete Git-tracked files automatically
- Restrict cleanup to task-owned artifacts inside the configured workspace
- Validate real paths and reject traversal or symlink escapes
- Quarantine before permanent deletion
- Keep an auditable manifest and provide restore support

## Planned workflow

```text
task start -> workspace baseline -> task execution -> cleanup plan
           -> safety validation -> quarantine -> restore or expiry purge
```

## Development

The repository is a TypeScript/Node ESM package with a DSH plugin entry
(`src/index.ts`) and a dependency-free shell contract
(`docs/design/ux-shell-contract.md`). Layout:

- `src/shell/`, `src/cli/`, `src/web/` — view-model/port/envelope contracts
  and CLI/Web shells (map-only; no cleanup decisions).
- `src/domain/`, `src/ports/`, `src/app/`, `src/adapter/` — domain contracts,
  ports, noop/stub use cases, and adapters (DSH import confined to
  `src/adapter/dsh/`).
- `tools/governance/` — ledger/layout/workflow validators.
- `docs/harness/` — Harness governance root (no root-level `.harness/`).

### Install and verify

```powershell
./scripts/dev.ps1 install        # npm ci/install (npm 11 required)
./scripts/dev.ps1 typecheck      # node + web typecheck
./scripts/dev.ps1 lint
./scripts/dev.ps1 test           # vitest suite (85+ tests)
./scripts/dev.ps1 build          # runtime lib + dist-web + governance CLI
./scripts/dev.ps1 verify         # typecheck + lint + test + all builds
./scripts/verify-harness.ps1     # full closed-loop Harness verification
```

The equivalent npm commands are `npm install`, `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build` (plus `build:web` and
`build:governance`), and `npm run verify`. Harness stages are exposed as
`npm run harness:layout|check|workflow` and CI runs the layout guard on every
push.

CLI demo (demo port provider until the composition root wires backend stubs):
`npm run demo:cli`. Web shell demo artifacts are emitted under `dist-web/`.

## License

MIT
