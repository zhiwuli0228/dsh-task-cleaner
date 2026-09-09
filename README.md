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

## License

MIT
