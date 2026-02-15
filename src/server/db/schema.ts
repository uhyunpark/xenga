export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL,
    service_type TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    buyer_address TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    escrow_id INTEGER,
    tx_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    escrow_id INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    filed_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    resolution TEXT,
    buyer_pct INTEGER,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    escrow_id INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(tx_hash, log_index)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_address);
  CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_address);
  CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_id);
  CREATE INDEX IF NOT EXISTS idx_events_escrow ON events(escrow_id);

  CREATE TABLE IF NOT EXISTS sessions (
    session_id INTEGER PRIMARY KEY,
    buyer_address TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    deposit_amount TEXT NOT NULL,
    used_amount TEXT NOT NULL DEFAULT '0',
    price_per_use TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    tx_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    amount TEXT NOT NULL,
    endpoint TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_buyer ON sessions(buyer_address);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_session_usage_session ON session_usage(session_id);
`;
