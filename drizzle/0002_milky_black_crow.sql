ALTER TABLE "current_state" ADD COLUMN "peak_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "current_state" ADD COLUMN "born_at" timestamp with time zone;--> statement-breakpoint
UPDATE "current_state" SET "peak_at" = "as_of" - make_interval(weeks => "weeks_since_peak"), "born_at" = "as_of" - make_interval(weeks => "age_weeks") WHERE "peak_at" IS NULL;
