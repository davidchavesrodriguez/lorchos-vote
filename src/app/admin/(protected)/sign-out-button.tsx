'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import styles from '../admin.module.css';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function signOut() {
    setIsPending(true);
    setHasError(false);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setHasError(true);
        setIsPending(false);
        return;
      }

      router.replace('/admin/login');
      router.refresh();
    } catch {
      setHasError(true);
      setIsPending(false);
    }
  }

  return (
    <div className={styles.signOut}>
      {hasError ? (
        <p className={styles.error} role='alert'>
          Non foi posible pechar a sesión. Téntao de novo.
        </p>
      ) : null}
      <button
        className={styles.secondaryButton}
        type='button'
        disabled={isPending}
        aria-busy={isPending}
        onClick={signOut}
      >
        {isPending ? 'Pechando sesión…' : 'Pechar sesión'}
      </button>
    </div>
  );
}
