CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"vault" text NOT NULL,
	"token_in" text NOT NULL,
	"token_out" text NOT NULL,
	"amount_in" text NOT NULL,
	"min_out" text,
	"nonce" integer,
	"status" text DEFAULT 'previewed' NOT NULL,
	"reason" text,
	"tx_hash" text,
	"amount_out" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "vault" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "vault_mandate_hash" text;--> statement-breakpoint
CREATE INDEX "actions_task_id_idx" ON "actions" USING btree ("task_id");