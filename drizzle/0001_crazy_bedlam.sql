CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(120) NOT NULL,
	`department` varchar(80) NOT NULL,
	`date` varchar(20) NOT NULL,
	`status` enum('Present','Absent','Late','Leave','Half Day') NOT NULL DEFAULT 'Present',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`code` varchar(12) NOT NULL,
	`employeeCount` int NOT NULL DEFAULT 0,
	`head` varchar(120),
	`color` varchar(24) NOT NULL DEFAULT '#d9d2ff',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`initials` varchar(4) NOT NULL,
	`employeeId` varchar(32) NOT NULL,
	`phone` varchar(32),
	`email` varchar(320),
	`department` varchar(80) NOT NULL,
	`role` varchar(100) NOT NULL,
	`joiningDate` varchar(20) NOT NULL,
	`workingHours` varchar(80) NOT NULL,
	`status` enum('Active','On leave','Offline') NOT NULL DEFAULT 'Active',
	`notes` text,
	`avatarColor` varchar(24) NOT NULL DEFAULT '#f3c7a9',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_employeeId_unique` UNIQUE(`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(120) NOT NULL,
	`department` varchar(80) NOT NULL,
	`work` varchar(180) NOT NULL,
	`date` varchar(20) NOT NULL,
	`startTime` varchar(20) NOT NULL,
	`endTime` varchar(20) NOT NULL,
	`description` text,
	`status` enum('Pending','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`employeeName` varchar(120) NOT NULL,
	`department` varchar(80) NOT NULL,
	`createdDate` varchar(20) NOT NULL,
	`dueDate` varchar(20) NOT NULL,
	`priority` enum('Low','Medium','High') NOT NULL DEFAULT 'Medium',
	`status` enum('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
