# Teachfolio staging acceptance checklist

Use a dedicated, non-production Supabase project and synthetic data only. This checklist is designed to be completed by an operator with staging access; do not paste credentials, session cookies, invitation tokens, learner data, or private file URLs into tickets or source control.

## Current verification record — 2026-10-22

- Local `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check` passed on this working tree. Vitest reports 52 tests across 11 files. The production build still reports an 809.47 kB main JavaScript chunk above Vite's 500 kB warning threshold.
- The outage path now shows an error without fictional portfolio records; a component regression test covers a service-unavailable response. This is local component verification, not a live workflow test.
- Staging verification and account-based acceptance remain **not run**: no staging credentials/project access or functioning DNS was available in the execution environment. Do not mark the boxes below complete based on this record.
- No production deployment was performed. The intended host/domain and production runtime configuration still need to be selected and verified.

## 1. Build and prepare staging

- [ ] Confirm the Supabase URL and database connection belong to the staging project. Confirm backups/recovery and an approved test-data retention plan.
- [ ] Review the checked-in PostgreSQL migration before applying it. Apply migrations only to the empty/dedicated staging database; do not use `db:push` against production.
- [ ] Configure Auth email/password, confirmation, Site URL, and allowed callback URLs for the staging origin.
- [ ] Create the `teachfolio-evidence` bucket as private with a 25 MiB limit and exactly these MIME types: PDF, DOCX, XLSX, PPTX, JPEG, PNG, MP4.
- [ ] Start with the local checks:

  ```sh
  pnpm check
  pnpm test
  pnpm build
  ```

  The acceptance verifier uses only `STAGING_*` environment variables; it does not read `.env` or fall back to production variables. Supply values from your staging secret manager or secure shell environment. Do not put them in command history or commit them.

  ```sh
  export STAGING_CHECK_CONFIRMATION=I_CONFIRM_READ_ONLY_STAGING_CHECKS
  export STAGING_DATABASE_URL='<staging PostgreSQL URL with sslmode=require>'
  export STAGING_SUPABASE_URL='https://<staging-project-ref>.supabase.co'
  export STAGING_SUPABASE_SECRET_KEY='<staging-only secret key>'
  export STAGING_STORAGE_BUCKET=teachfolio-evidence
  pnpm verify:staging
  unset STAGING_CHECK_CONFIRMATION STAGING_DATABASE_URL STAGING_SUPABASE_URL STAGING_SUPABASE_SECRET_KEY STAGING_STORAGE_BUCKET
  ```

  `verify:staging` is read-only: it opens a PostgreSQL `READ ONLY` transaction to inspect the expected tables, RLS flags, browser-role policies, and anon/authenticated table grants. It sends an authenticated GET for bucket metadata and checks privacy, size, and MIME settings. It never creates, updates, or deletes database or storage records. A failed check exits non-zero. If the shell pnpm launcher cannot select the pinned version, run the same script through the already-installed project pnpm:

  ```sh
  node node_modules/.pnpm/pnpm@10.18.0/node_modules/pnpm/bin/pnpm.cjs verify:staging
  ```

- [ ] Record verifier output (PASS/FAIL names only) in the staging change record. Review any custom-role Postgres policy reported by the script manually; the app is designed not to grant browser table access.
- [ ] For that manual review, use the Supabase SQL editor against staging and inspect policy expressions without changing them:

  ```sql
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
  ```

  Confirm each custom-role policy is intentional and cannot expose cross-institution data. Do not add a browser policy as a workaround for failed application authorization.
- [ ] Start the staging application with staging-only Auth, database, storage, and session configuration. Check the server logs for successful startup without recording secret environment values.

## 2. Seed synthetic accounts and tenant boundary cases

Create accounts and assignments through the supported invitation/admin flow. Use synthetic names/emails and two separate institutions. Have these accounts available:

| Account | Assignment |
| --- | --- |
| Student A | Active student teacher in Institution A with an active placement |
| Reviewer A | Assigned supervisor or lecturer for Student A's placement |
| Reviewer A2 | Supervisor/lecturer in Institution A, not assigned to Student A |
| Admin A | Institution administrator for Institution A |
| Student B | Active student teacher in Institution B with a separate placement |
| Platform operator | Platform administrator; no institution-specific student evidence assignment |

- [ ] Invite a staging user with Institution A admin; confirm the invitation is institution-bound, expires as configured, and only the matching authenticated email can redeem it.
- [ ] Confirm another tenant admin cannot list Institution A's invitations, users, placements, evidence, reports, or audit events by changing IDs or URLs.
- [ ] Confirm a platform administrator can perform platform operations but cannot fetch student evidence without an explicit institution assignment.
- [ ] Confirm Reviewer A can access Student A's submitted version and its evidence; Reviewer A2 and Student B cannot access it.
- [ ] Confirm Student A cannot access Student B's records and vice versa.

