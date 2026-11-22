CREATE TABLE "lineage_peaks" (
	"lineage_id" integer PRIMARY KEY NOT NULL,
	"running_peak_usd" double precision NOT NULL,
	"peak_at" timestamp with time zone NOT NULL,
	"born_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
