# Teachfolio system guide

This guide describes the implementation in this repository. It is a reference for developers and administrators; it is not a claim of legal compliance, institutional accreditation, or production readiness.

## Contents

- [Architecture](#architecture)
- [Sign-in and access](#sign-in-and-access)
- [Institutions and roles](#institutions-and-roles)
- [User journeys](#user-journeys)
- [Settings](#settings)
- [Evidence, email, and notifications](#evidence-email-and-notifications)
- [Database and migrations](#database-and-migrations)
- [Development accounts](#development-accounts)
- [Deployment and known production issue](#deployment-and-known-production-issue)
- [Known boundaries](#known-boundaries)

## Architecture

| Layer | Implementation | Main locations |
| --- | --- | --- |
| Browser UI | React, TypeScript, Vite, Wouter, Tailwind | `client/src/` |
| API | Express and tRPC; browser calls the same-origin `/api/trpc` endpoint | `server/_core/index.ts`, `server/routers.ts`, `client/src/main.tsx` |
| Data access | Drizzle ORM with PostgreSQL | `drizzle/schema.ts`, `server/db.ts` |
| Identity | Supabase Auth email/password | `server/supabase-auth.ts`, `server/_core/sdk.ts` |
| File storage | Private Supabase Storage bucket `teachfolio-evidence`; authorization and streaming are server-side | `server/evidence.ts`, `server/storage.ts` |
| Transactional email | Resend for workflow messages; Supabase Auth SMTP for confirmation/recovery | `server/email.ts`, Supabase Auth settings |

The server uses the privileged PostgreSQL connection and enforces authorization in application code. Database tables have RLS enabled, but per-user Postgres policies are not configured for browser access. Do not expose database credentials or query application tables directly from the browser.

## Sign-in and access

1. A person signs up with email and password through Supabase Auth. Passwords are handled by Supabase; Teachfolio does not store readable passwords.
2. Supabase confirms the email when email confirmation is enabled. Recovery and confirmation links are issued by Supabase Auth.
3. On an authenticated request, the server resolves the Auth identity to a row in `users`.
4. Protected application procedures then require a verified, enabled account and at least one active role assignment.
5. Tenant access is derived from those assignments. An account with active assignments in more than one institution is denied because the current session model has no institution switcher.
6. Each query and mutation checks the assigned role and institution scope. Reviewer work is additionally constrained to students assigned in a placement.

An Auth identity by itself does not grant access. `users.role` is a legacy field and does not authorize application features. Role authority lives in `access_assignments`.

### Invitation activation

An institution administrator invites an exact email to an institution and role. The server stores only a hash of a random, single-use token. The invitation expires after the configured number of days (default 7). The invitee signs up/signs in with the same email and redeems the token; the server creates the active role assignment and audit event. Platform administrators may bootstrap an institution administrator invitation only. Invitations do not allow `platform_admin` assignment.

## Institutions and roles

The permission matrix is documented in [roles and permissions](roles-and-permissions.md). There are six application roles: `student_teacher`, `supervisor`, `lecturer`, `coordinator`, `institution_admin`, and `platform_admin`.

Most users should have one institution and one or more roles within that institution. Platform admins have a platform-scoped assignment (`institutionId = null`). Platform admin assignment is performed with the trusted server-side `pnpm provision:platform-admin` command, not from the user-management screen.

The development provisioner contains the 15 Zimbabwe teachers’ colleges listed by the [Ministry of Higher and Tertiary Education](https://mhtestd.gov.zw/?p=5772). Codes in the provisioner are internal identifiers and do not assert affiliation, endorsement, or partnership by those institutions.

## User journeys

### Student teacher

- Views placement context, portfolio requirements, personal submissions, status and feedback.
- Creates and saves portfolio drafts for schemes, lesson plans, reflections, evidence metadata, observations, supporting documents and final reports.
- Submits work. Submission versions are snapshotted so reviewer decisions apply to a specific submitted version.
- Revises work only after an authorized reviewer requests changes; a resubmission creates another version.
- Views notifications and personal account settings.

### Supervisor or lecturer

- Views a review queue for students linked through placement assignments.
- Starts a review and decides with comments and a versioned rubric snapshot.
- Can access only assigned students and authorized submitted-version evidence. Self-review is denied.

### Coordinator

- Manages placement records and reviewer/student links for the institution.
- Views and updates institution portfolio requirements.
- Uses institution-scoped reports and CSV exports where available.

### Institution administrator

- Manages institution users, invitations, assignment status, placements, requirements, and institution audit activity.
- Cannot grant platform-admin privileges or manage a different institution.
- Cannot activate an account that is platform-suspended or unverified. The last active institution administrator cannot be removed or suspended without another active administrator.

### Platform administrator

- Manages institution records and activation/archive state, user directory, institution roles, platform configuration, and platform audit records.
- Can search/filter/paginate/export account records, inspect user assignments and activity, request password recovery/email verification, suspend/reactivate eligible users, and request account deletion.
- Cannot grant or remove platform-admin privileges from the dashboard. A platform administrator cannot delete their own account or be removed through ordinary user management.
- Deletion anonymizes the user profile, disables access, deletes the Auth identity, and retains linked academic/audit history. Failed Auth deletion leaves a disabled, anonymized pending-deletion record for retry.

## Settings

Every signed-in role sees personal Settings:

- **Profile:** update display name; email, assigned role(s), and institution/platform scope are shown as context.
- **Notifications:** turn workflow email notifications on/off. In-app notifications remain separate.
- **Password and security:** request a Supabase password-reset email. The UI never shows or sets an existing password.

Platform Admin also has platform configuration for invitation expiry (1–30 days) and the evidence upload cap (up to 25 MiB). Institution requirements and placement changes are managed in the coordinator/admin areas. Settings do not let users choose their own roles or institution.

## Evidence, email, and notifications

- The evidence bucket is private. The server validates MIME type and configured upload cap, checks institution/ownership/reviewer access, then streams bytes. Signed storage URLs are not exposed to the browser.
- Allowed file types are PDF, DOCX, XLSX, PPTX, JPEG, PNG, and MP4. The configured maximum is 25 MiB.
- Image previews and MP4 byte-range playback use authenticated server routes.
- Consent confirmation is recorded for file evidence. Institutions remain responsible for required school/guardian consent and retention practice.
- Resend sends invitations and workflow notification email. Supabase Auth SMTP handles account confirmation and password recovery. A successful mail API acceptance does not guarantee inbox delivery.
- In-app notification rows are stored separately from email preferences.

## Database and migrations

The schema lives in `drizzle/schema.ts`; reviewed PostgreSQL migrations live in `supabase/migrations/`.

| Migration | Purpose |
| --- | --- |
| `0000_supabase_initial.sql` | Core users, institutions, assignments, invitations, placements, portfolio, review, evidence, notifications, and audit schema |
| `0001_private_evidence_bucket.sql` | Creates/enforces the private evidence bucket, file cap, and MIME allowlist |
| `0002_platform_user_management.sql` | Account state, profile/preferences, institution archive state, and platform settings |

For a fresh database, review the SQL and run `pnpm db:migrate` with the intended database URL. Never point a migration command at production without a reviewed change, backup, and explicit release plan. The old `drizzle/` MySQL files are historical and must not be applied to Supabase PostgreSQL.

See the [ERD](erd.md) for relationships and the [staging deployment guide](staging-deployment.md) for runtime setup.

## Development accounts

The current local development seed creates five Seke Teachers’ College role accounts. Their email addresses and the local shared password are in the ignored, machine-local file [`development-access.local.md`](development-access.local.md). Do not commit or share that file. The shared password is for isolated development only; never use it in production or shared staging.

The provisioner adds all 15 institutions first, then assigns role accounts to exactly one selected institution. The current development institution is `SEKE-TC`. Details and safe rerun behavior are in [development account setup](development-accounts.md).

## Deployment and known production issue

The intended production unit is the Node/Express app serving both the built UI and `/api/trpc`. `Dockerfile` builds the UI and server; `render.yaml` is a staging blueprint. The frontend uses a relative same-origin `/api/trpc` URL.

**Known issue at the last production check:** `https://teachfolio.praisetech.tech/api/health` and `/api/trpc` returned Vercel `404 NOT_FOUND` responses. The HTML/static frontend was present but the API server was not reachable on that domain, so tRPC JSON parsing failed. Deploy the Node server and point the domain to it, or configure a Vercel rewrite to a deployed API origin. Verify `/api/health` returns `{"status":"ok"}`, `/api/ready` returns `{"status":"ready"}`, and a tRPC request returns JSON before treating production login as functional.

Follow [staging deployment](staging-deployment.md) and [staging acceptance](staging-acceptance.md); a successful typecheck or static-page load is not an end-to-end deployment check.

## Known boundaries

- No fine-grained per-user permission grants; users inherit capabilities from their assigned role(s).
- No dashboard control to list/revoke all external Supabase refresh sessions or view provider failed-login history.
- No institution switcher; active access to multiple institutions is rejected.
- No automated retention/deletion policy for linked academic records; account deletion preserves them.
- No claim of legal compliance, accreditation, or production readiness. Review institutional policy, consent, backups, monitoring, retention, and incident response before real learner data is entered.
