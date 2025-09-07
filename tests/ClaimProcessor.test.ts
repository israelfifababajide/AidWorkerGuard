import { describe, it, expect, beforeEach } from "vitest";

const ERR_POLICY_INVALID = 100;
const ERR_INCIDENT_NOT_FOUND = 101;
const ERR_CLAIM_DENIED = 102;
const ERR_NOT_POLICYHOLDER = 103;
const ERR_CLAIM_ALREADY_PROCESSED = 104;
const ERR_VERIFICATION_FAILED = 105;
const ERR_PAYOUT_FAILED = 106;
const ERR_DISPUTE_IN_PROGRESS = 107;
const ERR_INVALID_COVERAGE = 108;
const ERR_INCIDENT_NOT_MATCHING = 109;
const ERR_UNAUTHORIZED_VERIFIER = 110;

interface Claim {
  claimId: number;
  policyholder: string;
  incidentId: number;
  policyId: number;
  amount: number;
  status: string;
  verified: boolean;
  disputed: boolean;
  timestamp: number;
}

interface ClaimKey {
  policyId: number;
  incidentId: number;
}

interface PolicyDetails {
  holder: string;
  coverage: number;
  active: boolean;
}

interface IncidentDetails {
  reporter: string;
  severity: number;
  locationHash: string;
  timestamp: number;
}

