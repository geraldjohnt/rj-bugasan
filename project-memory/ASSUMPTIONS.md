# Assumptions

None of these are confirmed requirements.

| ID | Assumption | Reason | Needs confirmation |
|---|---|---|---|
| A-001 | The business is a rice store in the Philippines. | Confirmed by R8-Q5 | No — confirmed |
| A-002 | Currency is Philippine Peso (PHP, ₱). | Confirmed by R8-Q5 | No — confirmed |
| A-003 | Time zone Asia/Manila. | Confirmed by R8-Q5 | No — confirmed |
| A-004 | Volume is small-store scale (well within Firestore free tier). | User did not give figures (R1-Q5) | Low priority |
| A-005 | Cancelling a sale means its payments are refunded (voided); partial returns are not supported in v1 (cancel & re-create). | Follows from R3-Q5 | No — confirmed 2026-11-25 (AQ-4) |
| A-006 | Credit limit warns but does not block; override is logged. | Single owner decides | No — confirmed 2026-11-25 (AQ-4) |
| A-007 | Reliability thresholds: Good >= 90% on time, Fair 70-89%, Poor < 70%, New < 3 paid installments. | Reasonable default | No — confirmed 2026-11-25 (AQ-4) |
| A-008 | Contact number is required for registered customers. | Needed for collections | No — confirmed 2026-11-25 (AQ-4) |
| A-009 | Existing installment accounts are entered as "Opening balance" entries (OB-YYYY-NNNNN) that create receivables but no revenue or stock movement. | From RQ-007 | No — confirmed 2026-11-25 (AQ-4) |
