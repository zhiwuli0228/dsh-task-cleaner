# ADR-002: Module Boundaries, Dependency Rules, and Shell Contracts

- Status: Proposed (2026-09-09)
- Change: harness-framework-baseline
- Related: ADR-001, ADR-003, ADR-004, ADR-005

## Context

Acceptance requires that no business module except the adapter layer depends on
DSH internals. The UX contract requires shells that only present port results,
never compute decisions, and expose no destructive surface. The security
review requires filesystem and Git primitives to be reachable only through
dedicated ports.

## Decision

The `src/` tree is layered as domain / ports / app / adapter / shell:

```text
src/
  index.ts                  Cordis apply(ctx, config) composition root
  config.ts                 Schemastery config; dryRun default true
  domain/                   framework-free contract types and safety kernel
  ports/                    filesystem, git, task-metadata, clock, hash,
                            audit-store, quarantine-store, task-lifecycle
  app/                      CleanupOrchestrator and use-cases (noop/stub)
  adapter/
    dsh/                    ONLY place importing @deepseek-ai/*
    filesystem|git|clock|hash|audit-store|quarantine-store|task-lifecycle|
    task-metadata/          port implementations / stubs
  shell/                    UX view-models, UxShellPorts, JSON envelope
  cli/                      CLI shell
  web/                      Web UI shell (five views)
```

Rules:

1. Dependency direction is one-way:
   `adapter -> ports/domain`, `app -> ports/domain`, `ports -> domain`,
   `shell -> app/domain`. Shells never import adapter internals.
2. Runtime imports of `@deepseek-ai/*` are allowed only under
   `src/adapter/dsh/`; an architecture test (import-boundary) enforces this.
3. `src/domain/` is zero-framework and host-independent. Runtime domain
   contract types and JSON Schema sidecars are co-located so TS types and
   schemas cannot drift silently.
4. Filesystem primitives are confined to the filesystem port/adapter; Git
   invocation is confined to the git port/adapter. Business code never
   constructs paths or shells out to Git directly.
5. Shell layers (`cli/`, `web/`) consume `src/shell/` view-model contracts and
   the injected ports only. They present, format, and map state; they do not
   recompute safety decisions and expose no delete/purge/force surface.
6. `src/index.ts` is the DSH composition root and re-exports shell contracts;
   package exports separate `./shell` so browser/pure-shell consumers do not
   pull the Node/DSH dependency chain.

## Consequences

- A DSH version change is confined to `src/adapter/dsh/` plus peer dependency
  ranges; domain/ports remain stable.
- CLI, Web, and DSH-plugin entry points share one domain/ports core instead of
  forking business logic.
- The TestAgent can verify module boundaries with static and fixture-level
  tests, independent of DSH availability.

## Data-contract integration (from DataEngineerAgent)

- Runtime contract types live in `src/domain/` with schema sidecars in
  `src/domain/schemas/*.schema.json`; the governance six-segment ledger is a
  governance artifact under `docs/harness/`, not a runtime domain type.
- `decision_id` is produced exclusively by the safety kernel
  (`SafetyKernel.decide`); data stores propagate, never regenerate.
- Audit/quarantine persistence goes through `src/ports/audit-store` and
  `src/ports/quarantine-store`; adapters implement storage only.
