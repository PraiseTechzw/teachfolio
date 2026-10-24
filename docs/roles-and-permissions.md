# Roles and permissions

Roles are stored as institution-scoped rows in `access_assignments`. The server checks authentication, account state, assignment status, role, tenant, ownership, and (for reviewers) placement assignment. Hiding a button in the UI is not an authorization check.

## Role matrix

| Capability | Student teacher | Supervisor | Lecturer | Coordinator | Institution admin | Platform admin |
| --- | --- | --- | --- | --- | --- | --- |
| Read own profile, settings, notifications | Yes | Yes | Yes | Yes | Yes | Yes |
| Create/edit own portfolio drafts | Yes | No | No | No | No | No |
| Submit and revise own work | Yes | No | No | No | No | No |
| Review submissions | No | Assigned students only | Assigned students only | No | No, unless separately assigned reviewer in the same institution | No |
| Manage placements and reviewer links | No | No | No | Yes, institution scope | Yes, institution scope | Platform operations |
| View/update portfolio requirements | Own progress | No | No | Yes, institution scope | Yes, institution scope | Platform-wide institution setup |
| Invite institution members | No | No | No | No | Yes, own institution | Institution-admin bootstrap invitations only |
| Activate/suspend institution assignments | No | No | No | No | Yes, own institution; last-admin protection applies | Platform-level user suspend/reactivate |
| Manage user roles | No | No | No | No | Limited to institution invitation/assignment workflows | Institution-scoped role assignment/change; platform role protected |
| Manage institutions | No | No | No | No | No | Yes: create/edit, pause/restore, archive |
| Platform user directory, export, recovery, deletion | No | No | No | No | No | Yes |
| Platform settings (invite expiry, upload cap) | No | No | No | No | No | Yes |
| Audit records | Own related activity where shown | Workflow context | Workflow context | No general admin audit | Institution scope | Platform scope and CSV export |

### Student teacher

Can create and manage their own portfolio entries, evidence metadata, drafts, submissions, and permitted revisions. A student cannot review, change account roles, activate other people, or access another user's private portfolio by changing an ID.

### Supervisor and lecturer

These roles share the review workflow. Queue membership comes from placement records where the account is assigned as supervisor or lecturer. They can start review and submit a decision/comments/rubric only for assigned students and an allowed submission version. Self-review is blocked. They do not receive coordinator/admin authority by virtue of being a reviewer.

### Coordinator

Can manage institution placements and requirements and use supported institution reports/exports. Coordinator access remains tenant-scoped; it does not include user activation, institution settings, or platform administration.

### Institution admin

Can administer their institution's invitation and onboarding, placement, requirement, user assignment status, and audit workflows. The server refuses cross-institution IDs and platform-admin changes. Inviting a role is not the same as assigning an arbitrary global permission. Platform-suspended/unverified accounts cannot be reactivated by an institution administrator. The last active institution administrator must not be suspended or demoted without another active institution admin.

### Platform admin

Has null-institution platform scope and can manage institution records, users across the platform, role assignments within institutions, platform configuration, and platform audit. The dashboard protects `platform_admin` assignments: add/remove those only through the trusted operator provisioning process. The platform invitation route can bootstrap only an institution admin, not any other role.

## Account state rules

| State | Meaning | Access |
| --- | --- | --- |
| Unverified | Supabase email confirmation is incomplete | Denied |
| Pending | No active application assignment yet, or assignment is pending | Denied |
| Active | Verified, enabled user with at least one active valid assignment | Allowed within one institution or platform scope |
| Suspended | User disabled or assignments suspended | Denied |
| Deletion pending | Profile anonymized and identity deletion did not finish | Denied; retry deletion through authorized process |
| Deleted | Auth identity removed; app row is retained as a tombstone for references/audit | Denied |

An account must not have active assignments across more than one institution in the current session model. Platform access must consist solely of active platform-admin assignments with `institutionId = null`.

## Role changes and audit

Role-changing APIs require a reason for platform-admin actions and write an audit record with actor, target, action, and detail. Institution-side membership operations are also tenant-checked and audited. User management never shows a stored password. Recovery sends the provider's reset/confirmation flow rather than setting a shared known password.

## Current limitations

- There is no per-user custom permission editor; permissions inherit from roles.
- The dashboard does not show provider failed-login events or revoke every external auth session.
- Role names describe application permissions, not institutional job titles or accreditation.
