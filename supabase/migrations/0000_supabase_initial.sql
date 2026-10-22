CREATE TABLE "access_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"institutionId" integer,
	"role" "access_role" NOT NULL,
	"status" "assignment_status" DEFAULT 'pending' NOT NULL,
	"assignedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer,
	"actorUserId" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"targetType" varchar(80) NOT NULL,
	"targetId" varchar(80) NOT NULL,
	"detail" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"entryId" integer NOT NULL,
	"uploaderUserId" integer NOT NULL,
	"objectKey" varchar(500) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"mimeType" varchar(120) NOT NULL,
	"byteSize" integer NOT NULL,
	"consentConfirmed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_files_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(220) NOT NULL,
	"code" varchar(40) NOT NULL,
	"isDemo" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" "invite_role" NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"acceptedAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"message" varchar(500) NOT NULL,
	"href" varchar(250) NOT NULL,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"studentUserId" integer NOT NULL,
	"schoolName" varchar(220) NOT NULL,
	"schoolLocation" varchar(220) NOT NULL,
	"programme" varchar(180) NOT NULL,
	"cohort" varchar(100) NOT NULL,
	"studentNumber" varchar(80) NOT NULL,
	"subject" varchar(140) NOT NULL,
	"classes" jsonb NOT NULL,
	"startDate" varchar(10) NOT NULL,
	"endDate" varchar(10) NOT NULL,
	"supervisorUserId" integer,
	"lecturerUserId" integer,
	"status" "placement_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"title" varchar(220) NOT NULL,
	"subject" varchar(140) DEFAULT '' NOT NULL,
	"className" varchar(100) DEFAULT '' NOT NULL,
	"lessonDate" varchar(10) DEFAULT '' NOT NULL,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"category" "requirement_category" NOT NULL,
	"label" varchar(180) NOT NULL,
	"requiredCount" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"deadline" varchar(10),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"entryId" integer NOT NULL,
	"submissionVersion" integer NOT NULL,
	"reviewerUserId" integer NOT NULL,
	"decision" "review_decision" NOT NULL,
	"comments" text NOT NULL,
	"rubric" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"institutionId" integer NOT NULL,
	"entryId" integer NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" varchar(40) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "legacy_user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_assignedBy_users_id_fk" FOREIGN KEY ("assignedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_entryId_portfolio_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."portfolio_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_uploaderUserId_users_id_fk" FOREIGN KEY ("uploaderUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_studentUserId_users_id_fk" FOREIGN KEY ("studentUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_supervisorUserId_users_id_fk" FOREIGN KEY ("supervisorUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_lecturerUserId_users_id_fk" FOREIGN KEY ("lecturerUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_requirements" ADD CONSTRAINT "portfolio_requirements_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_entryId_portfolio_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."portfolio_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerUserId_users_id_fk" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_institutionId_institutions_id_fk" FOREIGN KEY ("institutionId") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_entryId_portfolio_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."portfolio_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_user_idx" ON "access_assignments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "access_tenant_idx" ON "access_assignments" USING btree ("institutionId");--> statement-breakpoint
CREATE UNIQUE INDEX "access_assignment_unique" ON "access_assignments" USING btree ("userId","institutionId","role");--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit_logs" USING btree ("institutionId");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actorUserId");--> statement-breakpoint
CREATE INDEX "evidence_entry_idx" ON "evidence_files" USING btree ("entryId","institutionId");--> statement-breakpoint
CREATE INDEX "evidence_uploader_idx" ON "evidence_files" USING btree ("uploaderUserId");--> statement-breakpoint
CREATE INDEX "invite_tenant_idx" ON "invitations" USING btree ("institutionId");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notifications" USING btree ("userId","institutionId");--> statement-breakpoint
CREATE INDEX "placement_tenant_idx" ON "placements" USING btree ("institutionId");--> statement-breakpoint
CREATE INDEX "placement_student_idx" ON "placements" USING btree ("studentUserId");--> statement-breakpoint
CREATE INDEX "placement_supervisor_idx" ON "placements" USING btree ("supervisorUserId");--> statement-breakpoint
CREATE INDEX "entry_owner_idx" ON "portfolio_entries" USING btree ("userId","institutionId");--> statement-breakpoint
CREATE INDEX "entry_status_idx" ON "portfolio_entries" USING btree ("institutionId","status");--> statement-breakpoint
CREATE INDEX "entry_category_idx" ON "portfolio_entries" USING btree ("institutionId","kind");--> statement-breakpoint
CREATE INDEX "requirement_tenant_idx" ON "portfolio_requirements" USING btree ("institutionId");--> statement-breakpoint
CREATE INDEX "review_entry_idx" ON "reviews" USING btree ("entryId");--> statement-breakpoint
CREATE INDEX "review_tenant_idx" ON "reviews" USING btree ("institutionId");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_entry_version_unique" ON "submission_versions" USING btree ("entryId","version");--> statement-breakpoint
CREATE INDEX "submission_tenant_idx" ON "submission_versions" USING btree ("institutionId");