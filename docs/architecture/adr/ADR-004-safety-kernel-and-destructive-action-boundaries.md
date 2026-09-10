# ADR-004: Safety Kernel and Destructive-Action Boundaries

- Status: Proposed (2026-09-09)
- Change: harness-framework-baseline
- Related: SecurityReviewAgent invariants S-01..S-08 (T-01..T-12)

## Context

The security review (threat model T-01..T-12; critical T-01/02/04/07/11)
delivers executable invariants S-01..S-08. This milestone must contain no
executable production permanent-delete path, while the acceptance criteria
require realpath/workspace/symlink/Git-tracked protections to exist as
executable interfaces or tests.

## Decision

The safety boundary is expressed as interfaces plus default-deny behavior in
this milestone; scope resolution on real read-only Fs/Git predicates is an
open acceptance question routed by the DevelopmentLead:

1. S-01 default deny: `SafetyKernel.decide(...) -> SafetyDecision`
   (allow|deny|review) is the single decision point. No candidate is allowed
   without a positive proof; deny returns a stable reason code.
2. S-02 realpath/workspace boundary: the filesystem port exposes canonicalize/
   realpath and containment predicates; workspace root is validated at startup
   as an existing absolute directory and must not be a filesystem root, home,
   quarantine root, or `.git`.
3. S-03 symlink/link policy: traversal does not follow links; link candidates
   are reported and skipped or handled as the link itself only; identity is
   re-verified immediately before an action (TOCTOU). Windows primitives are
   confined to the filesystem adapter, which documents junction/reparse/case
   handling.
4. S-04 Git tracked-file protection: the git port is the only Git invocation
   point; protected set = HEAD/index tracked + baseline snapshot + `.git/`;
   directory-level operations check every member; post-action git status
   assertions are part of future execution flows.
5. S-05 quarantine safety: quarantine root is an independent explicit config
   item outside the workspace, absolute, non-symlink, owner-only. Records
   carry source real path, relative path, dev/ino/nlink/ctime identity, size,
   mtime, content hash, Git status, manifest id, and decision id.
6. S-06 traceability: candidate id is stable from first listing; `decision_id`
   is minted exclusively by `SafetyKernel.decide()` and flows unchanged
   through manifest/audit/quarantine/restore. Audit events carry actor, event
   source, action, target real path, identity, decision id, result, and
   failure reason; redaction/escaping happens before write.
7. S-07 destructive-action gate: no purge/permanent-delete/force/all surface
   exists in CLI, Web, ports, or adapters in this milestone. Future purge
   requires feature flag + explicit config + human authorization + audit
   records + a recovery window, aligned with TOOL_POLICY.
8. S-08 fail-safe: any validation failure aborts the item rather than
   degrading; partial success is recorded and recoverable; quarantine/restore
   entries are idempotent.

Scope note: in the framework baseline, the executable predicates behind
S-02/S-03/S-04 are represented by ports, stubs, default-deny, and negative
test scaffolding. Whether real read-only predicates plus a negative matrix are
added in this milestone (option A) or deferred as an explicit backlog item
(option B) is a DevelopmentLead/user scope decision recorded on LZWW-2.

## Consequences

- The kernel is the choke point for every future action; no business code may
  bypass it by assembling paths or FS calls.
- Because all ports are fail-closed and the only current decision is deny,
  adding an allow path requires re-running the full security test matrix.
- Data schemas and UX contracts inherit these fields and wording; safety wins
  on any conflict.
