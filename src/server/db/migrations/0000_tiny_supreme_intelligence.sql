CREATE TYPE "public"."discourse_scope" AS ENUM('node', 'thread', 'cohort');--> statement-breakpoint
CREATE TYPE "public"."core_domain" AS ENUM('counseling', 'clinical', 'shared');--> statement-breakpoint
CREATE TYPE "public"."core_level" AS ENUM('top_hub', 'mid_hub', 'concept');--> statement-breakpoint
CREATE TYPE "public"."mirror_mode" AS ENUM('visible', 'hidden', 'toggle');--> statement-breakpoint
CREATE TYPE "public"."learning_path_kind" AS ENUM('student_free', 'student_assigned', 'expert_reference', 'seeded_template');--> statement-breakpoint
CREATE TYPE "public"."core_relation" AS ENUM('contains', 'related_to', 'prerequisite_of', 'example_of', 'contrasts_with', 'bridges_to');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'instructor', 'expert', 'researcher');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alignment_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"snapshot_id" text,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cohorts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mirror_mode" "mirror_mode" DEFAULT 'hidden' NOT NULL,
	"reference_path_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"relation" "core_relation" NOT NULL,
	"confidence" double precision,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" "core_domain" NOT NULL,
	"level" "core_level" NOT NULL,
	"label_ko" text NOT NULL,
	"label_en" text,
	"description" text,
	"description_en" text,
	"parent_hub_id" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "core_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discourse_networks" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" "discourse_scope" NOT NULL,
	"scope_ref" text NOT NULL,
	"bipartite_json" jsonb NOT NULL,
	"tokenizer" text DEFAULT 'konlpy_okt' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"session_id" text,
	"cohort_id" text,
	"kind" text NOT NULL,
	"payload_json" jsonb,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"title_en" text,
	"node_sequence_json" jsonb NOT NULL,
	"kind" "learning_path_kind" NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "user_role" NOT NULL,
	"display_name" text NOT NULL,
	"cohort_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alignment_user_idx" ON "alignment_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alignment_metric_idx" ON "alignment_scores" USING btree ("metric");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_edges_src_idx" ON "core_edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_edges_tgt_idx" ON "core_edges" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_edges_rel_idx" ON "core_edges" USING btree ("relation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_nodes_domain_idx" ON "core_nodes" USING btree ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_nodes_level_idx" ON "core_nodes" USING btree ("level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "core_nodes_parent_idx" ON "core_nodes" USING btree ("parent_hub_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discourse_scope_idx" ON "discourse_networks" USING btree ("scope","scope_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_log_user_idx" ON "event_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_log_session_idx" ON "event_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_log_kind_idx" ON "event_log" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_log_ts_idx" ON "event_log" USING btree ("ts");