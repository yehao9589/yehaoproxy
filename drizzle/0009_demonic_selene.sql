CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`order_id` text NOT NULL,
	`discount` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_order_id_unique` ON `coupon_redemptions` (`order_id`);