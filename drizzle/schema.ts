import {
  boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp,
  uniqueIndex, varchar,
} from "drizzle-orm/pg-core";
import type { ReviewRubricSnapshot } from "../shared/review-rubric";

const legacyUserRole = pgEnum("legacy_user_role", ["user", "admin"]);
const accessRole = pgEnum("access_role", ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin", "platform_admin"]);
const assignmentStatus = pgEnum("assignment_status", ["pending", "active", "suspended"]);
const inviteRole = pgEnum("invite_role", ["student_teacher", "supervisor", "lecturer", "coordinator", "institution_admin"]);
const placementStatus = pgEnum("placement_status", ["active", "completed", "upcoming"]);
const entryKind = pgEnum("entry_kind", ["scheme", "lesson", "reflection", "evidence", "observation", "supporting_document", "final_report"]);
const requirementCategory = pgEnum("requirement_category", ["scheme", "lesson", "reflection", "evidence", "observation", "supporting_document", "assessment", "final_report"]);
const entryStatus = pgEnum("entry_status", ["draft", "submitted", "under_review", "revision_required", "resubmitted", "approved", "rejected", "archived"]);
const reviewDecision = pgEnum("review_decision", ["under_review", "revision_required", "approved", "rejected"]);

const createdAt = () => timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull().$onUpdate(() => new Date());

/** Supabase Auth identity; application access and roles live in accessAssignments. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  disabled: boolean("disabled").default(false).notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: legacyUserRole("role").default("user").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}).enableRLS();

export const institutions = pgTable("institutions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 220 }).notNull(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  isDemo: boolean("isDemo").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const accessAssignments = pgTable("access_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  institutionId: integer("institutionId").references(() => institutions.id),
  role: accessRole("role").notNull(),
  status: assignmentStatus("status").default("pending").notNull(),
  assignedBy: integer("assignedBy").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({ userIdx: index("access_user_idx").on(table.userId), tenantIdx: index("access_tenant_idx").on(table.institutionId), uniqueAssignment: uniqueIndex("access_assignment_unique").on(table.userId, table.institutionId, table.role) })).enableRLS();

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  email: varchar("email", { length: 320 }).notNull(),
  role: inviteRole("role").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true, mode: "date" }),
  createdBy: integer("createdBy").notNull().references(() => users.id),
  createdAt: createdAt(),
}, table => ({ tenantIdx: index("invite_tenant_idx").on(table.institutionId) })).enableRLS();

export const placements = pgTable("placements", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  studentUserId: integer("studentUserId").notNull().references(() => users.id),
  schoolName: varchar("schoolName", { length: 220 }).notNull(),
  schoolLocation: varchar("schoolLocation", { length: 220 }).notNull(),
  programme: varchar("programme", { length: 180 }).notNull(),
  cohort: varchar("cohort", { length: 100 }).notNull(),
  studentNumber: varchar("studentNumber", { length: 80 }).notNull(),
  subject: varchar("subject", { length: 140 }).notNull(),
  classes: jsonb("classes").$type<string[]>().notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  supervisorUserId: integer("supervisorUserId").references(() => users.id),
  lecturerUserId: integer("lecturerUserId").references(() => users.id),
  status: placementStatus("status").default("active").notNull(),
  createdAt: createdAt(),
}, table => ({ tenantIdx: index("placement_tenant_idx").on(table.institutionId), studentIdx: index("placement_student_idx").on(table.studentUserId), supervisorIdx: index("placement_supervisor_idx").on(table.supervisorUserId) })).enableRLS();

export const portfolioRequirements = pgTable("portfolio_requirements", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  category: requirementCategory("category").notNull(),
  label: varchar("label", { length: 180 }).notNull(),
  requiredCount: integer("requiredCount").default(0).notNull(),
  required: boolean("required").default(true).notNull(),
  deadline: varchar("deadline", { length: 10 }),
  createdAt: createdAt(),
}, table => ({ tenantIdx: index("requirement_tenant_idx").on(table.institutionId) })).enableRLS();

export const portfolioEntries = pgTable("portfolio_entries", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  userId: integer("userId").notNull().references(() => users.id),
  kind: entryKind("kind").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  subject: varchar("subject", { length: 140 }).default("").notNull(),
  className: varchar("className", { length: 100 }).default("").notNull(),
  lessonDate: varchar("lessonDate", { length: 10 }).default("").notNull(),
  status: entryStatus("status").default("draft").notNull(),
  version: integer("version").default(1).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => ({ ownerIdx: index("entry_owner_idx").on(table.userId, table.institutionId), statusIdx: index("entry_status_idx").on(table.institutionId, table.status), categoryIdx: index("entry_category_idx").on(table.institutionId, table.kind) })).enableRLS();

export const submissionVersions = pgTable("submission_versions", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  entryId: integer("entryId").notNull().references(() => portfolioEntries.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 40 }).notNull(),
  submittedAt: timestamp("submittedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => ({ entryVersionUnique: uniqueIndex("submission_entry_version_unique").on(table.entryId, table.version), tenantIdx: index("submission_tenant_idx").on(table.institutionId) })).enableRLS();

export const evidenceFiles = pgTable("evidence_files", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  entryId: integer("entryId").notNull().references(() => portfolioEntries.id),
  uploaderUserId: integer("uploaderUserId").notNull().references(() => users.id),
  objectKey: varchar("objectKey", { length: 500 }).notNull().unique(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  byteSize: integer("byteSize").notNull(),
  consentConfirmed: boolean("consentConfirmed").default(false).notNull(),
  createdAt: createdAt(),
}, table => ({ entryIdx: index("evidence_entry_idx").on(table.entryId, table.institutionId), uploaderIdx: index("evidence_uploader_idx").on(table.uploaderUserId) })).enableRLS();

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  entryId: integer("entryId").notNull().references(() => portfolioEntries.id),
  submissionVersion: integer("submissionVersion").notNull(),
  reviewerUserId: integer("reviewerUserId").notNull().references(() => users.id),
  decision: reviewDecision("decision").notNull(),
  comments: text("comments").notNull(),
  rubric: jsonb("rubric").$type<ReviewRubricSnapshot>(),
  createdAt: createdAt(),
}, table => ({ entryIdx: index("review_entry_idx").on(table.entryId), tenantIdx: index("review_tenant_idx").on(table.institutionId) })).enableRLS();

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").notNull().references(() => institutions.id),
  userId: integer("userId").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  message: varchar("message", { length: 500 }).notNull(),
  href: varchar("href", { length: 250 }).notNull(),
  readAt: timestamp("readAt", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, table => ({ userIdx: index("notification_user_idx").on(table.userId, table.institutionId) })).enableRLS();

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  institutionId: integer("institutionId").references(() => institutions.id),
  actorUserId: integer("actorUserId").notNull().references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 80 }).notNull(),
  targetId: varchar("targetId", { length: 80 }).notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
}, table => ({ tenantIdx: index("audit_tenant_idx").on(table.institutionId), actorIdx: index("audit_actor_idx").on(table.actorUserId) })).enableRLS();

export const userPreferences = pgTable("user_preferences", {
  userId: integer("userId").primaryKey().references(() => users.id),
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  updatedAt: updatedAt(),
}).enableRLS();

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedBy: integer("updatedBy").references(() => users.id),
  updatedAt: updatedAt(),
}).enableRLS();

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AccessRole = (typeof accessAssignments.$inferSelect)["role"];
export type AccessAssignment = typeof accessAssignments.$inferSelect;
export type PortfolioEntry = typeof portfolioEntries.$inferSelect;
