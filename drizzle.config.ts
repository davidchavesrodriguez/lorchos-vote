import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

const migrationDatabaseUrl = process.env.DATABASE_MIGRATION_URL?.trim();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(migrationDatabaseUrl
    ? { dbCredentials: { url: migrationDatabaseUrl } }
    : {}),
});
