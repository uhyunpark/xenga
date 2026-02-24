import Database from "better-sqlite3";
import { SCHEMA } from "./schema.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH ?? (process.env.VERCEL ? "/tmp/xenga.db" : "xenga.db");
    db = new Database(dbPath);
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
