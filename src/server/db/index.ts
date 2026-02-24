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
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
