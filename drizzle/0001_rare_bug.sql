CREATE TABLE `licenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code` varchar(64) NOT NULL,
	`active` tinyint NOT NULL DEFAULT 0,
	`planCode` varchar(64) NOT NULL DEFAULT 'planejapro',
	`startDate` date,
	`expiresAt` date NOT NULL,
	`customerId` varchar(128),
	`paymentId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `licenses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `product_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'PlanejaPro SIAP',
	`priceCents` int NOT NULL DEFAULT 5990,
	`installmentCount` int NOT NULL DEFAULT 6,
	`currency` varchar(8) NOT NULL DEFAULT 'BRL',
	`description` text,
	`expiryDate` date NOT NULL,
	`asaasMode` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_settings_id` PRIMARY KEY(`id`)
);
