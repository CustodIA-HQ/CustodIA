CREATE TABLE "mandates" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"version" integer NOT NULL,
	"typed_data" jsonb NOT NULL,
	"signature" text,
	"hash" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"ttl_s" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text,
	"channel" text DEFAULT 'web' NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text,
	"kind" text NOT NULL,
	"tx_id" text NOT NULL,
	"amount" text,
	"network" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_wallet" text NOT NULL,
	"ens_name" text NOT NULL,
	"template" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"wallet" text PRIMARY KEY NOT NULL,
	"ens_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_task_version_idx" ON "mandates" USING btree ("task_id","version");