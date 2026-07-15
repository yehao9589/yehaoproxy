ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'balance' NOT NULL;
ALTER TABLE `orders` ADD `expires_at` integer;
ALTER TABLE `orders` ADD `renewal_amount` real;
ALTER TABLE `orders` ADD `auto_renew` integer DEFAULT false NOT NULL;
ALTER TABLE `orders` ADD `admin_note` text;
