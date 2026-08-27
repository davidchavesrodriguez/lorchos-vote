# Base de datos de produción

## Local

- `DATABASE_URL` apunta a PostgreSQL local en `localhost:5432/lorchos_vote`.
- `DATABASE_MIGRATION_URL` apunta á mesma base local en `localhost:5432`, pero
  identifica explicitamente as tarefas administrativas.
- `TEST_DATABASE_URL` apunta a `postgres-test` en
  `localhost:5433/lorchos_vote_test`.

## Produción

- `DATABASE_URL` é a conexión pooled de Neon e inclúe `sslmode=require`.
- `DATABASE_MIGRATION_URL` é a conexión directa de Neon e inclúe
  `sslmode=require`.

O cliente runtime é un singleton a nivel de módulo, polo que unha instancia warm
de Vercel reutilízao. Usa `max: 1` en lugar do valor predeterminado 10 de
postgres-js, `idle_timeout: 20`, `connect_timeout: 10` e `prepare: false`. A carga
é pequena, as transaccións son curtas e o endpoint pooled xa xestiona as
conexións mediante PgBouncer. Desactívanse os prepared statements para manter
compatibilidade co transaction pooling. Non hai retries automáticos arredor de
votos ou transaccións: os erros propáganse para que a operación non se repita sen
analizar a súa semántica.

## Regras operativas

- Nunca se commitean URLs reais nin segredos.
- O runtime non executa migracións automaticamente e o deployment tampouco as
  aplica implicitamente.
- Primeiro execútase `npm run db:migrate` de forma explícita e controlada con
  `DATABASE_MIGRATION_URL`; despois faise o deploy.
- `db:migrate` non acepta `DATABASE_URL` nin `TEST_DATABASE_URL` como fallback e
  aplica unicamente as migracións versionadas de `drizzle/`.
- `db:generate` só xera migracións; non as aplica.
- Os futuros `pg_dump` e `pg_restore` usarán a conexión directa de
  `DATABASE_MIGRATION_URL`. O procedemento de backup e restauración definirase
  por separado.
- `TEST_DATABASE_URL` é só para tests, debe conservar o sufixo `_test` e nunca
  pode apuntar a produción.
- As conexións remotas deben esixir TLS. Non se gardan certificados do provedor
  no repositorio.
