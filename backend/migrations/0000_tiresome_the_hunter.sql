CREATE TABLE `FinancialRecord` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`phaseId` integer,
	`amountPaid` real DEFAULT 0 NOT NULL,
	`receiptMediaUrl` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phaseId`) REFERENCES `Phase`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `FinancialRecord_projectId_idx` ON `FinancialRecord` (`projectId`);--> statement-breakpoint
CREATE INDEX `FinancialRecord_phaseId_idx` ON `FinancialRecord` (`phaseId`);--> statement-breakpoint
CREATE TABLE `PhaseAssignment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`subPhaseId` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subPhaseId`) REFERENCES `SubPhase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `PhaseAssignment_userId_subPhaseId_key` ON `PhaseAssignment` (`userId`,`subPhaseId`);--> statement-breakpoint
CREATE INDEX `PhaseAssignment_subPhaseId_idx` ON `PhaseAssignment` (`subPhaseId`);--> statement-breakpoint
CREATE TABLE `Phase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unitId` integer NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`order` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Phase_unitId_idx` ON `Phase` (`unitId`);--> statement-breakpoint
CREATE TABLE `ProjectParticipant` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`userId` integer NOT NULL,
	`trade` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ProjectParticipant_projectId_trade_key` ON `ProjectParticipant` (`projectId`,`trade`);--> statement-breakpoint
CREATE INDEX `ProjectParticipant_userId_idx` ON `ProjectParticipant` (`userId`);--> statement-breakpoint
CREATE TABLE `Project` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`overallStatus` text DEFAULT 'NOT_STARTED' NOT NULL,
	`owners` text,
	`totalBudget` real,
	`currentStage` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`entrepreneurId` integer NOT NULL,
	FOREIGN KEY (`entrepreneurId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `Project_entrepreneurId_idx` ON `Project` (`entrepreneurId`);--> statement-breakpoint
CREATE TABLE `SubPhase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phaseId` integer NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`phaseId`) REFERENCES `Phase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `SubPhase_phaseId_idx` ON `SubPhase` (`phaseId`);--> statement-breakpoint
CREATE TABLE `Unit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`identifier` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Unit_projectId_idx` ON `Unit` (`projectId`);--> statement-breakpoint
CREATE TABLE `Update` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subPhaseId` integer,
	`projectId` integer,
	`userId` integer NOT NULL,
	`subject` text,
	`description` text,
	`mediaUrl` text,
	`mediaType` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`subPhaseId`) REFERENCES `SubPhase`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Update_subPhaseId_idx` ON `Update` (`subPhaseId`);--> statement-breakpoint
CREATE INDEX `Update_projectId_idx` ON `Update` (`projectId`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`role` text NOT NULL,
	`trade` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdById` integer,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_key` ON `User` (`email`);--> statement-breakpoint
CREATE INDEX `User_createdById_idx` ON `User` (`createdById`);