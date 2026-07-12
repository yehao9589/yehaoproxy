CREATE TABLE `service_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`allocation_id` text NOT NULL,
	`type` text NOT NULL,
	`duration_days` integer,
	`reason` text,
	`amount` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
