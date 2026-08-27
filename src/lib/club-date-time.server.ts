import 'server-only';

import { Temporal } from '@js-temporal/polyfill';

import { CLUB_TIME_ZONE } from '@/lib/club-time';

const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type ClubDateTimeParseResult =
  | { type: 'success'; instant: Date }
  | { type: 'invalidFormat' }
  | { type: 'invalidCivilTime' };

export function parseClubDateTime(
  value: string,
): ClubDateTimeParseResult {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);

  if (!match) {
    return { type: 'invalidFormat' };
  }

  const [, year, month, day, hour, minute] = match;

  try {
    const zonedDateTime = Temporal.ZonedDateTime.from(
      {
        timeZone: CLUB_TIME_ZONE,
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
      },
      {
        overflow: 'reject',
        disambiguation: 'reject',
      },
    );

    return {
      type: 'success',
      instant: new Date(zonedDateTime.epochMilliseconds),
    };
  } catch {
    return { type: 'invalidCivilTime' };
  }
}
