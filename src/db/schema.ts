import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const electionStatus = pgEnum("election_status", [
  "DRAFT",
  "READY",
  "OPEN",
  "CLOSED",
]);

export const votingCredentialStatus = pgEnum("voting_credential_status", [
  "ACTIVE",
  "USED",
  "REVOKED",
]);

export const elections = pgTable(
  "elections",
  {
    id: uuid().defaultRandom().primaryKey(),
    title: text().notNull(),
    groupLabel: text("group_label").notNull(),
    status: electionStatus().notNull(),
    numberOfWinners: integer("number_of_winners").notNull(),
    minSelections: integer("min_selections").notNull(),
    maxSelections: integer("max_selections").notNull(),
    allowSelfVote: boolean("allow_self_vote").notNull(),
    minimumTurnout: integer("minimum_turnout"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("elections_title_not_empty", sql`char_length(btrim(${table.title})) > 0`),
    check(
      "elections_group_label_not_empty",
      sql`char_length(btrim(${table.groupLabel})) > 0`,
    ),
    check("elections_number_of_winners_positive", sql`${table.numberOfWinners} > 0`),
    check("elections_min_selections_positive", sql`${table.minSelections} > 0`),
    check(
      "elections_max_selections_not_below_min",
      sql`${table.maxSelections} >= ${table.minSelections}`,
    ),
    check(
      "elections_minimum_turnout_positive",
      sql`${table.minimumTurnout} IS NULL OR ${table.minimumTurnout} > 0`,
    ),
  ],
);

export const electionParticipants = pgTable(
  "election_participants",
  {
    id: uuid().defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    canVote: boolean("can_vote").default(false).notNull(),
    canBeCandidate: boolean("can_be_candidate").default(false).notNull(),
    hasVoted: boolean("has_voted").default(false).notNull(),
  },
  (table) => [
    unique("election_participants_election_display_name_unique").on(
      table.electionId,
      table.displayName,
    ),
    unique("election_participants_id_election_id_unique").on(
      table.id,
      table.electionId,
    ),
    check(
      "election_participants_display_name_not_empty",
      sql`char_length(btrim(${table.displayName})) > 0`,
    ),
  ],
);

export const votingCredentials = pgTable(
  "voting_credentials",
  {
    id: uuid().defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => electionParticipants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    status: votingCredentialStatus().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "voting_credentials_token_hash_not_empty",
      sql`char_length(${table.tokenHash}) > 0`,
    ),
    check(
      "voting_credentials_revoked_at_matches_status",
      sql`(${table.status} = 'REVOKED' AND ${table.revokedAt} IS NOT NULL) OR (${table.status} IN ('ACTIVE', 'USED') AND ${table.revokedAt} IS NULL)`,
    ),
    uniqueIndex("voting_credentials_one_active_per_participant")
      .on(table.participantId)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

export const ballots = pgTable(
  "ballots",
  {
    id: uuid().defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("ballots_id_election_id_unique").on(table.id, table.electionId),
  ],
);

export const ballotChoices = pgTable(
  "ballot_choices",
  {
    ballotId: uuid("ballot_id").notNull(),
    electionId: uuid("election_id").notNull(),
    candidateParticipantId: uuid("candidate_participant_id").notNull(),
  },
  (table) => [
    unique("ballot_choices_ballot_candidate_unique").on(
      table.ballotId,
      table.candidateParticipantId,
    ),
    foreignKey({
      name: "ballot_choices_ballot_election_fk",
      columns: [table.ballotId, table.electionId],
      foreignColumns: [ballots.id, ballots.electionId],
    }).onDelete("cascade"),
    foreignKey({
      name: "ballot_choices_candidate_election_fk",
      columns: [table.candidateParticipantId, table.electionId],
      foreignColumns: [electionParticipants.id, electionParticipants.electionId],
    }).onDelete("no action"),
  ],
);
