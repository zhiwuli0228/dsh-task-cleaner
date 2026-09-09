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

## Frontend/shell baseline (UX contract)

The CLI/Web shells and view models implement `docs/design/ux-shell-contract.md`
(once committed) and only map, never compute cleanup decisions:

- `src/shell/` — view-model types, `UxShellPorts`, JSON envelope, formatting,
  command state machine, domain-to-view-model mapping.
- `src/cli/` — command parser and executor (`plan`/`dry-run`, `quarantine`,
  `restore`, `status`, `audit`, `config show`), exit codes per the contract,
  no delete/force surface; entry point `dist/src/cli/main.js` (or
  `node src/cli/main.ts`) uses a demo port provider until the composition
  root wires backend stubs.
- `src/web/` — five views (overview/plan/quarantine/audit/config), view
  states, route resolution, confirmation semantics and a dependency-free DOM
  mount (`dist-web/web/main.js`) for local preview.

Dev self-check (until the DevOps track lands the unified scripts):

```text
npm install
npx tsc -p tsconfig.json          # node-side typecheck
npx tsc -p tsconfig.web.json      # browser-side typecheck
npx tsc -p tsconfig.build.json    # emit dist/ (tests + CLI)
npx tsc -p tsconfig.web-build.json  # emit dist-web/ (browser demo)
node --test dist/tests            # contract tests (node --test <files>)
```

## License

MIT
