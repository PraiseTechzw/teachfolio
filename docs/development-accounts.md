# Development institution and role accounts

This page explains the checked-in development account provisioner without publishing credentials.

## Current local setup

- Selected institution: **Seke Teachers’ College** (`SEKE-TC`).
- Seeded institution list: all 15 Zimbabwe teacher colleges in the Ministry directory, added to the configured development database by `--institutions-only`.
- Seeded accounts: one account for each institution role supported by the provisioner.
- Local login email/password pairs: stored in ignored [`development-access.local.md`](development-access.local.md). That local note is deliberately excluded from Git.
- The development accounts are confirmed Supabase Auth accounts with active application assignments for `SEKE-TC`.
- No platform administrator account is created by this seed. Bootstrap it with the trusted server-side procedure in [README](../README.md#access-bootstrap).

## Role-account email names

| Role | Development email |
| --- | --- |
| Student teacher | `student_teacher@teachfolio.com` |
| Supervisor | `supervisor@teachfolio.com` |
| Lecturer | `lecturer@teachfolio.com` |
| Coordinator | `coordinator@teachfolio.com` |
| Institution admin | `institution_admin@teachfolio.com` |

These role mailboxes are test identities. They are not official accounts or endorsements from Seke Teachers’ College or any other institution. The application does not create a real mailbox at `teachfolio.com` through this seed.

## Add institutions only

With `.env` pointing at the intended development Supabase project:

```sh
npx tsx scripts/seed-demo.ts --institutions-only
```

This idempotently upserts the provisioner's official institution names/codes and marks them active, not archived, and non-demo. It does not create Auth users or portfolio/placement data.

## Create/reconcile selected-institution role accounts

Set these values in the private local `.env` only:

```dotenv
TEACHFOLIO_SEED_INSTITUTION_CODE=SEKE-TC
TEACHFOLIO_SEED_PASSWORD=<development-only password>
TEACHFOLIO_ALLOW_SHARED_DEMO_PASSWORD=true
```

Then run:

```sh
NODE_ENV=development npx tsx scripts/seed-demo.ts --confirm-provision-accounts
```

If no `TEACHFOLIO_SEED_ACCOUNTS` JSON is supplied, the script creates the five role addresses above, confirms new Auth accounts, links them to the app's `users` records, and activates one assignment per role at the chosen institution. Existing Auth passwords are not reset by rerunning the seed. Existing assignments are reactivated. Use a different institution code to seed a different account set; do not give one account active assignments in multiple institutions because the current session model denies ambiguous tenant scope.

The local shared password is permitted only when `NODE_ENV` is not `production` and `TEACHFOLIO_ALLOW_SHARED_DEMO_PASSWORD=true`. Do not put it in tracked files, deploy settings, shared staging, screenshots, or production. Use unique passwords and the invitation/recovery flows outside isolated local development.

## All provisioned institution names/codes

The names come from the [Ministry teachers’ colleges directory](https://mhtestd.gov.zw/?p=5772); codes are internal application identifiers.

| Institution | Internal code |
| --- | --- |
| Bondolfi Teachers’ College | `BONDOLFI-TC` |
| Belvedere Technical Teachers’ College | `BELVEDERE-TTC` |
| Blended Education College of Southern Africa | `BECOSA` |
| Morgenster Teachers’ College | `MORGENSTER-TC` |
| Marymount Teachers’ College | `MARYMOUNT-TC` |
| Mkoba Teachers’ College | `MKOBA-TC` |
| Hillside Teachers’ College | `HILLSIDE-TC` |
| Madziwa Teachers’ College | `MADZIWA-TC` |
| Masvingo Teachers’ College | `MASVINGO-TC` |
| Morgan Zintec Teachers’ College | `MORGAN-ZINTEC-TC` |
| Mutare Teachers’ College | `MUTARE-TC` |
| Nyadire Teachers’ College | `NYADIRE-TC` |
| Seke Teachers’ College | `SEKE-TC` |
| Hwange Teachers’ College | `HWANGE-TC` |
| United College for Education | `UCE` |

## Account cleanup and safety

The seeder creates real Supabase Auth identities. It does not delete them when a local seed config changes. To remove a development account, disable/delete it through the platform user-management workflow or Supabase Auth Admin, then clean up its application assignment/profile according to the data-retention policy. Never run cleanup against production to remove test users by matching names or email patterns alone.
