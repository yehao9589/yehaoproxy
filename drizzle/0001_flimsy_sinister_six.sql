CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`supplier_id` text,
	`product` text NOT NULL,
	`country` text NOT NULL,
	`city` text,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text,
	`encrypted_password` text,
	`protocol` text NOT NULL,
	`cost` real,
	`sale_price` real NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`external_id` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`supported_currencies` text NOT NULL,
	`secret_ref` text,
	`webhook_secret_ref` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`gateway_id` text NOT NULL,
	`external_id` text,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_idempotency_key_unique` ON `payment_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`adapter` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`api_base_url` text,
	`credential_ref` text,
	`health_status` text DEFAULT 'unknown' NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
