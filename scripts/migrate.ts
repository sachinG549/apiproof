import { readFileSync, readdirSync } from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Create a Neon project and put its connection string in the environment.");
    process.exit(1);
  }
  const sql = neon(databaseUrl);
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const dir = path.join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const applied = await sql`SELECT id FROM schema_migrations WHERE id = ${file}`;
    if (applied.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const text = readFileSync(path.join(dir, file), "utf8");
    const statements = text
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await sql.query(statement);
    }
    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`;
    console.log(`applied ${file}`);
  }
  console.log("migrations complete");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
