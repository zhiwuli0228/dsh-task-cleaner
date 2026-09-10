export interface GovernanceIssue {
  code: string;
  message: string;
}

export class GovernanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GovernanceError";
    this.code = code;
  }
}

export function issue(code: string, message: string): GovernanceIssue {
  return { code, message };
}

export type VerificationStatus = "passed" | "failed" | "pending" | "missing";
export type VerificationMode =
  | "declarative"
  | "unit"
  | "integration"
  | "e2e"
  | "manual"
  | "ci";

export interface LedgerVerification {
  path: string;
  mode: VerificationMode;
  status: VerificationStatus;
}

export interface TraceabilityEntry {
  requirement_id: string;
  milestone?: string;
  status:
    | "planned"
    | "specified"
    | "implemented"
    | "acceptance_pending"
    | "accepted"
    | "blocked";
  requirements: string[];
  specs: string[];
  tasks: string[];
  code: string[];
  verification: LedgerVerification[];
  traces: string[];
  human_gate?: string | null;
  gaps?: string[];
}

export interface TraceabilityLedger {
  schema_version: string;
  entries: TraceabilityEntry[];
}

export interface AcceptedDocument {
  path: string;
  gate: string;
}

export interface HumanGateRegistry {
  schema_version?: string;
  accepted_documents: AcceptedDocument[];
}
