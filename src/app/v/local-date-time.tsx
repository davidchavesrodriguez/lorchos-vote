import { formatClubDateTime } from '@/lib/club-time';

type LocalDateTimeProps = {
  value: string;
};

export function LocalDateTime({ value }: LocalDateTimeProps) {
  const formattedValue = formatClubDateTime(value);

  return (
    <time dateTime={value}>
      {formattedValue ?? 'Data non dispoñible'}
    </time>
  );
}
