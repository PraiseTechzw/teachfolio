# Teachfolio entity relationship diagram

The diagram reflects the PostgreSQL definitions in `drizzle/schema.ts`. `users` is the application's profile/link table; credentials live in Supabase Auth. `access_assignments` is the source of application roles.

```mermaid
erDiagram
  USERS ||--o{ ACCESS_ASSIGNMENTS : receives
  INSTITUTIONS ||--o{ ACCESS_ASSIGNMENTS : scopes
  USERS o|--o{ ACCESS_ASSIGNMENTS : assigns

  INSTITUTIONS ||--o{ INVITATIONS : issues
  USERS ||--o{ INVITATIONS : creates

  INSTITUTIONS ||--o{ PLACEMENTS : hosts
  USERS ||--o{ PLACEMENTS : student
  USERS o|--o{ PLACEMENTS : supervisor
  USERS o|--o{ PLACEMENTS : lecturer

  INSTITUTIONS ||--o{ PORTFOLIO_REQUIREMENTS : defines
  INSTITUTIONS ||--o{ PORTFOLIO_ENTRIES : contains
  USERS ||--o{ PORTFOLIO_ENTRIES : owns
  PORTFOLIO_ENTRIES ||--o{ SUBMISSION_VERSIONS : snapshots
  PORTFOLIO_ENTRIES ||--o{ EVIDENCE_FILES : attaches
  USERS ||--o{ EVIDENCE_FILES : uploads
  PORTFOLIO_ENTRIES ||--o{ REVIEWS : receives
  USERS ||--o{ REVIEWS : writes

  INSTITUTIONS ||--o{ NOTIFICATIONS : scopes
  USERS ||--o{ NOTIFICATIONS : receives
  INSTITUTIONS o|--o{ AUDIT_LOGS : scopes
  USERS ||--o{ AUDIT_LOGS : acts
  USERS ||--o| USER_PREFERENCES : configures
  USERS o|--o{ PLATFORM_SETTINGS : updates

  USERS {
    int id PK
    string openId UK "Supabase Auth user UUID"
    string name
    string email
    string phone
    bool emailVerified
    bool disabled
    bool deletionPending
    string loginMethod
    string legacyRole "Not authorization source"
    timestamp createdAt
    timestamp lastSignedIn
  }
  INSTITUTIONS {
    int id PK
    string name
    string code UK
    bool isDemo
    bool active
    bool archived
  }
  ACCESS_ASSIGNMENTS {
    int id PK
    int userId FK
    int institutionId FK "NULL only for platform scope"
    enum role
    enum status
    int assignedBy FK
  }
  INVITATIONS {
    int id PK
    int institutionId FK
    string email
    enum role
    string tokenHash UK
    timestamp expiresAt
    timestamp acceptedAt
    int createdBy FK
  }
  PLACEMENTS {
    int id PK
    int institutionId FK
    int studentUserId FK
    int supervisorUserId FK
    int lecturerUserId FK
    string schoolName
    string programme
    string cohort
    string studentNumber
    string subject
    json classes
    string startDate
    string endDate
    enum status
  }
  PORTFOLIO_REQUIREMENTS {
    int id PK
    int institutionId FK
    enum category
    string label
    int requiredCount
    bool required
    string deadline
  }
  PORTFOLIO_ENTRIES {
    int id PK
    int institutionId FK
    int userId FK
    enum kind
    string title
    string subject
    string className
    string lessonDate
    enum status
    int version
    json payload
  }
  SUBMISSION_VERSIONS {
    int id PK
    int institutionId FK
    int entryId FK
    int version
    json snapshot
    string status
    timestamp submittedAt
  }
  EVIDENCE_FILES {
    int id PK
    int institutionId FK
    int entryId FK
    int uploaderUserId FK
    string objectKey UK
    string fileName
    string mimeType
    int byteSize
    bool consentConfirmed
  }
  REVIEWS {
    int id PK
    int institutionId FK
    int entryId FK
    int submissionVersion "Pairs with entryId/version; no direct FK"
    int reviewerUserId FK
    enum decision
    string comments
    json rubric
  }
  NOTIFICATIONS {
    int id PK
    int institutionId FK
    int userId FK
    string type
    string message
    string href
    timestamp readAt
  }
  AUDIT_LOGS {
    int id PK
    int institutionId FK "Nullable for platform events"
    int actorUserId FK
    string action
    string targetType
    string targetId
    string detail
    timestamp createdAt
  }
  USER_PREFERENCES {
    int userId PK, FK
    bool emailNotifications
    timestamp updatedAt
  }
  PLATFORM_SETTINGS {
    string key PK
    json value
    int updatedBy FK
    timestamp updatedAt
  }
```

## Relationship and lifecycle notes

- A user may have multiple role assignments, but active institution access is accepted only when all active assignments are for one institution. A platform admin's active scope is platform-only and uses a null institution ID.
- An invitation's raw token is returned for delivery only when email delivery is unavailable; the database stores its SHA-256 hash. Redemption links the matching signed-in email to an active assignment and records an audit event.
- A portfolio entry is the editable current record. Every submission creates a `submission_versions` snapshot. A review identifies the corresponding `entryId` and `submissionVersion`; the schema does not declare a compound foreign key for that pair.
- Evidence metadata points to a private object key, not a public URL. The server authorizes the user before streaming the file from private storage.
- Account deletion retains the user row as an anonymized tombstone so academic and audit references remain intact.
- Platform-wide settings are key/value rows. Current keys include `invitation_expiry_days` and `max_evidence_mib`.