For each forbidden request, record the route/procedure and expected denial (403/404 or equivalent) without saving bearer tokens, cookies, or signed URLs.

## 3. Portfolio, media, review, and revision workflow

- [ ] Student A creates a draft scheme and lesson plan, saves, reloads, and verifies content and placement associations persist.
- [ ] Student A creates a reflection and a supporting document/evidence entry. Verify required-field validation and actionable error messages.
- [ ] Upload synthetic PDF and image files; verify transfer progress, success state, image preview, and authorized download.
- [ ] Upload a short, synthetic MP4 smaller than 25 MiB; verify progress, private playback, and byte-range seeking. Confirm unsupported MIME/signature and over-limit files fail without creating evidence metadata.
- [ ] Cancel an in-progress upload; verify the UI reports cancellation and the evidence list is checked before retrying. The current workflow does not resume interrupted uploads.
- [ ] Submit Student A's portfolio entry and confirm a version snapshot is created and cannot be silently edited while under review.
- [ ] Reviewer A opens the queue, reviews the correct version/evidence, records rubric/comments, and requests revisions. Confirm a notification appears for Student A and does not appear for Student B.
- [ ] Student A reads the notification, revises the entry, resubmits, and confirms version history preserves both versions and prior review feedback.
- [ ] Reviewer A approves or rejects the new version. Confirm status, reviewer identity/time, review history, and student notification reflect the decision.
- [ ] Mark a notification read; verify read state persists after reload and tenant/owner checks prevent another account changing it.

## 4. Reports and release behavior

- [ ] Institution A admin/coordinator exports CSV; compare rows and institution scope to staging records. Include a synthetic value starting with `=`, `+`, `-`, or `@` and confirm the CSV neutralizes spreadsheet formula execution.
- [ ] Institution B's report contains only Institution B records. A student and unauthorized reviewer cannot invoke the report procedure directly.
- [ ] Confirm empty, loading, failed-network, and success states are understandable on a narrow/mobile and desktop viewport.
- [ ] Keyboard-test sign-in, invite redemption, portfolio editor, evidence upload/cancel, review, notifications, and CSV controls. Confirm visible focus, logical tab order, dialog focus/escape behavior, and no keyboard trap.
- [ ] Check contrast and accessible names with an approved browser accessibility tool; record results and fix critical issues.
- [ ] Confirm no staging secrets, tokens, personal data, or private media URLs appear in browser console, server logs, or generated CSVs.

## 5. Sign-off

Do not mark staging acceptance complete unless every mandatory item above is PASS or has a documented, approved exception with owner and deadline. Required release evidence:

- [ ] `pnpm check`, `pnpm test`, and `pnpm build` pass on the release commit.
- [ ] `pnpm verify:staging` passes against the named staging project.
- [ ] Student/reviewer/admin and cross-institution journeys pass with separate accounts.
- [ ] Private storage, MP4 playback/range requests, review feedback, notifications, invitation redemption, and tenant-filtered CSV are verified.
- [ ] Invitation delivery is explicitly accepted as manual, or a transactional email provider has been implemented and tested. Do not describe current manual sharing as automatic email.
- [ ] The 25 MiB teaching-video cap is explicitly accepted, or resumable upload is implemented and interruption/recovery tested.
- [ ] Accessibility review and staging data cleanup/retention are signed off.

Staging project reference (non-secret): __________  Release commit: __________  Date: __________

Tester(s): __________  Decision: PASS / FAIL / CONDITIONAL  Open blocker(s): __________

## 6. Production deployment gate

Do not deploy to production until staging sign-off above is PASS and the release blockers in `requirements-audit.md` are resolved or explicitly accepted by the release owner.

- [ ] Record the intended hosting provider, production domain, release commit, and named release owner.
- [ ] Configure production-only secrets in the host's secret manager. Confirm the running server receives the required database, Supabase, session, and origin settings without printing values to logs.
- [ ] Review migration compatibility and apply only an approved, backed-up production migration. Never use the demo seed against production.
- [ ] Verify production HTTPS, Auth Site URL/callback allowlist, and allowed origins.
- [ ] Confirm database and media backup/restore procedures, monitoring/error reporting, and a tested rollback path.
- [ ] Deploy the approved release, run non-destructive health and sign-in checks, then verify an authorized portfolio read and private evidence denial for an unauthorized account.
- [ ] Record the deployment URL, release commit, smoke-test results, and rollback owner. If any service check fails, roll back using the approved procedure and do not report the release as successful.

Provider: __________  Domain: __________  Release commit: __________  Owner: __________  Deployment URL: __________
