CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`detail` text,
	`ip_address` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ip_whitelist` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`ip_address` text NOT NULL,
	`label` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `proxy_allocations` ADD `note` text;--> statement-breakpoint
ALTER TABLE `proxy_allocations` ADD `auto_renew` integer DEFAULT false NOT NULL;