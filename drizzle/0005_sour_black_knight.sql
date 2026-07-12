ALTER TABLE `inventory` ADD `fingerprint` text NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `reserved_by_order_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_fingerprint_unique` ON `inventory` (`fingerprint`);