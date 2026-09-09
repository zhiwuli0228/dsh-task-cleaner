import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadLedger,
  validateAcceptedDocuments,
  validateLedger,
} from "./index.js";
import type { TraceabilityLedger } from "./types.js";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "dsh-governance-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function ledgerFor(root: string, ledger: TraceabilityLedger): string {
  const file = path.join(root, "docs", "harness", "traces", "traceability-ledger.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(ledger, null, 2));
  return file;
}

describe("traceability ledger", () => {
  it("accepts an empty ledger under the dsh-task-cleaner schema", () => {
    const root = makeRoot();
    const ledger = loadLedger(
      ledgerFor(root, {
        schema_version: "dsh-task-cleaner/traceability/v1alpha1",
        entries: [],
      }),
    );
    expect(validateLedger(root, ledger)).toEqual([]);
  });

  it("rejects an unsupported schema version", () => {
    const root = makeRoot();
    const ledger = loadLedger(
      ledgerFor(root, {
        schema_version: "antt/traceability/v1alpha1",
        entries: [],
      }),
    );
    const failures = validateLedger(root, ledger);
    expect(
      failures.some((item) => item.code === "unsupported_traceability_schema_version"),
    ).toBe(true);
  });

  it("accepts an implemented requirement with passed executable verification", () => {
    const root = makeRoot();
    const doc = path.join(root, "docs", "REQ-001.md");
    mkdirSync(path.dirname(doc), { recursive: true });
    writeFileSync(doc, "# REQ-001");
    const testDoc = path.join(root, "tools", "REQ-001.test.ts");
    mkdirSync(path.dirname(testDoc), { recursive: true });
    writeFileSync(testDoc, "import {} from 'vitest';");
    const ledger = loadLedger(
      ledgerFor(root, {
        schema_version: "dsh-task-cleaner/traceability/v1alpha1",
        entries: [
          {
            requirement_id: "REQ-001",
            status: "implemented",
            requirements: ["docs/REQ-001.md"],
            specs: ["docs/REQ-001.md"],
            tasks: ["REQ-001-01"],
            code: ["tools/REQ-001.test.ts"],
            verification: [
              {
                path: "tools/REQ-001.test.ts",
                mode: "unit",
                status: "passed",
              },
            ],
            traces: ["docs/harness/traces/REQ-001.md"],
          },
        ],
      }),
    );
    const traceDoc = path.join(
      root,
      "docs",
      "harness",
      "traces",
      "REQ-001.md",
    );
    mkdirSync(path.dirname(traceDoc), { recursive: true });
    writeFileSync(traceDoc, "# trace");
    expect(validateLedger(root, ledger)).toEqual([]);
  });

  it("rejects an accepted requirement without a Human Gate", () => {
    const root = makeRoot();
    const doc = path.join(root, "docs", "REQ-002.md");
    mkdirSync(path.dirname(doc), { recursive: true });
    writeFileSync(doc, "# REQ-002");
    const ledger = loadLedger(
      ledgerFor(root, {
        schema_version: "dsh-task-cleaner/traceability/v1alpha1",
        entries: [
          {
            requirement_id: "REQ-002",
            status: "accepted",
            requirements: ["docs/REQ-002.md"],
            specs: ["docs/REQ-002.md"],
            tasks: ["REQ-002-01"],
            code: ["docs/REQ-002.md"],
            verification: [
              { path: "docs/REQ-002.md", mode: "unit", status: "passed" },
            ],
            traces: ["docs/REQ-002.md"],
            human_gate: null,
          },
        ],
      }),
    );
    const failures = validateLedger(root, ledger);
    expect(
      failures.some((item) => item.code === "accepted_without_human_gate"),
    ).toBe(true);
  });

  it("rejects escaping artifact paths", () => {
    const root = makeRoot();
    const ledger = loadLedger(
      ledgerFor(root, {
        schema_version: "dsh-task-cleaner/traceability/v1alpha1",
        entries: [
          {
            requirement_id: "REQ-003",
            status: "planned",
            requirements: ["../outside.md"],
            specs: [],
            tasks: [],
            code: [],
            verification: [],
            traces: [],
          },
        ],
      }),
    );
    const failures = validateLedger(root, ledger);
    expect(
      failures.some((item) => item.code === "artifact_path_escapes"),
    ).toBe(true);
  });
});

describe("accepted documents", () => {
  it("flags an Accepted doc without a registered Human Gate", () => {
    const root = makeRoot();
    const adr = path.join(root, "docs", "architecture", "adr", "ADR-001.md");
    mkdirSync(path.dirname(adr), { recursive: true });
    writeFileSync(adr, "Status: Accepted\n");
    const gates = path.join(root, "docs", "harness", "human-gates.json");
    mkdirSync(path.dirname(gates), { recursive: true });
    writeFileSync(
      gates,
      JSON.stringify({
        schema_version: "dsh-task-cleaner/human-gates/v1alpha1",
        accepted_documents: [],
      }),
    );
    const failures = validateAcceptedDocuments(root, gates);
    expect(
      failures.some((item) => item.code === "accepted_document_without_gate"),
    ).toBe(true);
  });

  it("passes when the Accepted doc and gate are both registered", () => {
    const root = makeRoot();
    const adr = path.join(root, "docs", "architecture", "adr", "ADR-002.md");
    mkdirSync(path.dirname(adr), { recursive: true });
    writeFileSync(adr, "Status: Accepted\n");
    const gateDoc = path.join(
      root,
      "docs",
      "harness",
      "traces",
      "decisions",
      "gate.md",
    );
    mkdirSync(path.dirname(gateDoc), { recursive: true });
    writeFileSync(gateDoc, "# gate");
    const gates = path.join(root, "docs", "harness", "human-gates.json");
    mkdirSync(path.dirname(gates), { recursive: true });
    writeFileSync(
      gates,
      JSON.stringify({
        schema_version: "dsh-task-cleaner/human-gates/v1alpha1",
        accepted_documents: [
          {
            path: "docs/architecture/adr/ADR-002.md",
            gate: "docs/harness/traces/decisions/gate.md",
          },
        ],
      }),
    );
    expect(validateAcceptedDocuments(root, gates)).toEqual([]);
  });
});
