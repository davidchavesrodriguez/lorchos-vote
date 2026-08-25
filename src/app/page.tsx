import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.identity}>GB Lorchos</p>
        <h1 className={styles.title}>Votacións claras e accesibles</h1>
        <p id='comprobacion' className={styles.text}>
          Base visual preparada para construír unha experiencia de voto sinxela e
          comprensible.
        </p>
        <a className={styles.link} href='#comprobacion'>
          Comprobar o foco do enlace
        </a>
      </div>
    </main>
  );
}
