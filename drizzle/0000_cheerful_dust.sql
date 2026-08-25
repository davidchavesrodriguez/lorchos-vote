CREATE TYPE "public"."election_status" AS ENUM('DRAFT', 'READY', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."voting_credential_status" AS ENUM('ACTIVE', 'USED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "ballot_choices" (
	"ballot_id" uuid NOT NULL,
	"election_id" uuid NOT NULL,
	"candidate_participant_id" uuid NOT NULL,
	CONSTRAINT "ballot_choices_ballot_candidate_unique" UNIQUE("ballot_id","candidate_participant_id")
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	CONSTRAINT "ballots_id_election_id_unique" UNIQUE("id","election_id")
);
--> statement-breakpoint
CREATE TABLE "election_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"election_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"can_vote" boolean DEFAULT false NOT NULL,
	"can_be_candidate" boolean DEFAULT false NOT NULL,
	"has_voted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "election_participants_election_display_name_unique" UNIQUE("election_id","display_name"),
	CONSTRAINT "election_participants_id_election_id_unique" UNIQUE("id","election_id"),
	CONSTRAINT "election_participants_display_name_not_empty" CHECK (char_length(btrim("election_participants"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"group_label" text NOT NULL,
	"status" "election_status" NOT NULL,
	"number_of_winners" integer NOT NULL,
	"min_selections" integer NOT NULL,
	"max_selections" integer NOT NULL,
	"allow_self_vote" boolean NOT NULL,
	"minimum_turnout" integer,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elections_title_not_empty" CHECK (char_length(btrim("elections"."title")) > 0),
	CONSTRAINT "elections_group_label_not_empty" CHECK (char_length(btrim("elections"."group_label")) > 0),
	CONSTRAINT "elections_number_of_winners_positive" CHECK ("elections"."number_of_winners" > 0),
	CONSTRAINT "elections_min_selections_positive" CHECK ("elections"."min_selections" > 0),
	CONSTRAINT "elections_max_selections_not_below_min" CHECK ("elections"."max_selections" >= "elections"."min_selections"),
	CONSTRAINT "elections_minimum_turnout_positive" CHECK ("elections"."minimum_turnout" IS NULL OR "elections"."minimum_turnout" > 0)
);
--> statement-breakpoint
CREATE TABLE "voting_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "voting_credential_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "voting_credentials_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "voting_credentials_token_hash_not_empty" CHECK (char_length("voting_credentials"."token_hash") > 0),
	CONSTRAINT "voting_credentials_revoked_at_matches_status" CHECK (("voting_credentials"."status" = 'REVOKED' AND "voting_credentials"."revoked_at" IS NOT NULL) OR ("voting_credentials"."status" IN ('ACTIVE', 'USED') AND "voting_credentials"."revoked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "ballot_choices" ADD CONSTRAINT "ballot_choices_ballot_election_fk" FOREIGN KEY ("ballot_id","election_id") REFERENCES "public"."ballots"("id","election_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballot_choices" ADD CONSTRAINT "ballot_choices_candidate_election_fk" FOREIGN KEY ("candidate_participant_id","election_id") REFERENCES "public"."election_participants"("id","election_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_participants" ADD CONSTRAINT "election_participants_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting_credentials" ADD CONSTRAINT "voting_credentials_participant_id_election_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."election_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voting_credentials_one_active_per_participant" ON "voting_credentials" USING btree ("participant_id") WHERE "voting_credentials"."status" = 'ACTIVE';