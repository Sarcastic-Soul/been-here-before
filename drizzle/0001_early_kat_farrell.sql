ALTER TABLE "calibration_summary" ADD COLUMN "tested" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calibration_summary" ADD COLUMN "verdicts_json" jsonb;