import * as fs from "fs";
import * as path from "path";
import { Database } from "../database";

const TEST_DB = path.join(__dirname, "test.db");

let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  // WAL/SHM files
  if (fs.existsSync(TEST_DB + "-wal")) fs.unlinkSync(TEST_DB + "-wal");
  if (fs.existsSync(TEST_DB + "-shm")) fs.unlinkSync(TEST_DB + "-shm");
});

describe("Database initialization", () => {
  test("creates all four tables on init", () => {
    const tables = db.listTables();
    expect(tables).toContain("chat_rooms");
    expect(tables).toContain("messages");
    expect(tables).toContain("parsed_orders");
    expect(tables).toContain("dispatch_logs");
  });
});

describe("Chat Rooms", () => {
  test("insert and retrieve a chat room", () => {
    const id = db.insertChatRoom({ room_name: "물류방1" });
    expect(id).toBe(1);

    const room = db.getChatRoom(id);
    expect(room).toBeDefined();
    expect(room.room_name).toBe("물류방1");
    expect(room.room_type).toBe("group");
    expect(room.is_active).toBe(1);
    expect(room.created_at).toBeTruthy();
  });

  test("insert multiple and get all", () => {
    db.insertChatRoom({ room_name: "방A" });
    db.insertChatRoom({ room_name: "방B", room_type: "direct" });
    db.insertChatRoom({ room_name: "방C", is_active: 0 });

    const rooms = db.getAllChatRooms();
    expect(rooms).toHaveLength(3);
    expect(rooms[1].room_type).toBe("direct");
    expect(rooms[2].is_active).toBe(0);
  });

  test("getChatRoom returns undefined for non-existent id", () => {
    const room = db.getChatRoom(999);
    expect(room).toBeUndefined();
  });
});

describe("Messages", () => {
  let roomId: number;

  beforeEach(() => {
    roomId = db.insertChatRoom({ room_name: "테스트방" });
  });

  test("insert and retrieve messages by chat room", () => {
    db.insertMessage({
      chat_room_id: roomId,
      sender: "김기사",
      raw_content: "서울->부산 5톤 냉동 내일까지",
    });
    db.insertMessage({
      chat_room_id: roomId,
      sender: "박기사",
      raw_content: "인천->대구 1톤 오늘 출발",
    });

    const messages = db.getMessagesByChatRoom(roomId);
    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe("박기사"); // DESC order
    expect(messages[1].sender).toBe("김기사");
  });

  test("retrieve messages with limit", () => {
    db.insertMessage({
      chat_room_id: roomId,
      sender: "A",
      raw_content: "msg1",
    });
    db.insertMessage({
      chat_room_id: roomId,
      sender: "B",
      raw_content: "msg2",
    });
    db.insertMessage({
      chat_room_id: roomId,
      sender: "C",
      raw_content: "msg3",
    });

    const messages = db.getMessagesByChatRoom(roomId, 2);
    expect(messages).toHaveLength(2);
  });

  test("markMessageAsOrder updates is_order flag", () => {
    const msgId = db.insertMessage({
      chat_room_id: roomId,
      sender: "김기사",
      raw_content: "서울->부산 화물",
    });

    const before = db.getMessagesByChatRoom(roomId);
    expect(before[0].is_order).toBe(0);

    db.markMessageAsOrder(msgId);

    const after = db.getMessagesByChatRoom(roomId);
    expect(after[0].is_order).toBe(1);
  });

  test("insert message with image and ocr data", () => {
    const msgId = db.insertMessage({
      chat_room_id: roomId,
      sender: "이기사",
      content_type: "image",
      raw_content: "[이미지]",
      image_path: "/images/order1.png",
      ocr_text: "서울 출발 부산 도착",
    });

    const messages = db.getMessagesByChatRoom(roomId);
    expect(messages[0].content_type).toBe("image");
    expect(messages[0].image_path).toBe("/images/order1.png");
    expect(messages[0].ocr_text).toBe("서울 출발 부산 도착");
  });
});

