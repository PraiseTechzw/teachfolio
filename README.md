<div align="center">
  <img src="client/public/teachfolio-mark.svg" alt="Teachfolio" width="72" />
  <h1>Teachfolio</h1>
  <p><strong>A reflective teaching-practice portfolio for student teachers and the people who support them.</strong></p>
  <p>
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" />
    <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white" />
    <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" />
    <img alt="pnpm 10" src="https://img.shields.io/badge/pnpm-10-f69220?logo=pnpm&logoColor=white" />
    <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2563eb" />
  </p>
</div>

Teachfolio brings lesson planning, reflection, evidence, portfolio submissions, and reviewer feedback into one institution-scoped workspace. Supabase Auth manages sign-in, PostgreSQL stores application records, and a private Supabase Storage bucket holds evidence files.

> **Project status:** an actively developed prototype with staging deployment support. Review the known boundaries and staging checklist before using real learner information. Teachfolio does not claim legal compliance or institutional accreditation.

## Preview

![Teachfolio sign-in screen](docs/screenshots/sign-in.png)

<p align="center"><em>Sign-in screen captured from the local app. Authentication, API, and storage actions require configured Supabase services.</em></p>

### Authentication artwork

These illustrations are used by the sign-in, account creation, recovery, and invitation activation screens. They are product artwork, not additional page screenshots.

<table>
  <tr>
    <td align="center"><strong>Sign in</strong><br /><img src="client/public/auth-signin.png" alt="Teachfolio sign-in illustration" width="340" /></td>
    <td align="center"><strong>Create an account</strong><br /><img src="client/public/auth-create.png" alt="Teachfolio account creation illustration" width="340" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Invitation activation</strong><br /><img src="client/public/auth-activation.png" alt="Teachfolio invitation activation illustration" width="340" /></td>
    <td align="center"><strong>Password recovery</strong><br /><img src="client/public/auth-recovery.png" alt="Teachfolio password recovery illustration" width="340" /></td>
  </tr>
</table>

## What it includes

- **Teaching portfolio:** create and manage schemes of work, lesson plans, reflections, evidence, observations, supporting documents, and final reports.
- **Review workflow:** submit versioned work, receive reviewer feedback, revise requested items, and track review history.
- **Placement coordination:** manage placement assignments and connect student teachers with their supervisors and lecturers.
- **Institution administration:** invite users, manage institution-scoped roles and requirements, and review audit activity.
- **Platform administration:** manage institution records, account states, platform settings, and platform-wide audit records.
- **Private evidence:** upload approved documents, images, and MP4 video to private Supabase Storage, with authorization checked by the server.
- **Notifications and reports:** in-app notifications, optional workflow email, and institution-scoped CSV exports.

## Roles

| Role | Main responsibilities |
| --- | --- |
| Student teacher | Build a portfolio, submit work, and respond to feedback. |
| Supervisor | Review and assess work for assigned student teachers. |
| Lecturer | Review and assess work for assigned student teachers. |
| Coordinator | Manage placements, reviewer links, requirements, and reports. |
| Institution administrator | Manage institution users, invitations, placements, and audit activity. |
| Platform administrator | Manage institutions, platform settings, account state, and platform audit activity. |

Access comes from active role assignments. Registering an account alone does not grant a role; an administrator must issue an invitation. See the [roles and permissions guide](docs/roles-and-permissions.md) for the detailed rules.

## Architecture

| Area | Stack |
| --- | --- |
| Web app | React, TypeScript, Vite, Tailwind CSS, Wouter |
| API | Express, tRPC, Zod |
| Database | Supabase PostgreSQL, Drizzle ORM |
| Authentication | Supabase Auth email/password |
| Evidence files | Private Supabase Storage |
| Transactional email | Resend API; Supabase Auth SMTP for confirmation and recovery messages |
| Deployment | Docker; Render Web Service Blueprint for staging |

The browser sends application requests to the same-origin `/api` routes. The server enforces role, institution, ownership, and reviewer-assignment checks. Database credentials, the Supabase server secret, session secret, and Resend API key must remain server-side.

## Run locally

### Requirements

- Node.js 22 or newer
- pnpm 10
- A Supabase project for authentication, PostgreSQL, and private Storage

### Setup

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Fill in the required values in `.env`, then apply the migrations to the intended database and start the app:

