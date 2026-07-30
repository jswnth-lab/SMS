CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"email" text,
	"role" "membership_role" NOT NULL,
	"invited_by_membership_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_membership_id_school_memberships_id_fk" FOREIGN KEY ("invited_by_membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_school_id_idx" ON "invites" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "invites_invited_by_membership_id_idx" ON "invites" USING btree ("invited_by_membership_id");
--> statement-breakpoint
-- invites carries school_id like every other tenant table (0005_row_level_security.sql),
-- so it gets the same tenant_isolation policy, added retroactively since this
-- table didn't exist yet when that migration ran.
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invites"
  USING (school_id = current_setting('app.school_id', true)::uuid)
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);