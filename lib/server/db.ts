import { Pool, type QueryResult, type QueryResultRow } from "pg";

// One pool per Node process. The global cache prevents "too many clients" during `next dev` hot reloads.
const globalForPg = globalThis as unknown as { __edgePgPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Example: postgresql://edge_user:password@127.0.0.1:5432/edge_terminal");
  }
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Set PGSSL=true only when the database is on another host with TLS. Localhost needs no SSL.
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
  });
  pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error:", error));
  return pool;
}

export function getPool(): Pool {
  if (!globalForPg.__edgePgPool) globalForPg.__edgePgPool = createPool();
  return globalForPg.__edgePgPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}
