(define-constant ERR-POLICY-INVALID (err u100))
(define-constant ERR-INCIDENT-NOT-FOUND (err u101))
(define-constant ERR-CLAIM-DENIED (err u102))
(define-constant ERR-NOT-POLICYHOLDER (err u103))
(define-constant ERR-CLAIM-ALREADY-PROCESSED (err u104))
(define-constant ERR-VERIFICATION-FAILED (err u105))
(define-constant ERR-PAYOUT-FAILED (err u106))
(define-constant ERR-DISPUTE-IN-PROGRESS (err u107))
(define-constant ERR-INVALID-COVERAGE (err u108))
(define-constant ERR-INCIDENT-NOT-MATCHING (err u109))
(define-constant ERR-UNAUTHORIZED-VERIFIER (err u110))

(define-data-var admin principal tx-sender)
(define-data-var policy-manager (optional principal) none)
(define-data-var incident-reporter (optional principal) none)
(define-data-var verifier-oracle (optional principal) none)
(define-data-var payout-distributor (optional principal) none)
(define-data-var dispute-resolver (optional principal) none)

(define-map claims 
  { policy-id: uint, incident-id: uint }
  { 
    claim-id: uint,
    policyholder: principal,
    incident-id: uint,
    policy-id: uint,
    amount: uint,
    status: (string-ascii 20),
    verified: bool,
    disputed: bool,
    timestamp: uint
  })

(define-map processed-claims 
  { policyholder: principal, policy-id: uint, incident-id: uint }
  { policy-id: uint, incident-id: uint })

(define-data-var next-claim-id uint u0)
(define-data-var verification-threshold uint u2)

(define-trait policy-trait
  (
    (get-policy-details (uint) (response { holder: principal, coverage: uint, active: bool } uint))
  ))

(define-trait incident-trait
  (
    (get-incident-details (uint) (response { reporter: principal, severity: uint, location-hash: (buff 32), timestamp: uint } uint))
  ))

(define-trait verifier-trait
  (
    (verify-incident (uint) (response bool uint))
  ))

(define-trait payout-trait
  (
    (execute-payout ({ to: principal, amount: uint }) (response bool uint))
  ))

(define-trait dispute-trait
  (
    (initiate-dispute ({ claim-id: uint, reason: (string-utf8 100) }) (response uint uint))
  ))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err u500))
    (var-set admin new-admin)
    (ok true)))

(define-public (set-contracts (pm principal) (ir principal) (vo principal) (pd principal) (dr principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err u501))
    (var-set policy-manager (some pm))
    (var-set incident-reporter (some ir))
    (var-set verifier-oracle (some vo))
    (var-set payout-distributor (some pd))
    (var-set dispute-resolver (some dr))
    (ok true)))

(define-public (submit-claim (policy-id uint) (incident-id uint) (claimed-amount uint))
  (let (
    (policy (unwrap! (contract-call? (unwrap! (var-get policy-manager) (err u600)) get-policy-details policy-id) ERR-POLICY-INVALID))
    (incident (unwrap! (contract-call? (unwrap! (var-get incident-reporter) (err u601)) get-incident-details incident-id) ERR-INCIDENT-NOT-FOUND))
    (claim-key { policy-id: policy-id, incident-id: incident-id })
    (processed-key { policyholder: tx-sender, policy-id: policy-id, incident-id: incident-id })
    (existing-claim (map-get? processed-claims processed-key))
  )
    (asserts! (is-none existing-claim) ERR-CLAIM-ALREADY-PROCESSED)
    (asserts! (and (is-eq (get holder policy) tx-sender) (get active policy)) ERR-NOT-POLICYHOLDER)
    (map-set processed-claims processed-key { policy-id: policy-id, incident-id: incident-id })
    (let (
      (new-id (var-get next-claim-id))
      (new-claim {
        claim-id: new-id,
        policyholder: tx-sender,
        incident-id: incident-id,
        policy-id: policy-id,
        amount: claimed-amount,
        status: "pending",
        verified: false,
        disputed: false,
        timestamp: block-height
      })
    )
      (map-set claims claim-key new-claim)
      (var-set next-claim-id (+ new-id u1))
      (ok new-id))))

