'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import styles from '../admin.module.css';

type LoginButtonProps = {
  hasAuthenticationError: boolean;
};

export function LoginButton({
  hasAuthenticationError,
}: LoginButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [hasClientError, setHasClientError] = useState(false);
  const showError = hasAuthenticationError || hasClientError;

  async function signInWithGoogle() {
    setIsPending(true);
    setHasClientError(false);

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/admin',
        errorCallbackURL: '/admin/login',
      });

      if (result.error) {
        setHasClientError(true);
        setIsPending(false);
      }
    } catch {
      setHasClientError(true);
      setIsPending(false);
    }
  }

  return (
    <div className={styles.actions}>
      {showError ? (
        <p className={styles.error} role='alert'>
          Non foi posible iniciar sesión. Comproba que empregas unha conta
          autorizada e téntao de novo.
        </p>
      ) : null}
      <button
        className={styles.primaryButton}
        type='button'
        disabled={isPending}
        aria-busy={isPending}
        onClick={signInWithGoogle}
      >
        {isPending ? 'Conectando con Google…' : 'Continuar con Google'}
      </button>
    </div>
  );
}
