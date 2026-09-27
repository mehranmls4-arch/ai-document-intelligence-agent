CREATE TABLE `ai_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`summary` text NOT NULL,
	`key_observations_json` text NOT NULL,
	`anomalies_json` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_analyses_document_id_unique` ON `ai_analyses` (`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`original_filename` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size_bytes` integer NOT NULL,
	`storage_path` text NOT NULL,
	`document_type` text DEFAULT 'UNKNOWN' NOT NULL,
	`classification_confidence` real,
	`status` text DEFAULT 'UPLOADED' NOT NULL,
	`failure_reason` text,
	`extracted_text` text,
	`page_count` integer,
	`extraction_method` text,
	`extraction_confidence` real,
	`extracted_at` integer,
	`overall_confidence` real,
	`needs_review` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`vendor_name` text,
	`vendor_address` text,
	`invoice_number` text,
	`invoice_date` text,
	`due_date` text,
	`currency` text,
	`purchase_order_number` text,
	`subtotal` real,
	`tax` real,
	`discount` real,
	`total` real,
	`payment_terms` text,
	`field_confidence_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_document_id_unique` ON `invoices` (`document_id`);--> statement-breakpoint
CREATE TABLE `processing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`error_message` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`field_name` text,
	`original_value` text,
	`corrected_value` text,
	`action` text NOT NULL,
	`reviewer` text DEFAULT 'demo-reviewer' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `validation_results` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`rule` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
