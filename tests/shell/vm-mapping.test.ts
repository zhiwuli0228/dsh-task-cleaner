import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapCandidate,
  mapPlan,
  toVmCategory,
  toVmCandidateState,
  type DomainShapedCandidate,
} from "../../src/shell/vm-mapping.js";

const baseCandidate: DomainShapedCandidate = {
  candidateId: "cand_1",
  relPath: "tmp/x.log",
  kind: "temp",
  sizeBytes: 2048,
  mtime: "2026-09-09T12:00:00.000Z",
  gitTracked: false,
  state: "candidate",
  matchedBy: ["rule:tmp-ext"],
};

describe("view-model mapping (§7.1, R1)", () => {
  it("maps data-contract kinds to display buckets", () => {
    assert.equal(toVmCategory("temp"), "tmp");
    assert.equal(toVmCategory("cache"), "cache");
    assert.equal(toVmCategory("build"), "intermediate");
    assert.equal(toVmCategory("intermediate"), "intermediate");
    assert.equal(toVmCategory("unknown"), "unknown");
  });

  it("maps artifact states to read-only row states", () => {
    assert.equal(toVmCandidateState("candidate"), "offered");
    assert.equal(toVmCandidateState("planned_quarantine"), "offered");
    assert.equal(toVmCandidateState("quarantined"), "quarantined");
    assert.equal(toVmCandidateState("restored"), "restored");
    assert.equal(toVmCandidateState("skipped"), "skipped");
    // purged/expired exist in the data contract but are never actionable
    // in the baseline shell (S-07).
    assert.equal(toVmCandidateState("purged"), "skipped");
    assert.equal(toVmCandidateState("expired"), "skipped");
  });

  it("marks protected candidates with display tags only", () => {
    const vm = mapCandidate({
      ...baseCandidate,
      gitTracked: true,
      symlink: { target: "/outside" },
      outsideWorkspace: true,
    });
    assert.deepEqual(vm.riskTags, [
      "git-tracked",
      "symlink",
      "outside-workspace",
    ]);
    assert.equal(vm.selected, false);
    assert.equal(vm.state, "offered");
  });

  it("does not compute decisions: counts reflect the input rows", () => {
    const plan = mapPlan({
      planId: "plan_1",
      taskId: "tsk_1",
      generatedAt: "2026-09-09T12:00:00.000Z",
      workspaceLabel: "ws",
      artifacts: [
        baseCandidate,
        { ...baseCandidate, candidateId: "cand_2", kind: "cache", sizeBytes: 4096 },
      ],
      protectedHits: [{ path: "a.txt", reasonCode: "git-tracked" }],
    });
    assert.equal(plan.dryRun, true);
    assert.equal(plan.summary.offered, 2);
    assert.equal(plan.summary.bytesOffered, 2048 + 4096);
    assert.equal(plan.summary.denied, 1);
    assert.equal(plan.protectedHits[0]?.reasonCode, "git-tracked");
  });

  it("view models survive JSON round trips", () => {
    const vm = mapCandidate(baseCandidate);
    const roundTrip = JSON.parse(JSON.stringify(vm)) as typeof vm;
    assert.deepEqual(roundTrip, vm);
  });
});
