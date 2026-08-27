export const CLUB_TIME_ZONE = 'Europe/Madrid';

const clubDateTimeFormatter = new Intl.DateTimeFormat('gl-ES', {
  timeZone: CLUB_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatClubDateTime(value: string | Date): string | null {
  const instant = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  const parts = new Map(
    clubDateTimeFormatter
      .formatToParts(instant)
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  const day = parts.get('day');
  const month = parts.get('month');
  const year = parts.get('year');
  const hour = parts.get('hour');
  const minute = parts.get('minute');

  if (!day || !month || !year || !hour || !minute) {
    return null;
  }

  return `${day}/${month}/${year} ás ${hour}:${minute} · hora de Galicia`;
}
