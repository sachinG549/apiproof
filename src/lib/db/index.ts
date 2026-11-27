import { getConfig } from "@/lib/config";
import { createPostgresStore } from "@/lib/db/postgres";
import { getMemoryStore, type Store } from "@/lib/db/store";

let postgres: Store | null = null;

export function getStore(): Store {
  const url = getConfig().databaseUrl;
  if (!url) return getMemoryStore();
  if (!postgres || postgres.kind !== "postgres") postgres = createPostgresStore(url);
  return postgres;
}

export function storageMode(): "memory" | "postgres" {
  return getConfig().databaseUrl ? "postgres" : "memory";
}
