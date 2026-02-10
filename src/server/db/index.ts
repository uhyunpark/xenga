import Database from "better-sqlite3";
import { SCHEMA } from "./schema.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database("x402-escrow.db");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