(define-public (process-claim (claim-key { policy-id: uint, incident-id: uint }))
  (let (
    (claim (unwrap! (map-get? claims claim-key) ERR-CLAIM-DENIED))
    (policy (unwrap! (contract-call? (unwrap! (var-get policy-manager) (err u600)) get-policy-details (get policy-id claim)) ERR-POLICY-INVALID))
    (incident (unwrap! (contract-call? (unwrap! (var-get incident-reporter) (err u601)) get-incident-details (get incident-id claim)) ERR-INCIDENT-NOT-MATCHING))
  )
    (asserts! (and (<= (get severity incident) (get coverage policy)) (not (get disputed claim))) ERR-INVALID-COVERAGE)
    (map-set claims claim-key { 
      claim-id: (get claim-id claim),
      policyholder: (get policyholder claim),
      incident-id: (get incident-id claim),
      policy-id: (get policy-id claim),
      amount: (get amount claim),
      status: "processing",
      verified: false,
      disputed: false,
      timestamp: (get timestamp claim)
    })
    (unwrap! (contract-call? (unwrap! (var-get verifier-oracle) (err u602)) verify-incident (get incident-id claim)) ERR-VERIFICATION-FAILED)
    (ok true)))

(define-public (verify-claim (claim-key { policy-id: uint, incident-id: uint }) (is-verified bool))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get verifier-oracle) (err u602))) ERR-UNAUTHORIZED-VERIFIER)
    (let (
      (claim (unwrap! (map-get? claims claim-key) ERR-CLAIM-DENIED))
    )
      (if is-verified
          (begin
            (map-set claims claim-key { 
              claim-id: (get claim-id claim),
              policyholder: (get policyholder claim),
              incident-id: (get incident-id claim),
              policy-id: (get policy-id claim),
              amount: (get amount claim),
              status: "verified",
              verified: true,
              disputed: (get disputed claim),
              timestamp: (get timestamp claim)
            })
            (unwrap! (contract-call? (unwrap! (var-get payout-distributor) (err u603)) execute-payout { to: (get policyholder claim), amount: (get amount claim) }) ERR-PAYOUT-FAILED)
            (ok true))
          (begin
            (map-set claims claim-key { 
              claim-id: (get claim-id claim),
              policyholder: (get policyholder claim),
              incident-id: (get incident-id claim),
              policy-id: (get policy-id claim),
              amount: (get amount claim),
              status: "denied",
              verified: false,
              disputed: (get disputed claim),
              timestamp: (get timestamp claim)
            })
            (ok false))))))

(define-public (dispute-claim (claim-key { policy-id: uint, incident-id: uint }) (reason (string-utf8 100)))
  (let (
    (claim (unwrap! (map-get? claims claim-key) ERR-CLAIM-DENIED))
  )
    (asserts! (not (get disputed claim)) ERR-DISPUTE-IN-PROGRESS)
    (map-set claims claim-key { 
      claim-id: (get claim-id claim),
      policyholder: (get policyholder claim),
      incident-id: (get incident-id claim),
      policy-id: (get policy-id claim),
      amount: (get amount claim),
      status: "disputed",
      verified: (get verified claim),
      disputed: true,
      timestamp: (get timestamp claim)
    })
    (unwrap! (contract-call? (unwrap! (var-get dispute-resolver) (err u604)) initiate-dispute { claim-id: (get claim-id claim), reason: reason }) (err u605))
    (ok true)))

(define-read-only (get-claim-details (claim-key { policy-id: uint, incident-id: uint }))
  (map-get? claims claim-key))

(define-public (set-verification-threshold (threshold uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err u502))
    (var-set verification-threshold threshold)
    (ok true)))

(define-public (cancel-claim (claim-key { policy-id: uint, incident-id: uint }))
  (let (
    (claim (unwrap! (map-get? claims claim-key) ERR-CLAIM-DENIED))
  )
    (asserts! (is-eq tx-sender (var-get admin)) (err u503))
    (map-set claims claim-key { 
      claim-id: (get claim-id claim),
      policyholder: (get policyholder claim),
      incident-id: (get incident-id claim),
      policy-id: (get policy-id claim),
      amount: (get amount claim),
      status: "canceled",
      verified: false,
      disputed: false,
      timestamp: (get timestamp claim)
    })
    (ok true)))

(define-public (batch-process-claims (claim-keys (list 10 { policy-id: uint, incident-id: uint })))
  (fold process-single-claim claim-keys (ok u0)))

(define-private (process-single-claim (claim-key { policy-id: uint, incident-id: uint }) (result (response uint uint)))
  (match result
    success
      (match (process-claim claim-key)
        ok-value (ok (+ success u1))
        err-value (err u700))
    error
      (err u700)))