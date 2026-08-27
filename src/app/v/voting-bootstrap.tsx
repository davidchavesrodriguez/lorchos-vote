'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './vote.module.css';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

type BootstrapStatus = 'checking' | 'missing' | 'invalid' | 'unavailable';

const STATUS_MESSAGES: Record<BootstrapStatus, string> = {
  checking: 'Preparando a ligazón de voto…',
  missing: 'Abre a ligazón de voto que recibiches.',
  invalid: 'Esta ligazón non é válida.',
  unavailable:
    'A votación non está dispoñible neste momento. Téntao de novo máis tarde.',
};

export function VotingBootstrap() {
  const [status, setStatus] = useState<BootstrapStatus>('checking');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    let token = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';

    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname,
    );

    if (!token) {
      queueMicrotask(() => setStatus('missing'));
      return;
    }

    if (!TOKEN_PATTERN.test(token)) {
      token = '';
      queueMicrotask(() => setStatus('invalid'));
      return;
    }

    async function exchangeToken() {
      let requestBody = JSON.stringify({ token });
      token = '';

      try {
        const pendingResponse = fetch('/api/voting/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          credentials: 'same-origin',
          cache: 'no-store',
        });
        requestBody = '';
        const response = await pendingResponse;
        const result = (await response.json()) as {
          status?: unknown;
          sessionId?: unknown;
        };

        if (
          response.ok &&
          result.status === 'success' &&
          typeof result.sessionId === 'string' &&
          SESSION_ID_PATTERN.test(result.sessionId)
        ) {
          window.location.replace(`/v/papeleta/${result.sessionId}`);
          return;
        }

        setStatus(result.status === 'invalid' ? 'invalid' : 'unavailable');
      } catch {
        setStatus('unavailable');
      } finally {
        token = '';
        requestBody = '';
      }
    }

    void exchangeToken();
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.brand}>GB Lorchos · Votación</p>
        <section className={styles.status} aria-labelledby='status-title'>
          <h1 id='status-title' className={styles.title}>
            Estado da votación
          </h1>
          <p className={styles.statusMessage} role='status'>
            {STATUS_MESSAGES[status]}
          </p>
        </section>
      </div>
    </main>
  );
}
