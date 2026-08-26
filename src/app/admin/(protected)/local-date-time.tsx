'use client';

import { useEffect, useRef } from 'react';

type LocalDateTimeProps = {
  value: string;
};

export function LocalDateTime({ value }: LocalDateTimeProps) {
  const timeRef = useRef<HTMLTimeElement>(null);

  useEffect(() => {
    const instant = new Date(value);

    if (!timeRef.current) {
      return;
    }

    if (Number.isNaN(instant.getTime())) {
      timeRef.current.textContent = 'Data non válida';
      return;
    }

    timeRef.current.textContent = new Intl.DateTimeFormat('gl-ES', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(instant);
  }, [value]);

  return (
    <time ref={timeRef} dateTime={value}>
      Cargando data e hora…
    </time>
  );
}
