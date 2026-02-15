/**
 * Database Adapter Interface
 *
 * Abstracts over SQLite (better-sqlite3) and PostgreSQL (pg) so the
 * application code can use either backend depending on config.
 *
 * Current implementation: SQLite only.
 * To enable PostgreSQL: set DATABASE_URL env var to a postgres:// connection string,
 * install `pg` package, and implement PgAdapter below.
 *
 * Usage:
 *   import { getDb } from "./adapter.js";
 *   const db = getDb();
 *   const rows = db.query("SELECT * FROM orders WHERE id = ?", [id]);
 *   db.execute("INSERT INTO orders ...", [params]);
 */

export interface DbAdapter {
  /** Run a query that returns rows */
  query<T = any>(sql: string, params?: any[]): T[];
  /** Run a query that returns a single row or undefined */
  queryOne<T = any>(sql: string, params?: any[]): T | undefined;
  /** Execute a statement (INSERT/UPDATE/DELETE), returns { changes } */
  execute(sql: string, params?: any[]): { changes: number };
  /** Execute raw SQL (e.g. DDL) */
  exec(sql: string): void;
  /** Close the connection */
  close(): void;
}

/**
 * Get the active database adapter.
 *
 * Selection logic:
 *   - DATABASE_URL starts with "postgres://" → PostgreSQL (not yet implemented)
 *   - Otherwise → SQLite (default)
 *
 * To migrate to PostgreSQL:
 *   1. npm install pg
 *   2. Set DATABASE_URL=postgres://user:pass@host:5432/dbname
 *   3. Implement PgAdapter class (convert ? placeholders to $1,$2,... format)
 *   4. Run migrations (the SCHEMA uses SQLite syntax; create equivalent PG schema)
 */
export function getDatabaseAdapter(): DbAdapter {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl?.startsWith("postgres://") || dbUrl?.startsWith("postgresql://")) {
    throw new Error(
      "PostgreSQL adapter not yet implemented. Install `pg` and implement PgAdapter in src/server/db/adapter.ts"
    );
  }

  // Default: SQLite via existing getDb()
  return getSqliteAdapter();
}

// ──────────── SQLite Adapter ────────────

let _sqliteAdapter: DbAdapter | undefined;

function getSqliteAdapter(): DbAdapter {
  if (_sqliteAdapter) return _sqliteAdapter;

  // Re-use the existing better-sqlite3 instance
  const { getDb, closeDb } = require("../db/index.js");
  const db = getDb();

  _sqliteAdapter = {
    query<T = any>(sql: string, params: any[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    execute(sql: string, params: any[] = []): { changes: number } {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes };
    },
    exec(sql: string) {
      db.exec(sql);
    },
    close() {
      closeDb();
    },
  };

  return _sqliteAdapter;
}

// ──────────── PostgreSQL Adapter (stub) ────────────
//
// To implement:
//
// import { Pool } from "pg";
//
// class PgAdapter implements DbAdapter {
//   private pool: Pool;
//   constructor(connectionString: string) {
//     this.pool = new Pool({ connectionString });
//   }
//   // Convert ? to $1,$2,... for pg parameterized queries
//   private convertPlaceholders(sql: string): string {
//     let i = 0;
//     return sql.replace(/\?/g, () => `$${++i}`);
//   }
//   async query<T>(sql: string, params?: any[]): Promise<T[]> {
//     const { rows } = await this.pool.query(this.convertPlaceholders(sql), params);
//     return rows;
//   }
//   // ... etc
// }
