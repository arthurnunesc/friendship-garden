import { randomUUID } from 'node:crypto'
import type { Pool } from '../authMigration.js'

export interface EmailReminderPreference {
  email: string
  timeZone: string
  revision: string
}

export function createEmailReminderStore(pool: Pool) {
  async function query<Row>(sql: string, values: readonly unknown[]) {
    const client = await pool.connect()
    try {
      return (await client.query<Row>(sql, values)).rows[0]
    } finally {
      client.release()
    }
  }

  return {
    async read(userId: string): Promise<EmailReminderPreference | null> {
      return (await query<EmailReminderPreference>(`
        SELECT p.email, p.time_zone AS "timeZone", p.revision
        FROM public.email_reminder_preferences p JOIN public."user" u ON u.id = p.user_id
        WHERE p.user_id = $1 AND u."emailVerified" AND u.email = p.email
      `, [userId])) ?? null
    },

    async enable(userId: string, expectedEmail: string, timeZone: string): Promise<boolean> {
      if (!timeZone || /^[+-]/.test(timeZone)) throw new Error('Invalid reminder time zone.')
      const canonicalZone = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone
      return Boolean(await query(`
        INSERT INTO public.email_reminder_preferences AS p (user_id, email, time_zone, revision)
        SELECT id, email, $3, $4 FROM public."user"
        WHERE id = $1 AND email = $2 AND "emailVerified"
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email, time_zone = EXCLUDED.time_zone,
          revision = CASE WHEN (p.email, p.time_zone) = (EXCLUDED.email, EXCLUDED.time_zone)
            THEN p.revision ELSE EXCLUDED.revision END
        RETURNING user_id
      `, [userId, expectedEmail, canonicalZone, randomUUID()]))
    },

    async disable(userId: string): Promise<void> {
      await query(`DELETE FROM public.email_reminder_preferences WHERE user_id = $1`, [userId])
    },

    async claim(userId: string, localDay: string, preference: EmailReminderPreference): Promise<string | null> {
      const token = randomUUID()
      // A single statement reserves the account/day under the current consent.
      // Retries are bounded to one hour, inside the provider's deduplication window.
      const claimed = await query(`
        INSERT INTO public.email_reminder_deliveries AS d
          (user_id, local_day, consent_revision, lease_token, lease_until, retry_until)
        SELECT p.user_id, $2::date, p.revision, $4,
          statement_timestamp() + interval '5 minutes', statement_timestamp() + interval '1 hour'
        FROM public.email_reminder_preferences p JOIN public."user" u ON u.id = p.user_id
        WHERE p.user_id = $1 AND p.revision = $3 AND p.email = $5
          AND u."emailVerified" AND u.email = p.email
          AND $2::date = (statement_timestamp() AT TIME ZONE p.time_zone)::date
        ON CONFLICT (user_id, local_day) DO UPDATE SET
          lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until
        WHERE d.accepted_at IS NULL AND d.consent_revision = EXCLUDED.consent_revision
          AND d.lease_until <= statement_timestamp() AND d.retry_until > statement_timestamp()
        RETURNING lease_token
      `, [userId, localDay, preference.revision, token, preference.email])
      return claimed ? token : null
    },

    async markAccepted(userId: string, localDay: string, token: string): Promise<boolean> {
      return Boolean(await query(`
        UPDATE public.email_reminder_deliveries SET accepted_at = statement_timestamp()
        WHERE user_id = $1 AND local_day = $2::date AND lease_token = $3 AND accepted_at IS NULL
        RETURNING user_id
      `, [userId, localDay, token]))
    },
  }
}
