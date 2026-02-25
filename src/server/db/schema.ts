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

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    event_types TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_address);
  CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_address);
  CREATE INDEX IF NOT EXISTS idx_orders_escrow_id ON orders(escrow_id);
  CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_id);
  CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);
  CREATE TABLE IF NOT EXISTS payment_intents (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    buyer_address TEXT,
    return_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS sellers (
    address TEXT PRIMARY KEY,
    name TEXT,
    registered_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seller_api_keys (
    id TEXT PRIMARY KEY,
    seller_address TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_seller_api_keys_address ON seller_api_keys(seller_address);

  CREATE INDEX IF NOT EXISTS idx_events_escrow ON events(escrow_id);
  CREATE INDEX IF NOT EXISTS idx_events_block_number ON events(block_number);
  CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON payment_intents(order_id);
  CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
`;