class ClaimProcessorMock {
  state!: {
    admin: string;
    policyManager: string | null;
    incidentReporter: string | null;
    verifierOracle: string | null;
    payoutDistributor: string | null;
    disputeResolver: string | null;
    claims: Map<string, Claim>;
    processedClaims: Map<string, ClaimKey>;
    nextClaimId: number;
    verificationThreshold: number;
  };
  blockHeight: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      policyManager: null,
      incidentReporter: null,
      verifierOracle: null,
      payoutDistributor: null,
      disputeResolver: null,
      claims: new Map(),
      processedClaims: new Map(),
      nextClaimId: 0,
      verificationThreshold: 2,
    };
    this.blockHeight = 0;
  }

  advanceTime(blocks: number) {
    this.blockHeight += blocks;
  }

  setAdmin(newAdmin: string, caller: string = "STX-ADDR") {
    if (this.state.admin !== caller) {
      return { ok: false, value: 500 };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setContracts(pm: string, ir: string, vo: string, pd: string, dr: string, caller: string = "ST1ADMIN") {
    if (this.state.admin !== caller) {
      return { ok: false, value: 501 };
    }
    this.state.policyManager = pm;
    this.state.incidentReporter = ir;
    this.state.verifierOracle = vo;
    this.state.payoutDistributor = pd;
    this.state.disputeResolver = dr;
    return { ok: true, value: true };
  }

  submitClaim(policyId: number, incidentId: number, claimedAmount: number, caller: string = "STX-ADDR") {
    if (!this.state.policyManager || !this.state.incidentReporter) {
      return { ok: false, value: 600 };
    }
    const processedKey = `${caller}-${policyId}-${incidentId}`;
    const processed = this.state.processedClaims.get(processedKey);
    if (processed) {
      return { ok: false, value: ERR_CLAIM_ALREADY_PROCESSED };
    }
    const policyDetails: PolicyDetails = this.getPolicyDetailsMock(caller);
    const incidentDetails: IncidentDetails = this.getIncidentDetailsMock();
    if (policyDetails.holder !== caller || !policyDetails.active) {
      return { ok: false, value: ERR_NOT_POLICYHOLDER };
    }
    if (!incidentDetails) {
      return { ok: false, value: ERR_INCIDENT_NOT_FOUND };
    }
    this.state.processedClaims.set(processedKey, { policyId, incidentId });
    const newId = this.state.nextClaimId;
    const claimKeyStr = `${policyId}-${incidentId}`;
    const newClaim: Claim = {
      claimId: newId,
      policyholder: caller,
      incidentId,
      policyId,
      amount: claimedAmount,
      status: "pending",
      verified: false,
      disputed: false,
      timestamp: this.blockHeight,
    };
    this.state.claims.set(claimKeyStr, newClaim);
    this.state.nextClaimId += 1;
    return { ok: true, value: newId };
  }

  getPolicyDetailsMock(caller: string): PolicyDetails {
    return { holder: caller, coverage: 1000000, active: true };
  }

  getIncidentDetailsMock(): IncidentDetails {
    return { reporter: "ST1REPORTER", severity: 500000, locationHash: "hash", timestamp: this.blockHeight };
  }

  getClaimDetails(claimKey: ClaimKey) {
    const claimKeyStr = `${claimKey.policyId}-${claimKey.incidentId}`;
    const claim = this.state.claims.get(claimKeyStr);
    if (!claim) {
      return { ok: false, value: ERR_CLAIM_DENIED };
    }
    return { ok: true, value: claim };
  }

  processClaim(claimKey: ClaimKey) {
    const claimKeyStr = `${claimKey.policyId}-${claimKey.incidentId}`;
    const claim = this.state.claims.get(claimKeyStr);
    if (!claim) {
      return { ok: false, value: ERR_CLAIM_DENIED };
    }
    if (!this.state.policyManager || !this.state.incidentReporter) {
      return { ok: false, value: 600 };
    }
    const policyDetails: PolicyDetails = this.getPolicyDetailsMock(claim.policyholder);
    const incidentDetails: IncidentDetails = this.getIncidentDetailsMock();
    if (!policyDetails) {
      return { ok: false, value: ERR_POLICY_INVALID };
    }
    if (!incidentDetails) {
      return { ok: false, value: ERR_INCIDENT_NOT_MATCHING };
    }
    if (incidentDetails.severity > policyDetails.coverage || claim.disputed) {
      return { ok: false, value: ERR_INVALID_COVERAGE };
    }
    const updatedClaim: Claim = {
      ...claim,
      status: "processing",
    };
    this.state.claims.set(claimKeyStr, updatedClaim);
    const verifyResult = this.verifyIncidentMock();
    if (verifyResult.ok === false) {
      return { ok: false, value: ERR_VERIFICATION_FAILED };
    }
    return { ok: true, value: true };
  }

  verifyIncidentMock() {
    return { ok: true, value: true };
  }

  verifyClaim(claimKey: ClaimKey, isVerified: boolean, caller: string = "STX-ADDR") {
    if (this.state.verifierOracle !== caller) {
      return { ok: false, value: ERR_UNAUTHORIZED_VERIFIER };
    }
    const claimKeyStr = `${claimKey.policyId}-${claimKey.incidentId}`;
    const claim = this.state.claims.get(claimKeyStr);
    if (!claim) {
      return { ok: false, value: ERR_CLAIM_DENIED };
    }
    const updatedStatus = isVerified ? "verified" : "denied";
    const updatedVerified = isVerified;
    const updatedClaim: Claim = {
      ...claim,
      status: updatedStatus,
      verified: updatedVerified,
    };
    this.state.claims.set(claimKeyStr, updatedClaim);
    if (isVerified) {
      const payoutResult = this.executePayoutMock({ to: claim.policyholder, amount: claim.amount });
      if (payoutResult.ok === false) {
        return { ok: false, value: ERR_PAYOUT_FAILED };
      }
    }
    return { ok: true, value: isVerified };
  }

  executePayoutMock(payout: { to: string; amount: number }) {
    return { ok: true, value: true };
  }

  disputeClaim(claimKey: ClaimKey, reason: string) {
    const claimKeyStr = `${claimKey.policyId}-${claimKey.incidentId}`;
    const claim = this.state.claims.get(claimKeyStr);
    if (!claim) {
      return { ok: false, value: ERR_CLAIM_DENIED };
    }
    if (claim.disputed) {
      return { ok: false, value: ERR_DISPUTE_IN_PROGRESS };
    }
    const updatedClaim: Claim = {
      ...claim,
      status: "disputed",
      disputed: true,
    };
    this.state.claims.set(claimKeyStr, updatedClaim);
    const disputeResult = this.initiateDisputeMock({ claimId: claim.claimId, reason });
    if (disputeResult.ok === false) {
      return disputeResult;
    }
    return { ok: true, value: true };
  }

  initiateDisputeMock(dispute: { claimId: number; reason: string }) {
    return { ok: true, value: 1 };
  }

  setVerificationThreshold(threshold: number, caller: string = "STX-ADDR") {
    if (this.state.admin !== caller) {
      return { ok: false, value: 502 };
    }
    this.state.verificationThreshold = threshold;
    return { ok: true, value: true };
  }

  cancelClaim(claimKey: ClaimKey, caller: string = "STX-ADDR") {
    if (this.state.admin !== caller) {
      return { ok: false, value: 503 };
    }
    const claimKeyStr = `${claimKey.policyId}-${claimKey.incidentId}`;
    const claim = this.state.claims.get(claimKeyStr);
    if (!claim) {
      return { ok: false, value: ERR_CLAIM_DENIED };
    }
    const updatedClaim: Claim = {
      ...claim,
      status: "canceled",
      verified: false,
      disputed: false,
    };
    this.state.claims.set(claimKeyStr, updatedClaim);
    return { ok: true, value: true };
  }

  batchProcessClaims(claimKeys: ClaimKey[]) {
    let successCount = 0;
    for (const key of claimKeys) {
      const result = this.processClaim(key);
      if (result.ok) {
        successCount += 1;
      } else {
        return { ok: false, value: 700 };
      }
    }
    return { ok: true, value: successCount };
  }
}

describe("ClaimProcessor", () => {
  let contract: ClaimProcessorMock;

  beforeEach(() => {
    contract = new ClaimProcessorMock();
  });

  it("should submit a claim successfully", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    const result = contract.submitClaim(1, 1, 500000);
    expect(result).toEqual({ ok: true, value: 0 });
    const details = contract.getClaimDetails({ policyId: 1, incidentId: 1 });
    expect(details.ok).toBe(true);
    expect(details.value).toMatchObject({
      claimId: 0,
      policyholder: "STX-ADDR",
      incidentId: 1,
      policyId: 1,
      amount: 500000,
      status: "pending",
      verified: false,
      disputed: false,
    });
  });

  it("should reject submit claim if contracts not set", () => {
    const result = contract.submitClaim(1, 1, 500000);
    expect(result).toEqual({ ok: false, value: 600 });
  });

  it("should reject submit claim if already processed", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    const result = contract.submitClaim(1, 1, 500000);
    expect(result).toEqual({ ok: false, value: ERR_CLAIM_ALREADY_PROCESSED });
  });

  it("should reject submit claim if not policyholder", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.getPolicyDetailsMock = () => ({ holder: "STX-VALID", coverage: 1000000, active: true });
    const result = contract.submitClaim(1, 1, 500000, "STX-OTHER");
    expect(result).toEqual({ ok: false, value: ERR_NOT_POLICYHOLDER });
  });

  it("should process claim successfully", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    const result = contract.processClaim({ policyId: 1, incidentId: 1 });
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getClaimDetails({ policyId: 1, incidentId: 1 });
    expect((details.value as Claim).status).toBe("processing");
  });

  it("should deny process claim if invalid coverage", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 1500000);
    contract.getIncidentDetailsMock = () => ({ reporter: "ST1REPORTER", severity: 1500000, locationHash: "hash", timestamp: 0 });
    const result = contract.processClaim({ policyId: 1, incidentId: 1 });
    expect(result).toEqual({ ok: false, value: ERR_INVALID_COVERAGE });
  });

  it("should verify claim as true and execute payout", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    contract.processClaim({ policyId: 1, incidentId: 1 });
    const result = contract.verifyClaim({ policyId: 1, incidentId: 1 }, true, "VO");
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getClaimDetails({ policyId: 1, incidentId: 1 });
    expect((details.value as Claim).status).toBe("verified");
    expect((details.value as Claim).verified).toBe(true);
  });

  it("should deny verify claim if unauthorized", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    const result = contract.verifyClaim({ policyId: 1, incidentId: 1 }, true, "STX-UNAUTH");
    expect(result).toEqual({ ok: false, value: ERR_UNAUTHORIZED_VERIFIER });
  });

  it("should dispute claim successfully", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    const result = contract.disputeClaim({ policyId: 1, incidentId: 1 }, "Reason");
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getClaimDetails({ policyId: 1, incidentId: 1 });
    expect((details.value as Claim).status).toBe("disputed");
    expect((details.value as Claim).disputed).toBe(true);
  });

  it("should reject dispute if already in progress", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    contract.disputeClaim({ policyId: 1, incidentId: 1 }, "Reason");
    const result = contract.disputeClaim({ policyId: 1, incidentId: 1 }, "Another");
    expect(result).toEqual({ ok: false, value: ERR_DISPUTE_IN_PROGRESS });
  });

  it("should set verification threshold as admin", () => {
    const result = contract.setVerificationThreshold(5, "ST1ADMIN");
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.state.verificationThreshold).toBe(5);
  });

  it("should cancel claim as admin", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    const result = contract.cancelClaim({ policyId: 1, incidentId: 1 }, "ST1ADMIN");
    expect(result).toEqual({ ok: true, value: true });
    const details = contract.getClaimDetails({ policyId: 1, incidentId: 1 });
    expect((details.value as Claim).status).toBe("canceled");
  });

  it("should batch process claims successfully", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    contract.submitClaim(2, 2, 500000);
    const claimKeys: ClaimKey[] = [
      { policyId: 1, incidentId: 1 },
      { policyId: 2, incidentId: 2 },
    ];
    const result = contract.batchProcessClaims(claimKeys);
    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("should fail batch process if one claim fails", () => {
    contract.setContracts("PM", "IR", "VO", "PD", "DR", "ST1ADMIN");
    contract.submitClaim(1, 1, 500000);
    contract.getIncidentDetailsMock = () => null as any;
    const claimKeys: ClaimKey[] = [
      { policyId: 1, incidentId: 1 },
      { policyId: 2, incidentId: 2 },
    ];
    const result = contract.batchProcessClaims(claimKeys);
    expect(result).toEqual({ ok: false, value: 700 });
  });
});