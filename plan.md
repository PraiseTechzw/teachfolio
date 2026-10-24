# Teachfolio implementation plan and current state

This file is the short project map. See the linked operational documents for setup and behavior details.

## Product

Teachfolio is a teaching-practice portfolio application for student teachers, reviewers, institution coordinators/administrators, and platform administrators. It supports structured portfolio work, placement context, submissions, reviews, evidence, notifications, requirements, and scoped reports.

## Technology

- React, TypeScript, Vite, Wouter and Tailwind frontend.
- Express + tRPC server; browser API base path is `/api/trpc`.
- PostgreSQL accessed by Drizzle ORM.
- Supabase Auth for email/password identity and Supabase Storage for private evidence.
- Resend for workflow email; Supabase SMTP for Auth confirmation/recovery messages.
- Docker builds and runs the combined frontend/API server. A Render staging Blueprint is checked in.

## Implemented areas

- Supabase sign-up/sign-in, confirmation, password recovery, application profile synchronization, and default-deny role access.
- Institution-scoped role assignments, invitation redemption, account states, platform user administration and audit events.
- Student portfolio drafts/submissions/revisions, immutable submission snapshots, reviewer queue/decisions/rubric snapshots, notifications, placement records, requirements, and supported exports.
- Private evidence validation, upload/download authorization, institution/ownership/assignment checks, and platform upload-size configuration.
- Personal Settings for display name, email notification preferences, and password-reset request.
- Platform institution management, user directory, configuration, and audit views.
- Official Zimbabwe teacher-college names and role-based development account seeding.

## Current development seed

- The configured development database has the Ministry-listed teachers’ college institutions.
- Five institution-role login identities are assigned to Seke Teachers’ College (`SEKE-TC`).
- The development-only shared password is in the ignored local access note. The provisioner does not seed a platform-admin identity.
- The database was seeded through the explicit institutions-only and account-provisioning commands; seed scripts are not part of deploy hooks.

## Current deployment issue

At the last live check, `teachfolio.praisetech.tech` served its static frontend from Vercel but returned Vercel `404 NOT_FOUND` for `/api/health` and `/api/trpc`. The frontend therefore cannot use the app API at that host. Deploy the Express server and point the domain to it, or proxy API paths to the deployed Node server. Recheck both endpoints and sign-in after deployment.

## Remaining work / boundaries

- Deploy and smoke-test a reachable production/staging Node API with correct Supabase/Postgres configuration.
- Review live migration status, storage settings, Auth redirects/SMTP, and verify end-to-end login and workflows in the intended environment.
- Add session inventory/revocation and provider failed-login visibility if required by product policy.
- Define institution-approved academic templates, retention, consent, backup/restore, monitoring, and incident response before real student records.
- Add a tenant switcher only if multi-institution identities become a supported product feature; current behavior denies ambiguous multi-tenant accounts.

## Documentation map

- [System guide](docs/system-guide.md): setup, auth lifecycle, role journeys, settings, files, migration, deployment and known boundaries.
- [Roles and permissions](docs/roles-and-permissions.md): capability matrix and account-state rules.
- [ERD](docs/erd.md): Mermaid schema diagram and lifecycle notes.
- [Development accounts](docs/development-accounts.md): institution list, seed commands, credential handling.
- [Staging deployment](docs/staging-deployment.md) and [acceptance checklist](docs/staging-acceptance.md): deployment workflow and verification.
- [Requirements audit](docs/requirements-audit.md): implementation evidence and gaps.
