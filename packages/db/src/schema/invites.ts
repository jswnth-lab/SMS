import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { membershipRoleEnum } from './enums';
import { schoolMemberships, schools } from './tenancy';

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    phoneNumber: text('phone_number').notNull(),
    email: text('email'),
    role: membershipRoleEnum('role').notNull(),
    invitedByMembershipId: uuid('invited_by_membership_id')
      .notNull()
      .references(() => schoolMemberships.id),
    // Only the SHA-256 hash is stored - the raw token is shown to the
    // inviting admin exactly once (at creation) and never persisted, the
    // same reasoning as a password reset token.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: unique('invites_token_hash_unique').on(table.tokenHash),
    schoolIdIdx: index('invites_school_id_idx').on(table.schoolId),
    invitedByMembershipIdIdx: index('invites_invited_by_membership_id_idx').on(
      table.invitedByMembershipId
    ),
  })
);
