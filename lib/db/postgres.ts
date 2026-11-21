import { Pool, type QueryResult, type QueryResultRow } from "pg";
declare global { var __edgePgPool: Pool | undefined; }
function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  return new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
}
export const pgPool = globalThis.__edgePgPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__edgePgPool = pgPool;
export function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return pgPool.query<T>(sql, values);
}
