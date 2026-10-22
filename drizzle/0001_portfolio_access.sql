CREATE TABLE `access_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`institutionId` int,
	`role` enum('student_teacher','supervisor','lecturer','coordinator','institution_admin','platform_admin') NOT NULL,
	`status` enum('pending','active','suspended') NOT NULL DEFAULT 'pending',
	`assignedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_assignment_unique` UNIQUE(`userId`,`institutionId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int,
	`actorUserId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(80) NOT NULL,
	`targetId` varchar(80) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`entryId` int NOT NULL,
	`uploaderUserId` int NOT NULL,
	`objectKey` varchar(500) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`byteSize` int NOT NULL,
	`consentConfirmed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `evidence_files_objectKey_unique` UNIQUE(`objectKey`)
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(220) NOT NULL,
	`code` varchar(40) NOT NULL,
	`isDemo` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `institutions_id` PRIMARY KEY(`id`),
	CONSTRAINT `institutions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('student_teacher','supervisor','lecturer','coordinator','institution_admin') NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(50) NOT NULL,
	`message` varchar(500) NOT NULL,
	`href` varchar(250) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `placements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`schoolName` varchar(220) NOT NULL,
	`schoolLocation` varchar(220) NOT NULL,
	`programme` varchar(180) NOT NULL,
	`cohort` varchar(100) NOT NULL,
	`studentNumber` varchar(80) NOT NULL,
	`subject` varchar(140) NOT NULL,
	`classes` json NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`supervisorUserId` int,
	`lecturerUserId` int,
	`status` enum('active','completed','upcoming') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `placements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('scheme','lesson','reflection','evidence','observation','supporting_document','final_report') NOT NULL,
	`title` varchar(220) NOT NULL,
	`subject` varchar(140) NOT NULL DEFAULT '',
	`className` varchar(100) NOT NULL DEFAULT '',
	`lessonDate` varchar(10) NOT NULL DEFAULT '',
	`status` enum('draft','submitted','under_review','revision_required','resubmitted','approved','rejected','archived') NOT NULL DEFAULT 'draft',
	`version` int NOT NULL DEFAULT 1,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolio_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_requirements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`category` enum('scheme','lesson','reflection','evidence','observation','supporting_document','assessment','final_report') NOT NULL,
	`label` varchar(180) NOT NULL,
	`requiredCount` int NOT NULL DEFAULT 0,
	`required` boolean NOT NULL DEFAULT true,
	`deadline` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolio_requirements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`entryId` int NOT NULL,
	`submissionVersion` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`decision` enum('under_review','revision_required','approved','rejected') NOT NULL,
	`comments` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submission_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institutionId` int NOT NULL,
	`entryId` int NOT NULL,
	`version` int NOT NULL,
	`snapshot` json NOT NULL,
	`status` varchar(40) NOT NULL,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submission_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_entry_version_unique` UNIQUE(`entryId`,`version`)
);
--> statement-breakpoint
ALTER TABLE `access_assignments` ADD CONSTRAINT `access_assignments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_assignments` ADD CONSTRAINT `access_assignments_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_assignments` ADD CONSTRAINT `access_assignments_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_entryId_portfolio_entries_id_fk` FOREIGN KEY (`entryId`) REFERENCES `portfolio_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence_files` ADD CONSTRAINT `evidence_files_uploaderUserId_users_id_fk` FOREIGN KEY (`uploaderUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `placements` ADD CONSTRAINT `placements_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `placements` ADD CONSTRAINT `placements_studentUserId_users_id_fk` FOREIGN KEY (`studentUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `placements` ADD CONSTRAINT `placements_supervisorUserId_users_id_fk` FOREIGN KEY (`supervisorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `placements` ADD CONSTRAINT `placements_lecturerUserId_users_id_fk` FOREIGN KEY (`lecturerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_entries` ADD CONSTRAINT `portfolio_entries_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_entries` ADD CONSTRAINT `portfolio_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolio_requirements` ADD CONSTRAINT `portfolio_requirements_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_entryId_portfolio_entries_id_fk` FOREIGN KEY (`entryId`) REFERENCES `portfolio_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_reviewerUserId_users_id_fk` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_versions` ADD CONSTRAINT `submission_versions_institutionId_institutions_id_fk` FOREIGN KEY (`institutionId`) REFERENCES `institutions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission_versions` ADD CONSTRAINT `submission_versions_entryId_portfolio_entries_id_fk` FOREIGN KEY (`entryId`) REFERENCES `portfolio_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_user_idx` ON `access_assignments` (`userId`);--> statement-breakpoint
CREATE INDEX `access_tenant_idx` ON `access_assignments` (`institutionId`);--> statement-breakpoint
CREATE INDEX `audit_tenant_idx` ON `audit_logs` (`institutionId`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `evidence_entry_idx` ON `evidence_files` (`entryId`,`institutionId`);--> statement-breakpoint
CREATE INDEX `evidence_uploader_idx` ON `evidence_files` (`uploaderUserId`);--> statement-breakpoint
CREATE INDEX `invite_tenant_idx` ON `invitations` (`institutionId`);--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notifications` (`userId`,`institutionId`);--> statement-breakpoint
CREATE INDEX `placement_tenant_idx` ON `placements` (`institutionId`);--> statement-breakpoint
CREATE INDEX `placement_student_idx` ON `placements` (`studentUserId`);--> statement-breakpoint
CREATE INDEX `placement_supervisor_idx` ON `placements` (`supervisorUserId`);--> statement-breakpoint
CREATE INDEX `entry_owner_idx` ON `portfolio_entries` (`userId`,`institutionId`);--> statement-breakpoint
CREATE INDEX `entry_status_idx` ON `portfolio_entries` (`institutionId`,`status`);--> statement-breakpoint
CREATE INDEX `entry_category_idx` ON `portfolio_entries` (`institutionId`,`kind`);--> statement-breakpoint
CREATE INDEX `requirement_tenant_idx` ON `portfolio_requirements` (`institutionId`);--> statement-breakpoint
CREATE INDEX `review_entry_idx` ON `reviews` (`entryId`);--> statement-breakpoint
CREATE INDEX `review_tenant_idx` ON `reviews` (`institutionId`);--> statement-breakpoint
CREATE INDEX `submission_tenant_idx` ON `submission_versions` (`institutionId`);