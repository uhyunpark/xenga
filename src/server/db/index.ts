import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema.js";

let db: Database;

export function getDb(): Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH ?? "x402-escrow.db";
    db = new Database(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database) {
  // Add payout_address to sellers table
  try { db.exec("ALTER TABLE sellers ADD COLUMN payout_address TEXT"); } catch { /* already exists */ }
  // Add seller_address to webhooks table
  try { db.exec("ALTER TABLE webhooks ADD COLUMN seller_address TEXT"); } catch { /* already exists */ }
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
