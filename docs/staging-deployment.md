# Teachfolio staging deployment

This guide deploys a **staging** copy of Teachfolio. It does not create a Supabase project, apply a migration, add a custom domain, or deploy an application by itself. Never connect the staging service to production Supabase credentials.

## Architecture and recommendation

Teachfolio is a single Node.js/Express service. `pnpm build` compiles the React client into `dist/public` and bundles the server as `dist/index.js`; `pnpm start` serves both the API and static client. The Dockerfile uses Node 22, installs the lockfile-pinned pnpm version, builds the app, and starts the compiled server. The server listens on `0.0.0.0:$PORT`. Evidence files live in private Supabase Storage, so the app does not need persistent local disks.

The current Docker approach is deployable without an architectural rewrite. It previously ran as root and exposed only a liveness endpoint; the image now runs as the built-in `node` user, and `/api/ready` checks database connectivity for orchestration. Docker and the Render Blueprint use this readiness path. `/api/health` remains a process liveness check. Readiness checks Postgres only; Auth and Storage are checked separately below.

**Free staging option: Render Web Service using the checked-in Dockerfile and `render.yaml`.** The Blueprint selects Render's Free web service plan. Free services sleep after 15 minutes without incoming traffic and can take about a minute to wake. They may restart, have limited monthly instance hours and bandwidth, and have no persistent disk or dashboard shell. If a workspace without a payment method exceeds its included usage, Render says it suspends free services or disables new builds instead of billing supplementary usage. Check the Billing page's included usage; if you add a payment method later, review the spend limit first. This is suitable for a low-traffic demonstration, not dependable production use. Teachfolio stores records in Supabase Postgres and evidence in private Supabase Storage, so it does not rely on a persistent Render disk. Resend email is sent over its HTTPS API, not SMTP from the Render service. Configure Supabase Auth SMTP separately if you want Supabase confirmation and recovery email delivery. [Render free services](https://render.com/docs/free), [Docker deploys](https://render.com/docs/docker), and [health checks](https://render.com/docs/health-checks).

Render is a practical recommendation, not a provider requirement. Choose the closest supported host region to the existing Supabase project and users; Render's listed regions include Frankfurt and Singapore but not Zimbabwe. Do not move or recreate Supabase just to match the app host. The project's Supabase region is not confirmed yet, so compare it in the Supabase dashboard before creating the Render service. The Supabase Postgres project, Auth, and private Storage remain required external services.

## Required configuration

Set application values only in the staging service's secret/environment settings:

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | Set to `production` so secure cookie behavior is enabled. |
| `PORT` | Set to `3000` to match the container port in `Dockerfile`. |
| `DATABASE_URL` | Staging Supabase **Session pooler** connection URL (shared pooler, port `5432`); require TLS with `sslmode=require` or stricter. |
| `SUPABASE_URL` | Staging Supabase project URL using HTTPS. |
| `SUPABASE_PUBLISHABLE_KEY` | Staging project's publishable key. |
| `SUPABASE_SECRET_KEY` | Staging project's server-only secret key. Never use a browser key in this variable. |
| `SESSION_SECRET` | Random value with at least 32 bytes. The Render Blueprint asks the host to generate it. |
| `SUPABASE_STORAGE_BUCKET` | `teachfolio-evidence`; the application defaults to this name if omitted. |
| `APP_BASE_URL` | Public HTTPS origin of this deployment. Used to build invitation and notification links. |
| `RESEND_API_KEY` | Server-only Resend API key. Also use it as the Supabase Auth SMTP password. |
| `RESEND_FROM_EMAIL` | Sender identity on a domain verified in Resend, such as `Teachfolio <noreply@your-domain.example>`. |

Do not add values to `render.yaml`, Docker build arguments, source control, or logs. The blueprint marks project/database keys as host-entered secrets and disables automatic deployment. It intentionally has no migration/seed hook. Set `NODE_ENV`, `PORT`, bucket, and a generated session secret in the blueprint; enter the staging-only database and Supabase keys in the host dashboard.

For Render, copy the database URL from Supabase **Connect → Session pooler**. Render does not support IPv6, while a Supabase direct database URL can resolve only to IPv6; that fails with `ENETUNREACH` before Postgres receives the query. The shared Session pooler is IPv4-compatible and uses port `5432` with a username in the form `postgres.<project-ref>`. Copy the complete URL from the dashboard, replace only its password placeholder, and keep it in Render's secret environment settings. Do not construct the pooler hostname or reuse the direct connection username.

### External service setup

1. Create or identify a separate Supabase **staging** project and record its region. Enable email/password Auth. Verify a sender domain in Resend and publish its SPF/DKIM DNS records. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the staging `APP_BASE_URL` in the host environment. Configure Supabase Auth custom SMTP with `smtp.resend.com`, port `465` (or `587` with TLS), username `resend`, the Resend API key as password, and the verified sender address. Supabase Auth uses this SMTP connection for confirmation and recovery codes/links; Teachfolio's server sends invitations and workflow notification email through the Resend API.
2. Set Auth **Site URL** to the final HTTPS staging service origin. Add that exact origin and `<APP_BASE_URL>/?invite=*` to Auth's allowed redirect URLs so invite links are retained through signup confirmation and recovery. Keep the wildcard restricted to the invite query. Repeat with the final custom domain only after DNS/TLS is configured.
3. Review `supabase/migrations/0000_supabase_initial.sql` and `0001_private_evidence_bucket.sql` and their RLS/grant posture. The second migration creates or enforces the private `teachfolio-evidence` bucket, 25 MiB limit, and PDF, DOCX, XLSX, PPTX, JPEG, PNG, and MP4 MIME allowlist. This app's browser accesses records through the server; table access is not granted to `anon`/`authenticated` roles. On the empty staging database only, apply the reviewed migrations using `pnpm db:migrate` with `DATABASE_URL` set to the staging connection URL. Do not put a production URL in the migration shell and do not run `pnpm db:push` against production.
5. Create the first trusted staging platform administrator through the procedure in [README.md](../README.md#access-bootstrap), using staging `DATABASE_URL` only. Use synthetic accounts and two institutions for acceptance.

## Create the Render staging service

1. Push this repository and `render.yaml` to a Git remote that the staging operator can connect to. Ensure no `.env` file or secret is tracked.
2. In Render, create a Blueprint from that repository and inspect the proposed resource before applying it. The service is named `teachfolio-staging`, builds from the root `Dockerfile`, uses the Frankfurt region and Free plan, does not auto-deploy on later commits, and uses `/api/ready` as its HTTP health check. Choose another supported region before creation if it is closer to the selected Supabase project. Render does not currently allow changing an existing service's region in place.
3. Populate `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` from the staging project's secure settings. Set `APP_BASE_URL` after the service's HTTPS origin is known. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; confirm `SESSION_SECRET` was generated and `NODE_ENV=production`, `PORT=3000`, and `SUPABASE_STORAGE_BUCKET=teachfolio-evidence` are set.
4. Review and manually trigger the initial staging deployment. No migration or demo seeding runs as part of deploy. Wait until Render's `/api/ready` check passes.
5. Copy the generated HTTPS `onrender.com` origin into the Supabase Auth Site URL and redirect allowlist, save, and redeploy if needed. Verify `https://<staging-host>/api/health` returns `{"status":"ok"}` and `/api/ready` returns `{"status":"ready"}`. These prove process and database readiness only, not the full product workflow.
6. If adding a custom staging domain, configure its DNS at the domain provider and wait for managed TLS to become active before using it in Supabase Auth. No domain is currently selected or configured.

## Diagnose DNS and connectivity safely

The last local diagnostic and this run both returned `ENOTFOUND` for the configured database and Supabase hosts, as well as unrelated public controls (`supabase.com` and `google.com`). This indicates that DNS resolution is unavailable in the execution environment; it does **not** establish that Supabase, the project, or the project hostnames are down. No production configuration was changed.

Run this from the intended staging runner or a network authorized to reach the project. It loads local `.env` without printing hostnames, URLs, usernames, or credentials and reports only resolution status:

```sh
node --input-type=module -e 'import "dotenv/config"; import { lookup } from "node:dns/promises"; const targets=[["database",process.env.DATABASE_URL?new URL(process.env.DATABASE_URL).hostname:null],["supabase",process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).hostname:null],["dns-control-a","supabase.com"],["dns-control-b","google.com"]]; for(const [name,host] of targets){if(!host){console.log(`${name}: NOT_CONFIGURED`);continue;} try{await lookup(host);console.log(`${name}: RESOLVES`);}catch(error){console.log(`${name}: ${error?.code||"LOOKUP_FAILED"}`);}}'
```

Interpretation:

- If both public controls and project hosts fail, fix the runner/VPC/resolver/egress path first; do not edit Supabase settings based on this result.
- If controls resolve but a configured project host does not, compare the URL/connection host against the staging Supabase dashboard and inspect project status, DNS filtering, and database network restrictions.
- If DNS succeeds but TLS or connection tests fail, verify the full current Supabase connection string, TLS mode, database password/rotation state, and allowed network path. Never substitute a previously resolved IP for the database hostname.
- Run `pnpm verify:staging` from that reachable environment with the dedicated `STAGING_*` variables below. The verifier is read-only and does not use `.env`.

## Verify staging

First run local checks from the release commit:

```sh
pnpm check
pnpm test
pnpm build
```

For the database/schema and private bucket checks, load these **staging-only** values from a secret manager, not from shell history or a checked-in file:

- `STAGING_DATABASE_URL`
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_SECRET_KEY`
- `STAGING_CHECK_CONFIRMATION=I_CONFIRM_READ_ONLY_STAGING_CHECKS`
- Optional `STAGING_STORAGE_BUCKET=teachfolio-evidence`

Run `pnpm verify:staging`; review every PASS/FAIL. It checks database DNS/schema/RLS flags/client-role grants and private Storage metadata including MIME types and size. It does not migrate, write records, test Auth email, or run account-based workflows. If the general DNS controls fail, address runner networking and rerun from a reachable environment.

Then follow every account and workflow check in [staging acceptance](staging-acceptance.md). That checklist verifies Auth signup/login/reset and invitation redemption, student drafts/submissions/revisions, private evidence upload/download/MP4 range access, reviewer feedback, notification/read state, CSV tenant filtering, and allowed/forbidden cross-institution access. Use synthetic data and separate accounts. Record live results there; do not treat unit tests or `/api/ready` as proof of those flows.

## Current status and external steps

- Repository staging configuration is prepared; it has not been synced to Render and no application was deployed.
- A reachable staging Supabase project, its server-only credentials, DNS/network access, email SMTP settings, and operator access to the Git/Render account are still required.
- Custom domain access is optional for initial staging because Render supplies HTTPS on its service subdomain. It is required only if the team chooses a branded staging URL.
- Production remains NO-GO until staging acceptance, invitation delivery decision, video upload limit/resumption decision, accessibility sign-off, production host/domain, backup/restore, monitoring, and rollback are completed.
