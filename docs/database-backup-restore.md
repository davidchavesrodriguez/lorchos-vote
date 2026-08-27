# Migración, backup e restauración da base de datos

Este runbook recolle o procedemento probado manualmente con Neon. En produción:

- `DATABASE_URL`: conexión pooled para o runtime.
- `DATABASE_MIGRATION_URL`: conexión directa para migracións e administración.
- `TEST_DATABASE_URL`: base local co sufixo `_test`.

O proxecto de Neon verificado está na rexión de Frankfurt e a base de produción
chámase `lorchos_vote`.

As URLs conteñen contrasinais. Non imprimilas nin copialas a logs, chats ou
documentación.

## Migración

Confirmar en Neon que `DATABASE_MIGRATION_URL` é a URL **directa** da base de
destino. Nunca usar a `DATABASE_URL` pooled para decidir que base migrar.

```powershell
npm.cmd run db:migrate
```

O script só acepta `DATABASE_MIGRATION_URL`. As migracións non se executan
automaticamente durante o deploy: hai que aplicalas de forma explícita antes de
despregar código que dependa delas.

Despois, usando a conexión directa, verificar:

- as táboas `elections`, `election_participants`, `voting_credentials`,
  `ballots` e `ballot_choices` no esquema `public`;
- o rexistro de `drizzle.__drizzle_migrations`.

## Preparar a conexión administrativa

Cargar `DATABASE_MIGRATION_URL` desde `.env.local` sen amosala:

```powershell
$databaseUrlLine = Get-Content .env.local |
  Where-Object { $_ -match '^\s*DATABASE_MIGRATION_URL\s*=' } |
  Select-Object -Last 1
if (-not $databaseUrlLine) { throw 'Falta DATABASE_MIGRATION_URL' }

$env:DATABASE_MIGRATION_URL = ($databaseUrlLine -replace '^\s*DATABASE_MIGRATION_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
if ([string]::IsNullOrWhiteSpace($env:DATABASE_MIGRATION_URL)) {
  throw 'DATABASE_MIGRATION_URL está baleira'
}
```

Comprobar as táboas e as migracións despois de `db:migrate`:

```powershell
docker run --rm `
  --env DATABASE_MIGRATION_URL `
  postgres:18 `
  sh -c 'psql --dbname="$DATABASE_MIGRATION_URL" --set=ON_ERROR_STOP=1 --command="\dt public.*" --command="TABLE drizzle.__drizzle_migrations;"'
```

## Backup

Usar PostgreSQL 18 mediante Docker e unha carpeta fóra do repositorio:

```powershell
$backupDirectory = 'C:\backups\lorchos-vote'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null

$backupFile = 'lorchos-vote-{0}.dump' -f (Get-Date -Format 'yyyy-MM-dd_HHmm')
$backupPath = Join-Path $backupDirectory $backupFile
if (Test-Path -LiteralPath $backupPath) {
  throw "O backup xa existe: $backupPath"
}

docker run --rm `
  --env DATABASE_MIGRATION_URL `
  --env "BACKUP_FILE=$backupFile" `
  --volume "${backupDirectory}:/backups" `
  postgres:18 `
  sh -c 'pg_dump --dbname="$DATABASE_MIGRATION_URL" --format=custom --no-owner --no-acl --file="/backups/$BACKUP_FILE"'
```

Os backups reais deben levar timestamp, por exemplo
`lorchos-vote-2026-08-27_1444.dump`, e non sobreescribir un backup anterior.
Comprobar que o dump se pode listar:

```powershell
docker run --rm `
  --volume "${backupDirectory}:/backups:ro" `
  postgres:18 `
  pg_restore --list "/backups/$backupFile"
