import { Database } from "../db/database";
import { ClassifierService } from "../ai/classifier";
import { ParserService, ParsedOrder } from "../ai/parser";
import fs from "fs";

interface IncomingMessage {
  room_name: string;
  sender: string;
  content: string;
  content_type: string;
  image_path?: string;
}

export class MessagePipeline {
  private db: Database;
  private classifier: ClassifierService;
  private parser: ParserService;
  private roomIdCache: Map<string, number> = new Map();

  constructor(
    db: Database,
    classifier: ClassifierService,
    parser: ParserService
  ) {
    this.db = db;
    this.classifier = classifier;
    this.parser = parser;
  }

  private getOrCreateRoomId(roomName: string): number {
    if (this.roomIdCache.has(roomName)) {
      return this.roomIdCache.get(roomName)!;
    }
    const rooms = this.db.getAllChatRooms() as any[];
    const existing = rooms.find((r) => r.room_name === roomName);
    if (existing) {
      this.roomIdCache.set(roomName, existing.id);
      return existing.id;
    }
    const id = this.db.insertChatRoom({
      room_name: roomName,
      room_type: "group",
    });
    this.roomIdCache.set(roomName, id);
    return id;
  }

  async processMessage(
    msg: IncomingMessage
  ): Promise<(ParsedOrder & { orderId: number; messageId: number }) | null> {
    const roomId = this.getOrCreateRoomId(msg.room_name);

    const messageId = this.db.insertMessage({
      chat_room_id: roomId,
      sender: msg.sender,
      content_type: msg.content_type,
      raw_content: msg.content,
      image_path: msg.image_path,
    });

    let isOrder: boolean;
    if (msg.content_type === "image" && msg.image_path) {
      const imageBuffer = fs.readFileSync(msg.image_path);
      const base64 = imageBuffer.toString("base64");
      const ext: "image/png" | "image/jpeg" = msg.image_path
        .toLowerCase()
        .endsWith(".png")
        ? "image/png"
        : "image/jpeg";
      isOrder = await this.classifier.classifyImage(base64, ext);
    } else {
      isOrder = await this.classifier.classify(msg.content);
    }

    if (!isOrder) {
      return null;
    }

    this.db.markMessageAsOrder(messageId);

    let parsed: ParsedOrder;
    if (msg.content_type === "image" && msg.image_path) {
      const imageBuffer = fs.readFileSync(msg.image_path);
      const base64 = imageBuffer.toString("base64");
      const ext: "image/png" | "image/jpeg" = msg.image_path
        .toLowerCase()
        .endsWith(".png")
        ? "image/png"
        : "image/jpeg";
      parsed = await this.parser.parseImage(base64, ext);
    } else {
      parsed = await this.parser.parse(msg.content);
    }

    const orderId = this.db.insertParsedOrder({
      message_id: messageId,
      origin: parsed.origin ?? undefined,
      destination: parsed.destination ?? undefined,
      cargo: parsed.cargo ?? undefined,
      deadline: parsed.deadline ?? undefined,
      requested_price: parsed.requestedPrice ?? undefined,
      vehicle_type: parsed.vehicleType ?? undefined,
      special_notes: parsed.specialNotes ?? undefined,
      confidence: parsed.confidence,
      status: "READY",
    });

    return { ...parsed, orderId, messageId };
  }
}