```sh
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). For a fresh database, review the SQL in `supabase/migrations/` first. Keep `.env` private; it is ignored by Git.

### Required environment

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase key used for Auth operations. |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key. Never expose it in browser code. |
| `DATABASE_URL` | TLS-enabled PostgreSQL connection string. Server-only. |
| `SESSION_SECRET` | Random secret of at least 32 bytes for session-bound CSRF tokens. |
| `APP_BASE_URL` | Public HTTPS origin used to build email links in deployed environments. |
| `SUPABASE_STORAGE_BUCKET` | Private evidence bucket; use `teachfolio-evidence`. |
| `RESEND_API_KEY` | Optional server-only key for invitation and workflow email. |
| `RESEND_FROM_EMAIL` | Sender address on a domain verified with Resend. |

See [.env.example](.env.example) for the full list, including optional seed configuration. Never commit real credentials or place secret values in `VITE_` variables.

## Supabase and email setup

1. Create a Supabase project and configure email/password sign-in in **Authentication**.
2. In **Project Settings → API**, copy the project URL and publishable key. Keep the secret key private.
3. In **Project Settings → Database**, copy the PostgreSQL connection string and require TLS with `sslmode=require`.
4. Apply the reviewed migrations in `supabase/migrations/` to the target database with `pnpm db:migrate`.
5. Create a private Storage bucket named `teachfolio-evidence`. Set its size limit to 25 MiB and allow PDF, DOCX, XLSX, PPTX, JPEG, PNG, and MP4 files.
6. Set the Auth Site URL to the app origin and allow that origin plus `<APP_BASE_URL>/?invite=*` as a redirect URL. Keep the wildcard limited to invitation links.
7. For workflow email, verify a sender domain in Resend, then configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on the server. To send Supabase confirmation and recovery emails through Resend, configure Supabase Auth SMTP separately.

The storage bucket must remain private. The server streams uploads with a 25 MiB cap and authorizes downloads against institution, assignment, ownership, and submitted-version history. Do not add public-object access or browser queries against application tables.

See [Supabase Auth email templates](docs/supabase-auth-email-templates.md) for the provided confirmation, recovery, invitation, and email-change templates.

## First administrator and invitations

The first platform administrator is provisioned by a trusted operator after the person registers and signs in:

```sh
REGISTERED_USER_OPEN_ID='replace-with-the-verified-users.openId'
pnpm provision:platform-admin "$REGISTERED_USER_OPEN_ID" --confirm-trusted-platform-admin
```

Verify the target user's `openId` before running the command. Use the intended database URL and never expose this operation through a public endpoint. Platform administrators can then create institutions and issue invitations. Invitations are single-use, bound to an email, institution, and role, and expire after seven days by default.

For isolated development, see [development account setup](docs/development-accounts.md). Do not use shared demo passwords for production or shared staging. The seed creates accounts and institutions only; it does not create invented portfolio or placement records.

## Deploy a free staging service

The checked-in `render.yaml` selects a **Free** Docker web service. In Render, create a Blueprint from this repository, review the plan before applying it, and add the staging environment variables in the dashboard. The Free service sleeps after 15 minutes without traffic and can take about a minute to wake. It has limited monthly usage and no persistent disk; application records and evidence are stored in Supabase instead.

Without a payment method, Render says it suspends services or disables new builds rather than billing for usage beyond included amounts. Keep a payment method off the account and monitor **Billing → Included Usage**. Free service availability is not suitable for production. For the complete setup, migration, Auth redirect, and acceptance sequence, follow the [staging deployment guide](docs/staging-deployment.md) and [staging acceptance checklist](docs/staging-acceptance.md).

`/api/health` checks that the process responds. `/api/ready` checks database readiness. Neither endpoint proves that Auth, email, Storage, or user workflows are configured correctly.

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the Express server and Vite development UI. |
| `pnpm build` | Build the production UI and bundled Node server. |
| `pnpm start` | Start the production server. |
| `pnpm check` | Run the TypeScript checker. |
| `pnpm test` | Run the unit test suite. |
| `pnpm verify:staging` | Run read-only schema, grants, RLS, and private Storage checks using explicit `STAGING_*` variables. |
| `pnpm db:generate` | Generate a Drizzle PostgreSQL migration. Review generated SQL before applying it. |
| `pnpm db:migrate` | Apply migrations to the database in `DATABASE_URL`. |

## Documentation

- [System guide](docs/system-guide.md) — architecture, user journeys, settings, security, and known boundaries.
- [Roles and permissions](docs/roles-and-permissions.md) — role capabilities and account-state rules.
- [Database ERD](docs/erd.md) — database entities and relationships.
- [Development accounts](docs/development-accounts.md) — local seed accounts and setup.
- [Staging deployment](docs/staging-deployment.md) — Docker, Render, environment variables, migrations, and Auth configuration.
- [Staging acceptance](docs/staging-acceptance.md) — account and workflow checks before accepting a staging release.
- [Requirements audit](docs/requirements-audit.md) — implementation evidence and known gaps.
- [Supabase Auth email templates](docs/supabase-auth-email-templates.md) — confirmation, recovery, invitation, and email-change templates.

## Security and privacy notes

- Never commit `.env`, API keys, database connection strings, session secrets, passwords, invitation tokens, or private account notes.
- The Supabase server secret bypasses Storage RLS; keep it server-only and rotate it if it is exposed.
- Keep the evidence bucket private and retain the server-side authorization checks.
- Get required school and guardian consent before uploading identifiable learner media.
- Configure backups, monitoring, retention, consent procedures, and incident response before using real student records.
- The application does not claim legal compliance, accreditation, or production readiness.

## License

This project declares the MIT license in `package.json`.
