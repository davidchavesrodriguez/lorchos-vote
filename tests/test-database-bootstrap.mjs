import dotenv from 'dotenv';

import { configureTestDatabaseEnvironment } from './test-database.mjs';

dotenv.config({ path: '.env.test.local', quiet: true });

export const testDatabaseConfiguration =
  configureTestDatabaseEnvironment(process.env);
