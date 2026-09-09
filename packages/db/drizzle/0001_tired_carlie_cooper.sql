CREATE TABLE "cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"last_processed_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mandates_task_id_idx" ON "mandates" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "receipts_task_id_idx" ON "receipts" USING btree ("task_id");