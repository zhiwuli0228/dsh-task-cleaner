import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadLedger,
  validateAcceptedDocuments,
  validateLedgerAgainstSchema,
  validateLedger,
  checkContainedPath,
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

describe("traceability schema as source of truth", () => {
  function writeSchema(root: string, overrides: Record<string, unknown> = {}): void {
    const schemaPath = path.join(root, "docs", "harness", "traceability.schema.json");
    mkdirSync(path.dirname(schemaPath), { recursive: true });
    const base = {
      schema_version: { const: "dsh-task-cleaner/traceability/v1alpha1" },
      entries: {
        items: {
          properties: {
            requirement_id: { pattern: "^[A-Z]+-[0-9]{3}$" },
            status: {
              enum: [
                "planned",
                "specified",
                "implemented",
                "acceptance_pending",
                "accepted",
                "blocked",
              ],
            },
            verification: {
              items: {
                properties: {
                  mode: {
                    enum: ["declarative", "unit", "integration", "e2e", "manual", "ci"],
                  },
                  status: { enum: ["passed", "failed", "pending", "missing"] },
                },
              },
            },
          },
        },
      },
    };
    const merged = {
      properties: { ...base, ...overrides },
    };
    writeFileSync(schemaPath, JSON.stringify(merged, null, 2));
  }

  function emptyLedger(): TraceabilityLedger {
    return {
      schema_version: "dsh-task-cleaner/traceability/v1alpha1",
      entries: [],
    };
  }

  it("accepts an empty ledger that matches the committed schema", () => {
    const root = makeRoot();
    writeSchema(root);
    expect(validateLedgerAgainstSchema(root, emptyLedger())).toEqual([]);
  });

  it("rejects requirement ids outside the schema pattern", () => {
    const root = makeRoot();
    writeSchema(root);
    const ledger = emptyLedger();
    ledger.entries.push({
      requirement_id: "REQ-01",
      status: "planned",
      requirements: [],
      specs: [],
      tasks: [],
      code: [],
      verification: [],
      traces: [],
    });
    const failures = validateLedgerAgainstSchema(root, ledger);
    expect(
      failures.some((item) => item.code === "ledger_schema_requirement_id"),
    ).toBe(true);
  });

  it("rejects a ledger schema_version that drifts from the schema", () => {
    const root = makeRoot();
    writeSchema(root);
    const ledger = emptyLedger();
    ledger.schema_version = "antt/traceability/v1alpha1";
    const failures = validateLedgerAgainstSchema(root, ledger);
    expect(
      failures.some((item) => item.code === "ledger_schema_version_mismatch"),
    ).toBe(true);
  });
});

describe("governance path containment with realpath", () => {
  it("rejects a symlink/junction that resolves outside the governance root", () => {
    const root = makeRoot();
    const outside = makeRoot();
    writeFileSync(path.join(outside, "payload.md"), "secret");
    mkdirSync(path.join(root, "docs"), { recursive: true });
    const linkType =
      process.platform === "win32"
        ? ("junction" as const)
        : ("dir" as const);
    symlinkSync(outside, path.join(root, "docs", "escape"), linkType);
    const failure = checkContainedPath(root, "docs/escape/payload.md");
    expect(failure?.code).toBe("artifact_path_escapes");
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
