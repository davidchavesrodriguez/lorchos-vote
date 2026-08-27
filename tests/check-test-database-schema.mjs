import postgres from 'postgres';

import './test-database-bootstrap.mjs';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const schemaQuery =
  'select ' +
  'to_regclass(\'public.elections\') is not null as elections, ' +
  'to_regclass(\'public.election_participants\') is not null as participants, ' +
  'to_regclass(\'public.voting_credentials\') is not null as credentials, ' +
  'to_regclass(\'public.ballots\') is not null as ballots, ' +
  'to_regclass(\'public.ballot_choices\') is not null as choices';

try {
  const [schemaState] = await client.unsafe(schemaQuery);

  if (!schemaState || Object.values(schemaState).some((exists) => !exists)) {
    throw new Error(
      'The test database schema is not prepared. Run npm run db:test:migrate.',
    );
  }
} catch (error) {
  if (
    error instanceof Error &&
    error.message.startsWith('The test database schema is not prepared')
  ) {
    console.error(error.message);
  } else {
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? ' (' + String(error.code) + ')'
        : '';
    console.error('Could not verify the test database schema' + errorCode + '.');
  }

  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
