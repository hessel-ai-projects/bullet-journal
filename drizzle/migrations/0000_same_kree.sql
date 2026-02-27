CREATE TABLE "allowed_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"icon" text DEFAULT '📋',
	"template" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"log_type" text NOT NULL,
	"collection_id" uuid,
	"date" date NOT NULL,
	"monthly_id" uuid,
	"task_uid" uuid NOT NULL,
	"tags" text[] DEFAULT '{}',
	"position" integer DEFAULT 0,
	"google_event_id" text,
	"source" text DEFAULT 'user',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"attendees" text[] DEFAULT '{}',
	"agenda" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"google_refresh_token" text,
	"settings" jsonb DEFAULT '{"theme":"dark","defaultView":"daily"}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_monthly_id_entries_id_fk" FOREIGN KEY ("monthly_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_collections_user" ON "collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_entries_user_date" ON "entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_entries_user_log_type" ON "entries" USING btree ("user_id","log_type");--> statement-breakpoint
CREATE INDEX "idx_entries_collection" ON "entries" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_entries_task_uid" ON "entries" USING btree ("task_uid");--> statement-breakpoint
CREATE INDEX "idx_entries_monthly_id" ON "entries" USING btree ("monthly_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_notes_collection" ON "meeting_notes" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_meeting_notes_user" ON "meeting_notes" USING btree ("user_id");