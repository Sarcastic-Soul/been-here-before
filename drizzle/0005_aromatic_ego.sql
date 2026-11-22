CREATE TABLE "ledger_days" (
	"day" date PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"entries_hash" text NOT NULL,
	"prev_root" text,
	"root" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"day" date NOT NULL,
	"slug" text NOT NULL,
	"coin_id" integer NOT NULL,
	"verdict" text NOT NULL,
	"line" text NOT NULL,
	CONSTRAINT "ledger_entries_day_slug_pk" PRIMARY KEY("day","slug")
);