describe("Parsed Orders", () => {
  let roomId: number;
  let msgId: number;

  beforeEach(() => {
    roomId = db.insertChatRoom({ room_name: "물류방" });
    msgId = db.insertMessage({
      chat_room_id: roomId,
      sender: "김기사",
      raw_content: "서울->부산 5톤 냉동 내일까지 150만원",
      is_order: 1,
    });
  });

  test("insert and retrieve parsed order", () => {
    const orderId = db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
      destination: "부산",
      cargo: "냉동식품",
      deadline: "2026-03-07",
      requested_price: 1500000,
      vehicle_type: "5톤 냉동",
      confidence: 0.92,
    });

    const order = db.getOrder(orderId);
    expect(order).toBeDefined();
    expect(order.origin).toBe("서울");
    expect(order.destination).toBe("부산");
    expect(order.cargo).toBe("냉동식품");
    expect(order.requested_price).toBe(1500000);
    expect(order.vehicle_type).toBe("5톤 냉동");
    expect(order.confidence).toBeCloseTo(0.92);
    expect(order.status).toBe("PENDING");
  });

  test("retrieve orders by status with joined data", () => {
    const msgId2 = db.insertMessage({
      chat_room_id: roomId,
      sender: "박기사",
      raw_content: "인천->대구 1톤",
      is_order: 1,
    });

    db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
      destination: "부산",
      status: "PENDING",
    });
    db.insertParsedOrder({
      message_id: msgId2,
      origin: "인천",
      destination: "대구",
      status: "DISPATCHED",
    });

    const pending = db.getOrdersByStatus("PENDING");
    expect(pending).toHaveLength(1);
    expect(pending[0].origin).toBe("서울");
    expect(pending[0].sender).toBe("김기사");
    expect(pending[0].room_name).toBe("물류방");

    const dispatched = db.getOrdersByStatus("DISPATCHED");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].origin).toBe("인천");
    expect(dispatched[0].sender).toBe("박기사");
  });

  test("update order status", () => {
    const orderId = db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
      destination: "부산",
    });

    db.updateOrderStatus(orderId, "DISPATCHED");
    const order = db.getOrder(orderId);
    expect(order.status).toBe("DISPATCHED");

    db.updateOrderStatus(orderId, "COMPLETED");
    const order2 = db.getOrder(orderId);
    expect(order2.status).toBe("COMPLETED");
  });

  test("update order fields", () => {
    const orderId = db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
    });

    db.updateOrderFields(orderId, {
      destination: "대전",
      cargo: "전자제품",
      requested_price: 800000,
    });

    const order = db.getOrder(orderId);
    expect(order.destination).toBe("대전");
    expect(order.cargo).toBe("전자제품");
    expect(order.requested_price).toBe(800000);
    expect(order.origin).toBe("서울"); // unchanged
  });

  test("updateOrderFields with empty object does nothing", () => {
    const orderId = db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
    });

    db.updateOrderFields(orderId, {});
    const order = db.getOrder(orderId);
    expect(order.origin).toBe("서울");
  });
});

describe("Dispatch Logs", () => {
  let orderId: number;

  beforeEach(() => {
    const roomId = db.insertChatRoom({ room_name: "물류방" });
    const msgId = db.insertMessage({
      chat_room_id: roomId,
      sender: "김기사",
      raw_content: "화물 주문",
      is_order: 1,
    });
    orderId = db.insertParsedOrder({
      message_id: msgId,
      origin: "서울",
      destination: "부산",
    });
  });

  test("insert and retrieve dispatch log", () => {
    const logId = db.insertDispatchLog(
      orderId,
      "화물맨",
      '{"origin":"서울","dest":"부산"}',
      200
    );

    const logs = db.getDispatchLogs(orderId);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(logId);
    expect(logs[0].target_app).toBe("화물맨");
    expect(logs[0].response_code).toBe(200);
    expect(logs[0].error_message).toBeNull();
  });

  test("insert dispatch log with error", () => {
    db.insertDispatchLog(
      orderId,
      "화물맨",
      '{"origin":"서울"}',
      500,
      "Internal Server Error"
    );

    const logs = db.getDispatchLogs(orderId);
    expect(logs[0].response_code).toBe(500);
    expect(logs[0].error_message).toBe("Internal Server Error");
  });

  test("get all dispatch logs without filter", () => {
    const roomId = db.insertChatRoom({ room_name: "방2" });
    const msgId = db.insertMessage({
      chat_room_id: roomId,
      sender: "이기사",
      raw_content: "다른 주문",
      is_order: 1,
    });
    const orderId2 = db.insertParsedOrder({
      message_id: msgId,
      origin: "인천",
    });

    db.insertDispatchLog(orderId, "화물맨", undefined, 200);
    db.insertDispatchLog(orderId2, "배차킹", undefined, 200);

    const allLogs = db.getDispatchLogs();
    expect(allLogs).toHaveLength(2);
  });
});
