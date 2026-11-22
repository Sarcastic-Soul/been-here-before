CREATE TABLE "calibration_points" (
	"horizon" smallint NOT NULL,
	"test_date" date NOT NULL,
	"bucket" text NOT NULL,
	"predicted" real NOT NULL,
	"realized" real NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "calibration_points_horizon_test_date_bucket_pk" PRIMARY KEY("horizon","test_date","bucket")
);
--> statement-breakpoint
CREATE TABLE "calibration_summary" (
	"horizon" smallint PRIMARY KEY NOT NULL,
	"brier" real NOT NULL,
	"brier_baseline" real NOT NULL,
	"n" integer NOT NULL,
	"example_json" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cmc_receipts" (
	"kind" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"request_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"http_status" smallint NOT NULL,
	"credit_count" integer,
	"body" jsonb
);
--> statement-breakpoint
CREATE TABLE "coin_weeks" (
	"lineage_id" integer NOT NULL,
	"week" date NOT NULL,
	"coin_id" integer NOT NULL,
	"rank_raw" smallint NOT NULL,
	"rank_adj" smallint NOT NULL,
	"price_usd" real NOT NULL,
	"market_cap_usd" real,
	"volume_24h_usd" real,
	"is_continuation" boolean NOT NULL,
	"running_peak_usd" real,
	"drawdown" real,
	"weeks_since_peak" smallint,
	"age_weeks" smallint,
	"ret_52w" real,
	"beat_btc_52w" boolean,
	"fell_out_52w" boolean,
	"ret_104w" real,
	"beat_btc_104w" boolean,
	"fell_out_104w" boolean,
	"reached_top20_104w" boolean,
	"outcome_complete_104w" boolean NOT NULL,
	CONSTRAINT "coin_weeks_lineage_id_week_pk" PRIMARY KEY("lineage_id","week")
);
--> statement-breakpoint
CREATE TABLE "coins" (
	"id" integer PRIMARY KEY NOT NULL,
	"lineage_id" integer NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"date_added" date,
	"is_token" boolean NOT NULL,
	"excluded_reason" text,
	"price_factor" double precision DEFAULT 1 NOT NULL,
	"first_week" date NOT NULL,
	"last_week" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"credits" integer,
	"http_status" smallint
);
--> statement-breakpoint
CREATE TABLE "current_state" (
	"coin_id" integer PRIMARY KEY NOT NULL,
	"lineage_id" integer NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"rank_raw" smallint NOT NULL,
	"rank_adj" smallint NOT NULL,
	"price_usd" double precision NOT NULL,
	"market_cap_usd" double precision,
	"volume_24h_usd" double precision,
	"running_peak_usd" double precision NOT NULL,
	"drawdown" real NOT NULL,
	"weeks_since_peak" smallint NOT NULL,
	"age_weeks" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_weeks" (
	"week" date PRIMARY KEY NOT NULL,
	"btc_price_usd" double precision NOT NULL,
	"total_market_cap_usd" double precision,
	"btc_dominance" real,
	"market_drawdown" real,
	"phase" text NOT NULL,
	"cycle" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "coin_weeks_match_idx" ON "coin_weeks" USING btree ("rank_adj","drawdown") WHERE "coin_weeks"."outcome_complete_104w";--> statement-breakpoint
CREATE INDEX "coins_slug_idx" ON "coins" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "coins_symbol_idx" ON "coins" USING btree (lower("symbol"));--> statement-breakpoint
CREATE INDEX "coins_lineage_idx" ON "coins" USING btree ("lineage_id");