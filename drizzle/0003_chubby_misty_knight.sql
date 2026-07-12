CREATE TABLE `email_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`host` text,
	`port` integer,
	`username` text,
	`credential_ref` text,
	`region` text,
	`updated_at` integer NOT NULL
);
