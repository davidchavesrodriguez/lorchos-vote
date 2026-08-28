# Lorchos Vote

Aplicación web de votacións para o uso interno de **GB Lorchos/Lorchas**. Permite preparar eleccións, xestionar o censo, distribuír credenciais individuais e recontar votos sen vincular as papeletas coas persoas votantes.

Produción: [https://vota.lorchos.gal](https://vota.lorchos.gal)

> **Preparando unha votación real? [Ir á Guía anual de operación](#guía-anual-de-operación).**

## Como funciona

1. Unha persoa administradora accede a `/admin` mediante Google OAuth. O correo debe estar en `ADMIN_EMAILS`.
2. Crea unha elección co seu título, grupo, prazas, rango de seleccións, autovoto e participación mínima.
3. Engade ou importa o censo da elección e indica quen pode votar e quen pode ser candidato ou candidata.
4. Prepara a elección e xera unha ligazón única para cada persoa con dereito a voto. A aplicación só conserva o hash do token.
5. Cada credencial permite un único voto. A papeleta garda a elección e as candidaturas escollidas, pero non referencia a persoa nin a súa credencial.
6. A data límite impide novos votos, pero o peche é manual. Os resultados só se mostran despois de pechar.

## Arquitectura

É unha única aplicación full-stack con Next.js (App Router), React e TypeScript. Usa PostgreSQL con Drizzle ORM; en produción a base está en Neon e a aplicación en Vercel. A administración autentícase con Google OAuth mediante Better Auth e unha lista explícita de correos autorizados.

O esquema principal está en `src/db/schema.ts`, as migracións en `drizzle/` e a aplicación en `src/app/`.

## Desenvolvemento local

### Requisitos

- Node.js e npm compatibles con `package.json` e `package-lock.json`.
- Docker con Docker Compose.
- Credenciais OAuth de Google para probar a administración.

### Preparación

En PowerShell:

```powershell
npm.cmd ci
docker compose up -d
Copy-Item .env.example .env.local
Copy-Item .env.example .env.test.local
```

Revisa ambos os ficheiros. `.env.local` úsase para a aplicación e as migracións; os tests cargan `.env.test.local`. O exemplo separa desenvolvemento (`localhost:5432`) de tests (`localhost:5433`). Nunca apuntes `TEST_DATABASE_URL` a produción.

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Validación

Cos dous servizos PostgreSQL de `compose.yaml` en execución:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

`npm.cmd run db:generate` xera unha migración tras cambiar o esquema, pero non a aplica. `npm.cmd run db:studio` abre Drizzle Studio.

## Variables de contorno

O repositorio só inclúe valores locais ou marcadores en `.env.example`. Nunca documentes valores reais nin segredos.

| Variable | Propósito |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL usada pola aplicación en runtime. |
| `DATABASE_MIGRATION_URL` | Conexión directa para migracións e tarefas administrativas. |
| `TEST_DATABASE_URL` | Base illada de tests; o seu nome debe rematar en `_test`. |
| `APP_URL` | Orixe pública e base para construír as ligazóns de voto. |
| `BETTER_AUTH_URL` | URL base de Better Auth. |
| `BETTER_AUTH_SECRET` | Segredo que protexe as sesións de Better Auth. |
| `VOTING_SESSION_SECRET` | Segredo independente para as sesións de voto. |
| `GOOGLE_CLIENT_ID` | Identificador do cliente OAuth de Google. |
| `GOOGLE_CLIENT_SECRET` | Segredo do cliente OAuth de Google. |
| `ADMIN_EMAILS` | Correos autorizados para administración, separados por comas. |

## Produción

- Vercel serve [vota.lorchos.gal](https://vota.lorchos.gal); a rama `main` desprega produción.
- Neon aloxa PostgreSQL.
- O runtime usa `DATABASE_URL`, coa conexión *pooled* de Neon.
- As migracións usan `DATABASE_MIGRATION_URL`, coa conexión directa de Neon, e execútanse explicitamente antes de despregar código que dependa delas.
- `DATABASE_MIGRATION_URL` e `TEST_DATABASE_URL` **non van en Vercel**.
- O despregamento non executa migracións automaticamente.

Consulta a [guía da base de datos de produción](docs/production-database.md) antes de cambiar conexións ou migrar.

## Guía anual de operación

> **RUNBOOK PARA UNHA VOTACIÓN REAL**
>
> Completa esta lista en orde. Non repartas ligazóns reais antes da proba ficticia e do backup previo.

### Antes da votación

- [ ] Confirmar que [https://vota.lorchos.gal](https://vota.lorchos.gal) responde.
- [ ] Probar o acceso a [https://vota.lorchos.gal/admin](https://vota.lorchos.gal/admin).
- [ ] Comprobar o estado de Vercel e Neon.
- [ ] Facer un backup de produción segundo o [runbook de backup e restauración](docs/database-backup-restore.md) e comprobar que o dump se pode listar.
- [ ] Crear a elección.
- [ ] Revisar título, grupo, número de prazas, seleccións mínimas e máximas, autovoto, participación mínima (quórum) e data límite.
- [ ] Cargar ou revisar o censo e comprobar quen pode votar e ser candidato ou candidata.
- [ ] Preparar a elección e xerar as ligazóns.
- [ ] Crear unha elección ficticia separada e probar cun grupo pequeno o fluxo completo —voto, peche e resultados— antes de repartir ligazóns reais.
- [ ] Distribuír cada ligazón real unicamente á súa persoa, por unha canle adecuada e sen gardala en documentos, follas de cálculo, logs ou chats colectivos.

### Durante

- [ ] Revisar a participación desde administración; non se mostran resultados coa elección aberta.
- [ ] Rexenerar unha ligazón só se a persoa aínda non votou e realmente fai falta. A anterior queda revogada.
- [ ] Non modificar nin reinterpretar regras de maneira improvisada.
- [ ] Pechar manualmente cando corresponda; alcanzar a data límite non substitúe este paso.

### Despois

- [ ] Confirmar que a elección está pechada.
- [ ] Revisar resultados, participación e avisos de integridade.
- [ ] Documentar externamente calquera resolución de empate.
- [ ] Lembrar que un empate no corte non se resolve automaticamente.
- [ ] Lembrar que un quórum incumprido impide asignar prazas automaticamente, aínda que se mostre o reconto.
- [ ] Comprobar que unha candidatura con cero votos non recibe praza automática.
- [ ] Facer un backup posterior se a elección é real e verificar que se pode listar.
- [ ] Aplicar a política de retención acordada.

## Seguridade e privacidade

- A ligazón de voto é secreta: entrégaa só á persoa destinataria; non a gardes nin a rexistres.
- O token viaxa inicialmente no fragmento (`/v#…`), non no path nin na query, e elimínase do enderezo ao intercambialo por unha sesión.
- Non captures corpos, cookies nin ligazóns de voto en logs, analítica, trazas, replays ou soporte.
- `ballots` e `ballot_choices` non relacionan a papeleta coa persoa nin coa credencial. O censo conserva por separado se unha persoa xa votou para impedir o dobre voto.
- O anonimato é lóxico e aplicativo, non criptográfico fronte a un operador de infraestrutura con acceso total.
- Non uses nin intentes obter resultados antes do peche.

Estas medidas non substitúen o control de accesos, a protección dos segredos e unha operación coidadosa.

## Documentación detallada

- [Base de datos de produción](docs/production-database.md)
- [Migración, backup e restauración](docs/database-backup-restore.md)
- [Cabeceiras HTTP e migracións](docs/security/http-headers-and-migrations.md)
- [Guía de estilo visual](docs/brand/STYLE_GUIDE.md)
