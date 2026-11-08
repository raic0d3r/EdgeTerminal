PHASE 5 — SECURITY TESTING & VERIFICATION

New:
- scripts/security/audit-api-routes.cjs — heuristic inventory of API route security patterns.
- npm run security:audit — run the inventory.
- PHASE-5-SECURITY-TESTING.md — authorization, isolation, request-abuse, Firestore, and release-gate test plan.

This is a test harness and verification plan, not a security certification. No live services or production credentials were tested. Run lint/build and the staging tests described in the guide before deployment.
