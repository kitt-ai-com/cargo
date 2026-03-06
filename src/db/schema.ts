export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS chat_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name TEXT NOT NULL,
    room_type TEXT NOT NULL DEFAULT 'group',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_room_id INTEGER NOT NULL REFERENCES chat_rooms(id),
    sender TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    raw_content TEXT NOT NULL,
    image_path TEXT,
    ocr_text TEXT,
    is_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parsed_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id),
    origin TEXT,
    destination TEXT,
    cargo TEXT,
    deadline TEXT,
    requested_price INTEGER,
    vehicle_type TEXT,
    special_notes TEXT,
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dispatch_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES parsed_orders(id),
    target_app TEXT NOT NULL,
    request_payload TEXT,
    response_code INTEGER,
    error_message TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_room ON messages(chat_room_id);
  CREATE INDEX IF NOT EXISTS idx_messages_is_order ON messages(is_order);
  CREATE INDEX IF NOT EXISTS idx_parsed_orders_status ON parsed_orders(status);
  CREATE INDEX IF NOT EXISTS idx_dispatch_logs_order ON dispatch_logs(order_id);
`;