```

Antes da restauración, anotar os conteos esperados na orixe:

```powershell
docker run --rm `
  --env DATABASE_MIGRATION_URL `
  postgres:18 `
  sh -c 'psql --dbname="$DATABASE_MIGRATION_URL" --set=ON_ERROR_STOP=1 --command="SELECT count(*) AS elections FROM public.elections;" --command="SELECT count(*) AS election_participants FROM public.election_participants;" --command="SELECT count(*) AS voting_credentials FROM public.voting_credentials;" --command="SELECT count(*) AS ballots FROM public.ballots;" --command="SELECT count(*) AS ballot_choices FROM public.ballot_choices;"'

$env:DATABASE_MIGRATION_URL = $null
```

## Proba de restauración

Nunca probar unha restauración sobre `lorchos_vote`.

1. Crear en Neon unha base temporal independente, por exemplo
   `lorchos_vote_restore_test`.
2. Copiar a súa URL **directa**, non a pooled.
3. Cargala sen escribila no comando nin amosala:

```powershell
$env:DATABASE_RESTORE_URL = Get-Clipboard
Clear-Clipboard
if ([string]::IsNullOrWhiteSpace($env:DATABASE_RESTORE_URL)) {
  throw 'DATABASE_RESTORE_URL está baleira'
}
```

Restaurar nela o dump seleccionado:

```powershell
$backupDirectory = 'C:\backups\lorchos-vote'
$backupFile = 'lorchos-vote-AAAA-MM-DD_HHmm.dump'

docker run --rm `
  --env DATABASE_RESTORE_URL `
  --env "BACKUP_FILE=$backupFile" `
  --volume "${backupDirectory}:/backups:ro" `
  postgres:18 `
  sh -c 'pg_restore --dbname="$DATABASE_RESTORE_URL" --format=custom --no-owner --no-acl --exit-on-error "/backups/$BACKUP_FILE"'
```

Substituír `AAAA-MM-DD_HHmm` polo timestamp exacto do dump que se vai probar.

Verificar as cinco táboas, o historial de Drizzle e os conteos:

```powershell
docker run --rm `
  --env DATABASE_RESTORE_URL `
  postgres:18 `
  sh -c 'psql --dbname="$DATABASE_RESTORE_URL" --set=ON_ERROR_STOP=1 --command="\dt public.*" --command="TABLE drizzle.__drizzle_migrations;" --command="SELECT count(*) AS elections FROM public.elections;" --command="SELECT count(*) AS election_participants FROM public.election_participants;" --command="SELECT count(*) AS voting_credentials FROM public.voting_credentials;" --command="SELECT count(*) AS ballots FROM public.ballots;" --command="SELECT count(*) AS ballot_choices FROM public.ballot_choices;"'
```

Confirmar que están as cinco táboas, que
`drizzle.__drizzle_migrations` foi restaurada e que os conteos coinciden cos da
orixe. A proba realizada tamén confirmou constraints e enums.

Ao terminar:

```powershell
$env:DATABASE_RESTORE_URL = $null
Clear-Clipboard
```

Eliminar en Neon **unicamente** a base temporal despois de comprobar o seu nome.
Non eliminar o dump empregado na proba.

## Restauración ante unha incidencia real

Non restaurar destrutivamente sobre produción como primeiro paso:

1. Deter as escrituras ou a aplicación, se corresponde.
2. Conservar a base danada antes de modificala.
3. Restaurar primeiro o backup nunha base nova.
4. Verificar estrutura, migracións e datos.
5. Decidir de forma controlada o cambio de conexión.
6. Manter a base anterior ata completar a verificación.

Este procedemento non deseña aínda automatización.

## Seguridade e estado da proba

- Gardar os dumps fóra do repositorio e non commitealos nunca.
- Non pegar URLs completas en logs, chats ou documentación: conteñen
  contrasinais.
- Limpar as variables temporais e o portapapeis cando contivesen unha URL.
- Para eleccións reais, conservar polo menos unha copia adicional fóra do
  portátil.
- O formato custom de `pg_dump` non implica cifrado; este procedemento non
  afirma que os backups estean cifrados.

A proba inicial fíxose cunha base baleira que xa tiña as migracións aplicadas.
Valida a estrutura e o procedemento. Antes da primeira elección oficial farase
outra proba con datos ficticios e, finalmente, backups reais antes e despois das
eleccións.
