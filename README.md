# 🛡️ AidWorkerGuard: Smart Contract-Enabled Insurance

Welcome to AidWorkerGuard, a decentralized insurance platform built on the Stacks blockchain using Clarity smart contracts! This project solves the real-world problem of delayed and opaque insurance claims for aid workers in high-risk areas. By leveraging on-chain incident reports from trusted sources (like NGOs or oracles), claims are automated, transparent, and fast—ensuring aid workers get payouts without bureaucratic hurdles.

## ✨ Features

🔒 Secure policy issuance and premium management  
🚨 On-chain incident reporting with verifiable proofs  
⚡ Automated claim processing based on incident data  
💰 Instant payouts via smart contracts upon verification  
🛡️ Multi-party verification to prevent fraud  
📊 Risk assessment and dynamic premium calculation  
🔍 Dispute resolution mechanism for contested claims  
👥 Admin dashboard for insurers and regulators  

## 🛠 How It Works

AidWorkerGuard uses 8 interconnected Clarity smart contracts on the Stacks blockchain to create a trustless insurance ecosystem. Here's the high-level flow:

**Core Smart Contracts (6-10 Involved):**
1. **PolicyManager**: Handles policy creation, renewal, and cancellation. Users (aid workers) purchase policies by paying premiums in STX or a stable token.
2. **PremiumPayment**: Manages premium deposits, refunds, and automated billing schedules using timers or events.
3. **IncidentReporter**: Allows authorized reporters (e.g., NGOs or field supervisors) to submit on-chain incident reports with geolocation hashes, timestamps, and severity details.
4. **RiskAssessor**: Calculates dynamic premiums and coverage limits based on worker's location, role, and historical data stored on-chain.
5. **ClaimProcessor**: Automates claim submission and initial validation by cross-referencing incident reports against active policies.
6. **VerifierOracle**: Integrates with off-chain oracles or multi-signature verifiers to confirm incident authenticity before triggering payouts.
7. **PayoutDistributor**: Executes automatic payouts to the policyholder's wallet upon successful verification, with escrow for disputed cases.
8. **DisputeResolver**: Facilitates arbitration through a voting mechanism or admin intervention, ensuring fair resolution.

**For Aid Workers**
- Purchase a policy via PolicyManager by calling `issue-policy` with your details (e.g., location, coverage amount).
- In case of an incident, wait for an authorized report in IncidentReporter.
- Submit a claim using ClaimProcessor, which auto-matches it to your policy.
- Receive payouts directly if verified— no paperwork needed!

**For Insurers/NGOs**
- Deploy and fund the contracts as admins.
- Monitor incidents and verify via VerifierOracle.
- Use DisputeResolver for any challenges, with on-chain transparency for all parties.

**For Verifiers/Oracles**
- Submit incident reports to IncidentReporter with hashed evidence (e.g., SHA-256 of photos/GPS data).
- Confirm claims in VerifierOracle to trigger PayoutDistributor.

Boom! Claims processed in minutes, not months. All transactions are immutable on the Stacks blockchain, ensuring tamper-proof records and reducing fraud in humanitarian aid insurance.