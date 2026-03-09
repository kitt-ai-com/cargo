import BetterSqlite3 from "better-sqlite3";
import { SCHEMA } from "./schema";

export interface ChatRoomInput {
  room_name: string;
  room_type?: string;
  is_active?: number;
}

export interface MessageInput {
  chat_room_id: number;
  sender: string;
  content_type?: string;
  raw_content: string;
  sent_time?: string;
  image_path?: string;
  ocr_text?: string;
  is_order?: number;
}

export interface ParsedOrderInput {
  message_id: number;
  origin?: string;
  destination?: string;
  cargo?: string;
  deadline?: string;
  requested_price?: number;
  vehicle_type?: string;
  special_notes?: string;
  confidence?: number;
  status?: string;
}

export interface OrderUpdateFields {
  origin?: string;
  destination?: string;
  cargo?: string;
  deadline?: string;
  requested_price?: number;
  vehicle_type?: string;
  special_notes?: string;
  confidence?: number;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    // Migration: add sent_time column if missing
    try {
      this.db.exec("ALTER TABLE messages ADD COLUMN sent_time TEXT DEFAULT ''");
    } catch {
      // Column already exists
    }
  }

  listTables(): string[] {
    const rows = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  // --- Chat Rooms ---

  insertChatRoom(input: ChatRoomInput): number {
    const stmt = this.db.prepare(
      "INSERT INTO chat_rooms (room_name, room_type, is_active) VALUES (@room_name, @room_type, @is_active)"
    );
    const result = stmt.run({
      room_name: input.room_name,
      room_type: input.room_type ?? "group",
      is_active: input.is_active ?? 1,
    });
    return result.lastInsertRowid as number;
  }

  getChatRoom(id: number): any {
    return this.db.prepare("SELECT * FROM chat_rooms WHERE id = ?").get(id);
  }

  getAllChatRooms(): any[] {
    return this.db.prepare("SELECT * FROM chat_rooms ORDER BY id").all();
  }

  // --- Messages ---

  insertMessage(input: MessageInput): number {
    const stmt = this.db.prepare(
      `INSERT INTO messages (chat_room_id, sender, content_type, raw_content, sent_time, image_path, ocr_text, is_order)
       VALUES (@chat_room_id, @sender, @content_type, @raw_content, @sent_time, @image_path, @ocr_text, @is_order)`
    );
    const result = stmt.run({
      chat_room_id: input.chat_room_id,
      sender: input.sender,
      content_type: input.content_type ?? "text",
      raw_content: input.raw_content,
      sent_time: input.sent_time ?? "",
      image_path: input.image_path ?? null,
      ocr_text: input.ocr_text ?? null,
      is_order: input.is_order ?? 0,
    });
    return result.lastInsertRowid as number;
  }

  getMessagesByChatRoom(chatRoomId: number, limit?: number): any[] {
    let sql = "SELECT * FROM messages WHERE chat_room_id = ? ORDER BY id DESC";
    if (limit !== undefined) {
      sql += ` LIMIT ${Number(limit)}`;
    }
    return this.db.prepare(sql).all(chatRoomId);
  }

  markMessageAsOrder(id: number): void {
    this.db.prepare("UPDATE messages SET is_order = 1 WHERE id = ?").run(id);
  }

  // --- Parsed Orders ---

  insertParsedOrder(input: ParsedOrderInput): number {
    const stmt = this.db.prepare(
      `INSERT INTO parsed_orders (message_id, origin, destination, cargo, deadline, requested_price, vehicle_type, special_notes, confidence, status)
       VALUES (@message_id, @origin, @destination, @cargo, @deadline, @requested_price, @vehicle_type, @special_notes, @confidence, @status)`
    );
    const result = stmt.run({
      message_id: input.message_id,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      cargo: input.cargo ?? null,
      deadline: input.deadline ?? null,
      requested_price: input.requested_price ?? null,
      vehicle_type: input.vehicle_type ?? null,
      special_notes: input.special_notes ?? null,
      confidence: input.confidence ?? null,
      status: input.status ?? "PENDING",
    });
    return result.lastInsertRowid as number;
  }

  getOrder(id: number): any {
    return this.db
      .prepare("SELECT * FROM parsed_orders WHERE id = ?")
      .get(id);
  }

  getOrdersByStatus(status: string): any[] {
    return this.db
      .prepare(
        `SELECT
           po.*,
           m.sender,
           m.raw_content,
           m.sent_time,
           m.content_type,
           cr.room_name,
           cr.room_type
         FROM parsed_orders po
         JOIN messages m ON po.message_id = m.id
         JOIN chat_rooms cr ON m.chat_room_id = cr.id
         WHERE po.status = ?
         ORDER BY po.id DESC`
      )
      .all(status);
  }

  updateOrderStatus(id: number, status: string): void {
    this.db
      .prepare("UPDATE parsed_orders SET status = ? WHERE id = ?")
      .run(status, id);
  }

  updateOrderFields(id: number, fields: OrderUpdateFields): void {
    const entries = Object.entries(fields).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) return;

    const setClauses = entries.map(([key]) => `${key} = @${key}`).join(", ");
    const params: Record<string, any> = { id };
    for (const [key, value] of entries) {
      params[key] = value;
    }

    this.db
      .prepare(`UPDATE parsed_orders SET ${setClauses} WHERE id = @id`)
      .run(params);
  }

  // --- Dispatch Logs ---

  insertDispatchLog(
    orderId: number,
    targetApp: string,
    payload?: string,
    responseCode?: number,
    error?: string
  ): number {
    const stmt = this.db.prepare(
      `INSERT INTO dispatch_logs (order_id, target_app, request_payload, response_code, error_message)
       VALUES (@order_id, @target_app, @request_payload, @response_code, @error_message)`
    );
    const result = stmt.run({
      order_id: orderId,
      target_app: targetApp,
      request_payload: payload ?? null,
      response_code: responseCode ?? null,
      error_message: error ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getDispatchLogs(orderId?: number): any[] {
    if (orderId !== undefined) {
      return this.db
        .prepare(
          "SELECT * FROM dispatch_logs WHERE order_id = ? ORDER BY id DESC"
        )
        .all(orderId);
    }
    return this.db
      .prepare("SELECT * FROM dispatch_logs ORDER BY id DESC")
      .all();
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close();
  }
}
