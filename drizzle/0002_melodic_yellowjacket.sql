CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`purpose` text DEFAULT 'register' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
