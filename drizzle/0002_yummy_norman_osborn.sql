CREATE TABLE `tutorials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`youtubeUrl` varchar(512) NOT NULL,
	`youtubeVideoId` varchar(32) NOT NULL,
	`displayOrder` int NOT NULL DEFAULT 0,
	`isPublished` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tutorials_id` PRIMARY KEY(`id`)
);
