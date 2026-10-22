# Teachfolio

Teachfolio is a student-teacher teaching-practice portfolio built with React, TypeScript, tRPC, Drizzle and Supabase. Supabase Auth handles accounts, Supabase Postgres stores application records, and a private Supabase Storage bucket holds evidence media.

## Supabase setup

Create a Supabase project, then copy `.env.example` to `.env` and fill in:

- `SUPABASE_URL` and the **publishable** key from the project API settings.
- The server-only **secret** key. Never add this key to client code or expose it to users.
- The PostgreSQL connection string from Project Settings → Database. Keep `sslmode=require` enabled.
- A random `SESSION_SECRET` of at least 32 bytes, used to sign CSRF tokens.

In Supabase Auth, enable email/password sign-in and email confirmation. Set the Site URL to the app's public origin and add that origin to the allowed redirect URLs. In Storage, create a **private** bucket named `teachfolio-evidence` and set its size limit to 25 MiB. The application accesses the bucket from its server and checks institution, placement and submission authorization before returning media. The server secret bypasses Storage RLS and must remain private. See [Supabase Auth server guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [private downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## Install and run

Requirements: Node.js 22 or newer and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. New accounts use Supabase Auth email/password and must confirm their email when confirmation is enabled. Account creation does not assign an application role. Access is granted only after an administrator-issued invitation is redeemed by the matching email account.

## Access bootstrap

The first platform administrator must be provisioned by a trusted operator after the target user registers and signs in. Find that user's `openId` in the `users` table, then run this server-side against the configured Supabase database:

```sh
pnpm provision:platform-admin e1416b2e-3a0b-41fe-b78d-10b5b61372e0 --confirm-trusted-platform-admin

e1416b2e-3a0b-41fe-b78d-10b5b61372e0
```

This adds a platform-wide assignment and audit record. Never expose the command through a public endpoint. Platform administrators create institutions and issue invitations. Institution administrators can invite users only to their institution. Invitations are single-use, role- and institution-bound, expire after seven days, and match the exact email. Share invitation tokens only through an institution-approved secure channel.

For fictional sample data, run `pnpm seed:demo --confirm-fictional-demo-seed`. This initializes a reserved demo institution and fictional records; it does not create a demo login or upload files.

## Commands and migrations

- `pnpm dev` — development server
- `pnpm build` / `pnpm start` — production build and server
- `pnpm check` — TypeScript check
- `pnpm test` — application unit tests
- `pnpm db:generate` — generate a Drizzle PostgreSQL migration
- `pnpm db:migrate` — apply generated migrations

The checked-in application schema is now PostgreSQL. Old MySQL migration files under `drizzle/` are historical and must not be applied to Supabase. Review generated SQL before applying it to a live project. The app does not automatically copy data from a former MySQL database; migrate any existing records separately before switching production traffic.

The prototype implements institution-scoped roles, invitation activation, portfolio submissions, reviewer workflows, private evidence authorization, notifications and CSV reporting. It does not claim legal compliance or institutional accreditation. Do not upload identifiable learner media without required school and guardian consent. Configure backups, monitoring, retention, consent procedures and incident response before real student use.
