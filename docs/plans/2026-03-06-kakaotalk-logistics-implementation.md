# 카카오톡 물류 주문 자동화 - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** PC 카카오톡에서 물류 주문 메시지를 실시간 캡처하고, AI로 정형화한 뒤, 배차 앱으로 전송하는 Electron 데스크톱 앱을 구현한다.

**Architecture:** Electron 앱이 Python child process(카톡 UI Automation 모니터)를 실행하고, 캡처된 메시지를 2단계 AI(분류→파싱)로 처리한 뒤, React Native Web 프론트엔드에 실시간 표시한다. 사용자가 확인/수정 후 Adapter 패턴 기반 배차앱 연동 레이어를 통해 전송한다.

**Tech Stack:** Electron, React Native Web, TypeScript, Python (pywinauto), Claude API (Haiku/Sonnet/Vision), SQLite (better-sqlite3), Playwright (배차 웹자동화)

**Design doc:** `docs/plans/2026-03-06-kakaotalk-logistics-automation-design.md`

---

## Task 1: Electron + React Native Web 프로젝트 초기 설정

**Files:**
- Create: `package.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `tsconfig.json`
- Create: `app/App.tsx`
- Create: `app/index.ts`
- Create: `webpack.config.js`

**Step 1: 프로젝트 초기화 및 의존성 설치**

```bash
cd c:/study/ai-agent-1/output/proposal/20260306_카톡물류자동화
npm init -y
npm install electron react react-dom react-native-web better-sqlite3 @anthropic-ai/sdk
npm install -D typescript @types/react @types/react-dom @types/better-sqlite3 webpack webpack-cli webpack-dev-server ts-loader babel-loader @babel/core @babel/preset-react @babel/preset-env html-webpack-plugin electron-builder concurrently
```

**Step 2: TypeScript 설정 생성**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "react-native": ["./node_modules/react-native-web"]
    }
  },
  "include": ["electron/**/*", "app/**/*", "src/**/*"],
  "exclude": ["node_modules", "dist", "python"]
}
```

**Step 3: Electron main process 작성**

`electron/main.ts`:
```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "카톡 물류 주문 관리",
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
```

`electron/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onNewOrder: (callback: (order: unknown) => void) =>
    ipcRenderer.on("new-order", (_event, order) => callback(order)),
  confirmOrder: (orderId: string, data: unknown) =>
    ipcRenderer.invoke("confirm-order", orderId, data),
  dispatchOrder: (orderId: string, targetApp: string) =>
    ipcRenderer.invoke("dispatch-order", orderId, targetApp),
  ignoreOrder: (orderId: string) =>
    ipcRenderer.invoke("ignore-order", orderId),
  getOrders: (status?: string) =>
    ipcRenderer.invoke("get-orders", status),
  getChatRooms: () =>
    ipcRenderer.invoke("get-chat-rooms"),
});
```

**Step 4: React Native Web 엔트리 포인트 작성**

`app/App.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>카톡 물류 주문 관리</Text>
      <Text>앱이 정상적으로 실행되었습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 16 },
});
```

`app/index.ts`:
```typescript
import { AppRegistry } from "react-native";
import App from "./App";

AppRegistry.registerComponent("KatalkLogistics", () => App);
AppRegistry.runApplication("KatalkLogistics", {
  rootTag: document.getElementById("root"),
});
```

**Step 5: Webpack 설정 생성**

`webpack.config.js`:
```javascript
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./app/index.ts",
  output: {
    path: path.resolve(__dirname, "dist/renderer"),
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "react-native$": "react-native-web",
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./app/index.html",
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
  },
};
```

`app/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>카톡 물류 주문 관리</title>
  <style>
    html, body, #root { height: 100%; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

**Step 6: package.json scripts 추가**

`package.json`에 추가:
```json
{
  "main": "dist/electron/main.js",
  "scripts": {
    "dev:renderer": "webpack serve --mode development",
    "dev:electron": "tsc -p tsconfig.electron.json && electron .",
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:electron\"",
    "build": "webpack --mode production && tsc -p tsconfig.electron.json",
    "start": "electron ."
  }
}
```

**Step 7: 앱 실행 확인**

```bash
npm run dev:renderer
```
Expected: 브라우저에서 "카톡 물류 주문 관리" 텍스트 표시

**Step 8: Commit**

```bash
git init
echo "node_modules/\ndist/\n*.pyc\n__pycache__/\n.env" > .gitignore
git add .
git commit -m "feat: initialize Electron + React Native Web project"
```

---

## Task 2: SQLite 데이터베이스 레이어

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/database.ts`
- Create: `src/db/__tests__/database.test.ts`

**Step 1: 테스트 작성**

`src/db/__tests__/database.test.ts`:
```typescript
import { Database } from "../database";
import fs from "fs";

const TEST_DB = "./test.db";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test("creates tables on init", () => {
    const tables = db.listTables();
    expect(tables).toContain("chat_rooms");
    expect(tables).toContain("messages");
    expect(tables).toContain("parsed_orders");
    expect(tables).toContain("dispatch_logs");
  });

  test("inserts and retrieves chat room", () => {
    const id = db.insertChatRoom({ roomName: "강남물류방", roomType: "group" });
    const room = db.getChatRoom(id);
    expect(room.room_name).toBe("강남물류방");
    expect(room.room_type).toBe("group");
    expect(room.is_active).toBe(1);
  });

  test("inserts message and retrieves by chat room", () => {
    const roomId = db.insertChatRoom({ roomName: "테스트방", roomType: "group" });
    const msgId = db.insertMessage({
      chatRoomId: roomId,
      sender: "화주김",
      contentType: "text",
      rawContent: "역삼동에서 해운대 박스3개",
    });
    const messages = db.getMessagesByChatRoom(roomId);
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("화주김");
  });

  test("inserts parsed order and retrieves by status", () => {
    const roomId = db.insertChatRoom({ roomName: "테스트방", roomType: "group" });
    const msgId = db.insertMessage({
      chatRoomId: roomId,
      sender: "화주김",
      contentType: "text",
      rawContent: "역삼동에서 해운대",
    });
    db.insertParsedOrder({
      messageId: msgId,
      origin: "서울 강남구 역삼동",
      destination: "부산 해운대구",
      cargo: "박스 3개",
      confidence: 0.92,
      status: "READY",
    });
    const orders = db.getOrdersByStatus("READY");
    expect(orders).toHaveLength(1);
    expect(orders[0].origin).toBe("서울 강남구 역삼동");
  });

  test("updates order status", () => {
    const roomId = db.insertChatRoom({ roomName: "테스트방", roomType: "group" });
    const msgId = db.insertMessage({
      chatRoomId: roomId,
      sender: "화주김",
      contentType: "text",
      rawContent: "test",
    });
    const orderId = db.insertParsedOrder({
      messageId: msgId,
      origin: "서울",
      destination: "부산",
      status: "READY",
    });
    db.updateOrderStatus(orderId, "CONFIRMED");
    const order = db.getOrder(orderId);
    expect(order.status).toBe("CONFIRMED");
  });
});
```

**Step 2: 테스트 실행 확인 (실패)**

```bash
npm install -D jest ts-jest @types/jest
npx ts-jest config:init
npx jest src/db/__tests__/database.test.ts
```
Expected: FAIL - module not found

**Step 3: 스키마 정의**

`src/db/schema.ts`:
```typescript
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
```

**Step 4: Database 클래스 구현**

`src/db/database.ts`:
```typescript
import BetterSqlite3 from "better-sqlite3";
import { SCHEMA } from "./schema";

interface ChatRoomInput {
  roomName: string;
  roomType: string;
}

interface MessageInput {
  chatRoomId: number;
  sender: string;
  contentType: string;
  rawContent: string;
  imagePath?: string;
  ocrText?: string;
}

interface ParsedOrderInput {
  messageId: number;
  origin?: string;
  destination?: string;
  cargo?: string;
  deadline?: string;
  requestedPrice?: number;
  vehicleType?: string;
  specialNotes?: string;
  confidence?: number;
  status?: string;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  insertChatRoom(input: ChatRoomInput): number {
    const result = this.db
      .prepare("INSERT INTO chat_rooms (room_name, room_type) VALUES (?, ?)")
      .run(input.roomName, input.roomType);
    return result.lastInsertRowid as number;
  }

  getChatRoom(id: number) {
    return this.db.prepare("SELECT * FROM chat_rooms WHERE id = ?").get(id) as any;
  }

  getAllChatRooms() {
    return this.db.prepare("SELECT * FROM chat_rooms WHERE is_active = 1").all();
  }

  insertMessage(input: MessageInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO messages (chat_room_id, sender, content_type, raw_content, image_path, ocr_text)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.chatRoomId, input.sender, input.contentType, input.rawContent, input.imagePath ?? null, input.ocrText ?? null);
    return result.lastInsertRowid as number;
  }

  getMessagesByChatRoom(chatRoomId: number, limit = 50) {
    return this.db
      .prepare("SELECT * FROM messages WHERE chat_room_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(chatRoomId, limit);
  }

  markMessageAsOrder(id: number) {
    this.db.prepare("UPDATE messages SET is_order = 1 WHERE id = ?").run(id);
  }

  insertParsedOrder(input: ParsedOrderInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO parsed_orders (message_id, origin, destination, cargo, deadline, requested_price, vehicle_type, special_notes, confidence, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.messageId,
        input.origin ?? null,
        input.destination ?? null,
        input.cargo ?? null,
        input.deadline ?? null,
        input.requestedPrice ?? null,
        input.vehicleType ?? null,
        input.specialNotes ?? null,
        input.confidence ?? null,
        input.status ?? "PENDING"
      );
    return result.lastInsertRowid as number;
  }

  getOrder(id: number) {
    return this.db.prepare("SELECT * FROM parsed_orders WHERE id = ?").get(id) as any;
  }

  getOrdersByStatus(status: string) {
    return this.db
      .prepare(
        `SELECT po.*, m.sender, m.raw_content, m.image_path, cr.room_name
         FROM parsed_orders po
         JOIN messages m ON po.message_id = m.id
         JOIN chat_rooms cr ON m.chat_room_id = cr.id
         WHERE po.status = ?
         ORDER BY po.created_at DESC`
      )
      .all(status);
  }

  updateOrderStatus(id: number, status: string) {
    this.db.prepare("UPDATE parsed_orders SET status = ? WHERE id = ?").run(status, id);
  }

  updateOrderFields(id: number, fields: Partial<ParsedOrderInput>) {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      sets.push(`${col} = ?`);
      values.push(value);
    }
    values.push(id);
    this.db.prepare(`UPDATE parsed_orders SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  insertDispatchLog(orderId: number, targetApp: string, payload: string, responseCode?: number, error?: string): number {
    const result = this.db
      .prepare(
        `INSERT INTO dispatch_logs (order_id, target_app, request_payload, response_code, error_message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(orderId, targetApp, payload, responseCode ?? null, error ?? null);
    return result.lastInsertRowid as number;
  }

  getDispatchLogs(orderId?: number) {
    if (orderId) {
      return this.db.prepare("SELECT * FROM dispatch_logs WHERE order_id = ? ORDER BY sent_at DESC").all(orderId);
    }
    return this.db.prepare("SELECT * FROM dispatch_logs ORDER BY sent_at DESC LIMIT 100").all();
  }

  close() {
    this.db.close();
  }
}
```

**Step 5: 테스트 실행 확인 (통과)**

```bash
npx jest src/db/__tests__/database.test.ts
```
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/db/
git commit -m "feat: add SQLite database layer with schema and CRUD operations"
```

---

## Task 3: AI 서비스 (2단계 분류 + 파싱)

**Files:**
- Create: `src/ai/classifier.ts`
- Create: `src/ai/parser.ts`
- Create: `src/ai/prompts.ts`
- Create: `src/ai/__tests__/ai-service.test.ts`

**Step 1: 프롬프트 정의**

`src/ai/prompts.ts`:
```typescript
export const CLASSIFY_PROMPT = `당신은 물류/배송 주문 메시지를 분류하는 AI입니다.

다음 카카오톡 메시지가 물류 배송 주문인지 판단하세요.

주문으로 판단하는 기준:
- 출발지와 도착지가 포함된 배송/운송 요청
- 물품 운송, 퀵서비스, 화물 관련 요청
- 운송장, 송장, 배송 주문서 관련 내용

주문이 아닌 것:
- 일상 대화, 인사, 감사 표현
- 단순 질문이나 확인 ("네", "알겠습니다", "감사합니다")
- 물류와 무관한 내용

반드시 JSON으로만 응답하세요:
{"isOrder": true} 또는 {"isOrder": false}`;

export const PARSE_PROMPT = `당신은 물류 배송 주문 메시지에서 정보를 추출하는 AI입니다.

다음 카카오톡 메시지에서 배송 주문 정보를 추출하세요.

추출할 필드:
- origin: 출발지 (주소를 최대한 구체적으로)
- destination: 도착지 (주소를 최대한 구체적으로)
- cargo: 물품 정보 (종류, 수량, 크기 등)
- deadline: 마감 시간 (있는 경우)
- requestedPrice: 요청 금액 (숫자, 원 단위. 없으면 null)
- vehicleType: 차량 종류 (라보, 1톤, 2.5톤 등. 없으면 null)
- specialNotes: 특이사항 (취급주의, 냉장 등. 없으면 null)

반드시 JSON으로만 응답하세요:
{
  "origin": "string 또는 null",
  "destination": "string 또는 null",
  "cargo": "string 또는 null",
  "deadline": "string 또는 null",
  "requestedPrice": number 또는 null,
  "vehicleType": "string 또는 null",
  "specialNotes": "string 또는 null",
  "confidence": 0.0~1.0
}`;
```

**Step 2: 테스트 작성**

`src/ai/__tests__/ai-service.test.ts`:
```typescript
import { ClassifierService } from "../classifier";
import { ParserService } from "../parser";

// Mock Anthropic SDK
jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

describe("ClassifierService", () => {
  let classifier: ClassifierService;

  beforeEach(() => {
    classifier = new ClassifierService("fake-key");
  });

  test("classifies order message as true", async () => {
    const mockResponse = { content: [{ type: "text", text: '{"isOrder": true}' }] };
    (classifier as any).client.messages.create.mockResolvedValue(mockResponse);

    const result = await classifier.classify("강남역에서 부산역 박스 2개 보내주세요");
    expect(result).toBe(true);
  });

  test("classifies non-order message as false", async () => {
    const mockResponse = { content: [{ type: "text", text: '{"isOrder": false}' }] };
    (classifier as any).client.messages.create.mockResolvedValue(mockResponse);

    const result = await classifier.classify("네 알겠습니다 감사합니다");
    expect(result).toBe(false);
  });
});

describe("ParserService", () => {
  let parser: ParserService;

  beforeEach(() => {
    parser = new ParserService("fake-key");
  });

  test("parses order message into structured data", async () => {
    const mockParsed = {
      origin: "서울 강남구 역삼동",
      destination: "부산 해운대구",
      cargo: "박스 3개 (전자제품)",
      deadline: "오후 3시",
      requestedPrice: 350000,
      vehicleType: null,
      specialNotes: null,
      confidence: 0.92,
    };
    const mockResponse = { content: [{ type: "text", text: JSON.stringify(mockParsed) }] };
    (parser as any).client.messages.create.mockResolvedValue(mockResponse);

    const result = await parser.parse("역삼동에서 해운대 박스3개 전자제품 35만 오후3시까지");
    expect(result.origin).toBe("서울 강남구 역삼동");
    expect(result.destination).toBe("부산 해운대구");
    expect(result.requestedPrice).toBe(350000);
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});
```

**Step 3: 테스트 실행 (실패)**

```bash
npx jest src/ai/__tests__/ai-service.test.ts
```
Expected: FAIL - modules not found

**Step 4: Classifier 구현**

`src/ai/classifier.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFY_PROMPT } from "./prompts";

export class ClassifierService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(message: string): Promise<boolean> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text);
    return result.isOrder === true;
  }

  async classifyImage(imageBase64: string, mediaType: "image/jpeg" | "image/png"): Promise<boolean> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: CLASSIFY_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "이 이미지가 물류 주문 관련인지 판단하세요." },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text);
    return result.isOrder === true;
  }
}
```

**Step 5: Parser 구현**

`src/ai/parser.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { PARSE_PROMPT } from "./prompts";

export interface ParsedOrder {
  origin: string | null;
  destination: string | null;
  cargo: string | null;
  deadline: string | null;
  requestedPrice: number | null;
  vehicleType: string | null;
  specialNotes: string | null;
  confidence: number;
}

export class ParserService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async parse(message: string): Promise<ParsedOrder> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: PARSE_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return JSON.parse(text) as ParsedOrder;
  }

  async parseImage(imageBase64: string, mediaType: "image/jpeg" | "image/png"): Promise<ParsedOrder> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: PARSE_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "이 이미지에서 물류 배송 주문 정보를 추출하세요." },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return JSON.parse(text) as ParsedOrder;
  }
}
```

**Step 6: 테스트 실행 (통과)**

```bash
npx jest src/ai/__tests__/ai-service.test.ts
```
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/ai/
git commit -m "feat: add AI classifier (Haiku) and parser (Sonnet) services"
```

---

## Task 4: Python 카카오톡 Monitor

**Files:**
- Create: `python/requirements.txt`
- Create: `python/monitor.py`
- Create: `python/katalk_reader.py`
- Create: `python/tests/test_katalk_reader.py`

**Step 1: Python 의존성 정의**

`python/requirements.txt`:
```
pywinauto==0.6.8
watchdog==4.0.0
```

**Step 2: 테스트 작성**

`python/tests/test_katalk_reader.py`:
```python
import unittest
import json
from unittest.mock import MagicMock, patch
from katalk_reader import KatalkReader, Message


class TestKatalkReader(unittest.TestCase):
    def test_message_to_json(self):
        msg = Message(
            room_name="강남물류방",
            sender="화주김",
            content="역삼동에서 해운대 박스3개",
            content_type="text",
            image_path=None,
        )
        result = json.loads(msg.to_json())
        self.assertEqual(result["room_name"], "강남물류방")
        self.assertEqual(result["sender"], "화주김")
        self.assertEqual(result["content_type"], "text")

    def test_detect_new_messages(self):
        reader = KatalkReader.__new__(KatalkReader)
        reader.last_messages = {"강남물류방": "이전 메시지 해시"}

        # 새 메시지가 있으면 True
        new_hash = "새로운 메시지 해시"
        self.assertTrue(reader._is_new_message("강남물류방", new_hash))

        # 같은 해시면 False
        self.assertFalse(reader._is_new_message("강남물류방", "이전 메시지 해시"))

    def test_parse_chat_text(self):
        reader = KatalkReader.__new__(KatalkReader)
        raw_text = "[화주김] [오후 2:30] 역삼동에서 해운대 박스3개 35만"
        result = reader._parse_chat_line(raw_text)
        self.assertEqual(result["sender"], "화주김")
        self.assertIn("역삼동", result["content"])


if __name__ == "__main__":
    unittest.main()
```

**Step 3: 테스트 실행 (실패)**

```bash
cd python && python -m pytest tests/test_katalk_reader.py -v
```
Expected: FAIL - module not found

**Step 4: KatalkReader 구현**

`python/katalk_reader.py`:
```python
import json
import hashlib
import re
import time
import os
import sys
from dataclasses import dataclass, asdict
from typing import Optional

try:
    import pywinauto
    from pywinauto import Application
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False


@dataclass
class Message:
    room_name: str
    sender: str
    content: str
    content_type: str  # "text" or "image"
    image_path: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


class KatalkReader:
    def __init__(self):
        self.last_messages: dict[str, str] = {}
        self.app = None
        self.chat_window = None

    def connect(self) -> bool:
        """카카오톡 PC 앱에 연결"""
        if not HAS_PYWINAUTO:
            print(json.dumps({"error": "pywinauto not installed"}), flush=True)
            return False
        try:
            self.app = Application(backend="uia").connect(title_re=".*카카오톡.*")
            self.chat_window = self.app.window(title_re=".*카카오톡.*")
            return True
        except Exception as e:
            print(json.dumps({"error": f"카카오톡 연결 실패: {str(e)}"}), flush=True)
            return False

    def _is_new_message(self, room_name: str, message_hash: str) -> bool:
        """새 메시지인지 해시 비교로 확인"""
        if room_name not in self.last_messages:
            self.last_messages[room_name] = message_hash
            return True
        if self.last_messages[room_name] != message_hash:
            self.last_messages[room_name] = message_hash
            return True
        return False

    def _parse_chat_line(self, raw_text: str) -> dict:
        """카카오톡 채팅 라인을 파싱"""
        pattern = r"\[(.+?)\]\s*\[(.+?)\]\s*(.*)"
        match = re.match(pattern, raw_text)
        if match:
            return {
                "sender": match.group(1),
                "time": match.group(2),
                "content": match.group(3),
            }
        return {"sender": "unknown", "time": "", "content": raw_text}

    def _get_message_hash(self, messages: list[str]) -> str:
        """메시지 목록의 해시 생성"""
        combined = "".join(messages[-5:])  # 마지막 5개 메시지만
        return hashlib.md5(combined.encode()).hexdigest()

    def read_room(self, room_name: str) -> list[Message]:
        """특정 채팅방의 새 메시지 읽기"""
        if not self.chat_window:
            return []

        try:
            # 채팅 목록에서 방 찾기
            chat_list = self.chat_window.child_window(control_type="List")
            for item in chat_list.items():
                if room_name in item.window_text():
                    item.click_input()
                    time.sleep(0.5)
                    break
            else:
                return []

            # 대화 내용 읽기
            msg_list = self.chat_window.child_window(control_type="List", found_index=1)
            raw_messages = []
            for msg_item in msg_list.items():
                text = msg_item.window_text()
                if text.strip():
                    raw_messages.append(text)

            # 새 메시지 확인
            msg_hash = self._get_message_hash(raw_messages)
            if not self._is_new_message(room_name, msg_hash):
                return []

            # 새 메시지들 파싱
            new_messages = []
            for raw in raw_messages[-10:]:  # 최근 10개만
                parsed = self._parse_chat_line(raw)
                new_messages.append(
                    Message(
                        room_name=room_name,
                        sender=parsed["sender"],
                        content=parsed["content"],
                        content_type="text",
                    )
                )
            return new_messages
        except Exception as e:
            print(json.dumps({"error": f"방 읽기 실패 ({room_name}): {str(e)}"}), flush=True)
            return []

    def check_image_cache(self, cache_dir: str) -> list[str]:
        """카톡 이미지 캐시 폴더에서 새 이미지 감지"""
        if not os.path.exists(cache_dir):
            return []
        images = []
        for f in os.listdir(cache_dir):
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
                full_path = os.path.join(cache_dir, f)
                # 최근 60초 내 생성된 파일만
                if time.time() - os.path.getmtime(full_path) < 60:
                    images.append(full_path)
        return images
```

**Step 5: Monitor 메인 루프 작성**

`python/monitor.py`:
```python
"""
카카오톡 모니터링 메인 프로세스.
stdout으로 JSON 메시지를 출력하여 Electron main process와 통신.

출력 프로토콜:
  {"type": "message", "data": {...}}    새 메시지
  {"type": "image", "data": {...}}      새 이미지
  {"type": "status", "data": {...}}     상태 정보
  {"type": "error", "data": {...}}      에러
"""

import json
import sys
import time
import os
from katalk_reader import KatalkReader, Message


def emit(msg_type: str, data: dict):
    """Electron으로 메시지 전송 (stdout JSON)"""
    output = json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
    print(output, flush=True)


def load_config() -> dict:
    """설정 파일에서 모니터링 대상 방 목록 로드"""
    config_path = os.environ.get("MONITOR_CONFIG", "monitor_config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "rooms": [],
        "poll_interval": 3,
        "image_cache_dir": "",
    }


def main():
    emit("status", {"message": "모니터 시작 중..."})

    config = load_config()
    rooms = config.get("rooms", [])
    poll_interval = config.get("poll_interval", 3)

    if not rooms:
        emit("error", {"message": "모니터링할 채팅방이 설정되지 않았습니다."})
        emit("status", {"message": "대기 중 - 채팅방을 설정해주세요."})
        # 설정 변경 대기
        while True:
            time.sleep(5)
            config = load_config()
            rooms = config.get("rooms", [])
            if rooms:
                break

    reader = KatalkReader()

    if not reader.connect():
        emit("error", {"message": "카카오톡 PC에 연결할 수 없습니다. 카카오톡을 실행해주세요."})
        sys.exit(1)

    emit("status", {"message": f"카카오톡 연결 완료. {len(rooms)}개 방 모니터링 시작."})

    while True:
        for room_name in rooms:
            try:
                messages = reader.read_room(room_name)
                for msg in messages:
                    emit("message", json.loads(msg.to_json()))
            except Exception as e:
                emit("error", {"message": f"방 모니터링 오류 ({room_name}): {str(e)}"})

            time.sleep(poll_interval)

        # 이미지 캐시 확인
        image_cache = config.get("image_cache_dir", "")
        if image_cache:
            try:
                new_images = reader.check_image_cache(image_cache)
                for img_path in new_images:
                    emit("image", {"path": img_path})
            except Exception as e:
                emit("error", {"message": f"이미지 캐시 확인 오류: {str(e)}"})


if __name__ == "__main__":
    main()
```

**Step 6: 테스트 실행 (통과)**

```bash
cd python && python -m pytest tests/test_katalk_reader.py -v
```
Expected: All tests PASS

**Step 7: Commit**

```bash
git add python/
git commit -m "feat: add Python KakaoTalk monitor with UI Automation reader"
```

---

## Task 5: Electron ↔ Python 브릿지

**Files:**
- Create: `src/bridge/python-bridge.ts`
- Create: `src/bridge/__tests__/python-bridge.test.ts`

**Step 1: 테스트 작성**

`src/bridge/__tests__/python-bridge.test.ts`:
```typescript
import { PythonBridge, MonitorMessage } from "../python-bridge";

describe("PythonBridge", () => {
  test("parses valid JSON message from stdout", () => {
    const bridge = new PythonBridge("echo test");
    const raw = '{"type": "message", "data": {"room_name": "테스트방", "sender": "화주김", "content": "역삼동에서 부산"}}';
    const result = bridge.parseMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("message");
    expect(result!.data.room_name).toBe("테스트방");
  });

  test("returns null for invalid JSON", () => {
    const bridge = new PythonBridge("echo test");
    const result = bridge.parseMessage("not json");
    expect(result).toBeNull();
  });

  test("returns null for empty line", () => {
    const bridge = new PythonBridge("echo test");
    const result = bridge.parseMessage("");
    expect(result).toBeNull();
  });
});
```

**Step 2: 테스트 실행 (실패)**

```bash
npx jest src/bridge/__tests__/python-bridge.test.ts
```
Expected: FAIL - module not found

**Step 3: PythonBridge 구현**

`src/bridge/python-bridge.ts`:
```typescript
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";

export interface MonitorMessage {
  type: "message" | "image" | "status" | "error";
  data: Record<string, unknown>;
}

export class PythonBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private pythonCommand: string;
  private scriptPath: string;
  private configPath: string;

  constructor(pythonCommand = "python", scriptDir?: string) {
    super();
    this.pythonCommand = pythonCommand;
    this.scriptPath = path.join(scriptDir ?? path.join(__dirname, "../../python"), "monitor.py");
    this.configPath = path.join(scriptDir ?? path.join(__dirname, "../../python"), "monitor_config.json");
  }

  parseMessage(raw: string): MonitorMessage | null {
    if (!raw || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed.type && parsed.data) {
        return parsed as MonitorMessage;
      }
      return null;
    } catch {
      return null;
    }
  }

  start(): void {
    this.process = spawn(this.pythonCommand, [this.scriptPath], {
      env: { ...process.env, MONITOR_CONFIG: this.configPath },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    this.process.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const msg = this.parseMessage(line);
        if (msg) {
          this.emit(msg.type, msg.data);
        }
      }
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.emit("error", { message: chunk.toString("utf-8") });
    });

    this.process.on("exit", (code) => {
      this.emit("exit", { code });
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
```

**Step 4: 테스트 실행 (통과)**

```bash
npx jest src/bridge/__tests__/python-bridge.test.ts
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/bridge/
git commit -m "feat: add Python-Electron bridge for KakaoTalk monitor IPC"
```

---

## Task 6: 메시지 처리 파이프라인 (Electron Main Process)

**Files:**
- Create: `src/pipeline/message-pipeline.ts`
- Create: `src/pipeline/__tests__/message-pipeline.test.ts`
- Modify: `electron/main.ts`

**Step 1: 테스트 작성**

`src/pipeline/__tests__/message-pipeline.test.ts`:
```typescript
import { MessagePipeline } from "../message-pipeline";

// Mocks
const mockDb = {
  insertChatRoom: jest.fn().mockReturnValue(1),
  getChatRoom: jest.fn(),
  insertMessage: jest.fn().mockReturnValue(1),
  markMessageAsOrder: jest.fn(),
  insertParsedOrder: jest.fn().mockReturnValue(1),
  updateOrderStatus: jest.fn(),
  getAllChatRooms: jest.fn().mockReturnValue([]),
};

const mockClassifier = {
  classify: jest.fn(),
  classifyImage: jest.fn(),
};

const mockParser = {
  parse: jest.fn(),
  parseImage: jest.fn(),
};

describe("MessagePipeline", () => {
  let pipeline: MessagePipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new MessagePipeline(mockDb as any, mockClassifier as any, mockParser as any);
  });

  test("processes order message through full pipeline", async () => {
    mockClassifier.classify.mockResolvedValue(true);
    mockParser.parse.mockResolvedValue({
      origin: "서울 역삼동",
      destination: "부산 해운대",
      cargo: "박스 3개",
      confidence: 0.9,
    });

    const result = await pipeline.processMessage({
      room_name: "물류방",
      sender: "화주김",
      content: "역삼동에서 해운대 박스3개",
      content_type: "text",
    });

    expect(result).not.toBeNull();
    expect(result!.origin).toBe("서울 역삼동");
    expect(mockDb.markMessageAsOrder).toHaveBeenCalled();
    expect(mockDb.insertParsedOrder).toHaveBeenCalled();
  });

  test("skips non-order messages", async () => {
    mockClassifier.classify.mockResolvedValue(false);

    const result = await pipeline.processMessage({
      room_name: "물류방",
      sender: "화주김",
      content: "네 알겠습니다~",
      content_type: "text",
    });

    expect(result).toBeNull();
    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(mockDb.insertParsedOrder).not.toHaveBeenCalled();
  });
});
```

**Step 2: 테스트 실행 (실패)**

```bash
npx jest src/pipeline/__tests__/message-pipeline.test.ts
```
Expected: FAIL - module not found

**Step 3: MessagePipeline 구현**

`src/pipeline/message-pipeline.ts`:
```typescript
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

  constructor(db: Database, classifier: ClassifierService, parser: ParserService) {
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
    const id = this.db.insertChatRoom({ roomName, roomType: "group" });
    this.roomIdCache.set(roomName, id);
    return id;
  }

  async processMessage(msg: IncomingMessage): Promise<(ParsedOrder & { orderId: number; messageId: number }) | null> {
    const roomId = this.getOrCreateRoomId(msg.room_name);

    // DB에 메시지 저장
    const messageId = this.db.insertMessage({
      chatRoomId: roomId,
      sender: msg.sender,
      contentType: msg.content_type,
      rawContent: msg.content,
      imagePath: msg.image_path,
    });

    // 1단계: 분류
    let isOrder: boolean;
    if (msg.content_type === "image" && msg.image_path) {
      const imageBuffer = fs.readFileSync(msg.image_path);
      const base64 = imageBuffer.toString("base64");
      const ext = msg.image_path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      isOrder = await this.classifier.classifyImage(base64, ext);
    } else {
      isOrder = await this.classifier.classify(msg.content);
    }

    if (!isOrder) {
      return null;
    }

    // 주문으로 마킹
    this.db.markMessageAsOrder(messageId);

    // 2단계: 파싱
    let parsed: ParsedOrder;
    if (msg.content_type === "image" && msg.image_path) {
      const imageBuffer = fs.readFileSync(msg.image_path);
      const base64 = imageBuffer.toString("base64");
      const ext = msg.image_path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      parsed = await this.parser.parseImage(base64, ext);
    } else {
      parsed = await this.parser.parse(msg.content);
    }

    // 파싱 결과 저장
    const orderId = this.db.insertParsedOrder({
      messageId,
      origin: parsed.origin ?? undefined,
      destination: parsed.destination ?? undefined,
      cargo: parsed.cargo ?? undefined,
      deadline: parsed.deadline ?? undefined,
      requestedPrice: parsed.requestedPrice ?? undefined,
      vehicleType: parsed.vehicleType ?? undefined,
      specialNotes: parsed.specialNotes ?? undefined,
      confidence: parsed.confidence,
      status: "READY",
    });

    return { ...parsed, orderId, messageId };
  }
}
```

**Step 4: 테스트 실행 (통과)**

```bash
npx jest src/pipeline/__tests__/message-pipeline.test.ts
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/pipeline/
git commit -m "feat: add message processing pipeline (classify → parse → store)"
```

---

## Task 7: Electron Main Process 통합 (IPC 핸들러)

**Files:**
- Modify: `electron/main.ts`
- Create: `electron/ipc-handlers.ts`

**Step 1: IPC 핸들러 구현**

`electron/ipc-handlers.ts`:
```typescript
import { ipcMain, BrowserWindow } from "electron";
import { Database } from "../src/db/database";
import { PythonBridge } from "../src/bridge/python-bridge";
import { MessagePipeline } from "../src/pipeline/message-pipeline";
import { ClassifierService } from "../src/ai/classifier";
import { ParserService } from "../src/ai/parser";
import path from "path";

export function setupIpcHandlers(mainWindow: BrowserWindow, dbPath: string) {
  const db = new Database(dbPath);
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const classifier = new ClassifierService(apiKey);
  const parser = new ParserService(apiKey);
  const pipeline = new MessagePipeline(db, classifier, parser);

  // Python Monitor 시작
  const bridge = new PythonBridge("python", path.join(__dirname, "../python"));

  bridge.on("message", async (data) => {
    const result = await pipeline.processMessage(data as any);
    if (result) {
      mainWindow.webContents.send("new-order", {
        ...result,
        sender: data.sender,
        roomName: data.room_name,
        rawContent: data.content,
      });
    }
  });

  bridge.on("image", async (data) => {
    const result = await pipeline.processMessage({
      room_name: "이미지",
      sender: "unknown",
      content: "",
      content_type: "image",
      image_path: data.path as string,
    } as any);
    if (result) {
      mainWindow.webContents.send("new-order", result);
    }
  });

  bridge.on("status", (data) => {
    mainWindow.webContents.send("monitor-status", data);
  });

  bridge.on("error", (data) => {
    mainWindow.webContents.send("monitor-error", data);
  });

  bridge.start();

  // IPC Handlers
  ipcMain.handle("get-orders", (_event, status?: string) => {
    if (status) {
      return db.getOrdersByStatus(status);
    }
    return [
      ...db.getOrdersByStatus("READY"),
      ...db.getOrdersByStatus("CONFIRMED"),
    ];
  });

  ipcMain.handle("get-chat-rooms", () => {
    return db.getAllChatRooms();
  });

  ipcMain.handle("confirm-order", (_event, orderId: number, data: Record<string, unknown>) => {
    db.updateOrderFields(orderId, data);
    db.updateOrderStatus(orderId, "CONFIRMED");
    return { success: true };
  });

  ipcMain.handle("dispatch-order", async (_event, orderId: number, targetApp: string) => {
    db.updateOrderStatus(orderId, "DISPATCHED");
    const order = db.getOrder(orderId);
    db.insertDispatchLog(orderId, targetApp, JSON.stringify(order));
    return { success: true };
  });

  ipcMain.handle("ignore-order", (_event, orderId: number) => {
    db.updateOrderStatus(orderId, "IGNORED");
    return { success: true };
  });

  // 앱 종료 시 정리
  return {
    cleanup: () => {
      bridge.stop();
      db.close();
    },
  };
}
```

**Step 2: Electron main.ts 업데이트**

`electron/main.ts` 수정:
```typescript
import { app, BrowserWindow } from "electron";
import path from "path";
import { setupIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;
let cleanup: (() => void) | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "카톡 물류 주문 관리",
  });

  const dbPath = path.join(app.getPath("userData"), "katalk-logistics.db");
  const handlers = setupIpcHandlers(mainWindow, dbPath);
  cleanup = handlers.cleanup;

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  cleanup?.();
  app.quit();
});
```

**Step 3: Commit**

```bash
git add electron/
git commit -m "feat: integrate IPC handlers with monitor bridge and message pipeline"
```

---

## Task 8: 프론트엔드 UI - 주문 관리 화면

**Files:**
- Create: `app/components/OrderFeed.tsx`
- Create: `app/components/OrderCard.tsx`
- Create: `app/components/ChatRoomList.tsx`
- Create: `app/hooks/useOrders.ts`
- Create: `app/types.ts`
- Modify: `app/App.tsx`

**Step 1: 타입 정의**

`app/types.ts`:
```typescript
export interface Order {
  orderId: number;
  messageId: number;
  sender: string;
  roomName: string;
  rawContent: string;
  origin: string | null;
  destination: string | null;
  cargo: string | null;
  deadline: string | null;
  requestedPrice: number | null;
  vehicleType: string | null;
  specialNotes: string | null;
  confidence: number;
  status: string;
  createdAt: string;
}

export interface ChatRoom {
  id: number;
  room_name: string;
  room_type: string;
  is_active: number;
}

declare global {
  interface Window {
    electronAPI: {
      onNewOrder: (callback: (order: Order) => void) => void;
      confirmOrder: (orderId: string, data: unknown) => Promise<{ success: boolean }>;
      dispatchOrder: (orderId: string, targetApp: string) => Promise<{ success: boolean }>;
      ignoreOrder: (orderId: string) => Promise<{ success: boolean }>;
      getOrders: (status?: string) => Promise<Order[]>;
      getChatRooms: () => Promise<ChatRoom[]>;
    };
  }
}
```

**Step 2: useOrders 훅**

`app/hooks/useOrders.ts`:
```typescript
import { useState, useEffect, useCallback } from "react";
import { Order } from "../types";

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("READY");

  const loadOrders = useCallback(async () => {
    if (window.electronAPI) {
      const data = await window.electronAPI.getOrders(filter);
      setOrders(data);
    }
  }, [filter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onNewOrder((order) => {
        setOrders((prev) => [order, ...prev]);
      });
    }
  }, []);

  const confirmOrder = async (orderId: number, data: Record<string, unknown>) => {
    await window.electronAPI?.confirmOrder(String(orderId), data);
    await loadOrders();
  };

  const dispatchOrder = async (orderId: number, targetApp: string) => {
    await window.electronAPI?.dispatchOrder(String(orderId), targetApp);
    await loadOrders();
  };

  const ignoreOrder = async (orderId: number) => {
    await window.electronAPI?.ignoreOrder(String(orderId));
    await loadOrders();
  };

  return { orders, filter, setFilter, confirmOrder, dispatchOrder, ignoreOrder };
}
```

**Step 3: OrderCard 컴포넌트**

`app/components/OrderCard.tsx`:
```tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Order } from "../types";

interface Props {
  order: Order;
  onConfirm: (orderId: number, data: Record<string, unknown>) => void;
  onDispatch: (orderId: number, targetApp: string) => void;
  onIgnore: (orderId: number) => void;
}

const DISPATCH_APPS = ["24시전국특송", "인성퀵", "기타"];

export function OrderCard({ order, onConfirm, onDispatch, onIgnore }: Props) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    origin: order.origin ?? "",
    destination: order.destination ?? "",
    cargo: order.cargo ?? "",
    deadline: order.deadline ?? "",
    requestedPrice: order.requestedPrice?.toString() ?? "",
    vehicleType: order.vehicleType ?? "",
    specialNotes: order.specialNotes ?? "",
  });
  const [selectedApp, setSelectedApp] = useState(DISPATCH_APPS[0]);

  const confidenceColor =
    order.confidence >= 0.8 ? "#22c55e" : order.confidence >= 0.5 ? "#f59e0b" : "#ef4444";

  const handleSave = () => {
    onConfirm(order.orderId, {
      ...fields,
      requestedPrice: fields.requestedPrice ? parseInt(fields.requestedPrice) : null,
    });
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.sender}>
          {order.sender} ({order.roomName})
        </Text>
        <View style={[styles.badge, { backgroundColor: confidenceColor }]}>
          <Text style={styles.badgeText}>{Math.round(order.confidence * 100)}%</Text>
        </View>
      </View>

      <Text style={styles.rawContent}>원본: "{order.rawContent}"</Text>

      <View style={styles.fields}>
        {Object.entries({
          출발지: "origin",
          도착지: "destination",
          물품: "cargo",
          마감: "deadline",
          금액: "requestedPrice",
          차량: "vehicleType",
          특이사항: "specialNotes",
        }).map(([label, key]) => (
          <View key={key} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              style={styles.fieldInput}
              value={fields[key as keyof typeof fields]}
              onChangeText={(v) => setFields((prev) => ({ ...prev, [key]: v }))}
              editable={editing}
              placeholder="(미지정)"
              placeholderTextColor="#9ca3af"
            />
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {editing ? (
          <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
            <Text style={styles.btnText}>저장</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnEdit} onPress={() => setEditing(true)}>
            <Text style={styles.btnText}>수정</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.btnIgnore} onPress={() => onIgnore(order.orderId)}>
          <Text style={styles.btnText}>무시</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnDispatch}
          onPress={() => onDispatch(order.orderId, selectedApp)}
        >
          <Text style={styles.btnTextWhite}>전송 ({selectedApp})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sender: { fontSize: 14, fontWeight: "600", color: "#374151" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  rawContent: {
    fontSize: 12,
    color: "#6b7280",
    backgroundColor: "#f9fafb",
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  fields: { marginBottom: 12 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabel: { width: 60, fontSize: 13, color: "#6b7280", fontWeight: "500" },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: "#111827",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btnEdit: { backgroundColor: "#e5e7eb", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnSave: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnIgnore: { backgroundColor: "#fef2f2", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnDispatch: { backgroundColor: "#2563eb", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnText: { fontSize: 13, fontWeight: "500", color: "#374151" },
  btnTextWhite: { fontSize: 13, fontWeight: "500", color: "#fff" },
});
```

**Step 4: OrderFeed 컴포넌트**

`app/components/OrderFeed.tsx`:
```tsx
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { OrderCard } from "./OrderCard";
import { useOrders } from "../hooks/useOrders";

const TABS = [
  { key: "READY", label: "새 주문" },
  { key: "CONFIRMED", label: "확인됨" },
  { key: "DISPATCHED", label: "전송 완료" },
];

export function OrderFeed() {
  const { orders, filter, setFilter, confirmOrder, dispatchOrder, ignoreOrder } = useOrders();

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, filter === tab.key && styles.activeTab]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.tabText, filter === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.feed}>
        {orders.length === 0 ? (
          <Text style={styles.empty}>주문이 없습니다</Text>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onConfirm={confirmOrder}
              onDispatch={dispatchOrder}
              onIgnore={ignoreOrder}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tab: { paddingHorizontal: 16, paddingVertical: 10 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: "#2563eb" },
  tabText: { fontSize: 14, color: "#6b7280" },
  activeTabText: { color: "#2563eb", fontWeight: "600" },
  feed: { flex: 1, padding: 16 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 40, fontSize: 14 },
});
```

**Step 5: ChatRoomList 컴포넌트**

`app/components/ChatRoomList.tsx`:
```tsx
import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { ChatRoom } from "../types";

export function ChatRoomList() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getChatRooms().then(setRooms);
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>채팅방</Text>
      <FlatList
        data={rooms}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.room}>
            <Text style={styles.roomName}>{item.room_name}</Text>
            <Text style={styles.roomType}>{item.room_type}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>모니터링 중인 방 없음</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 200, borderRightWidth: 1, borderRightColor: "#e5e7eb", padding: 12 },
  title: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 12 },
  room: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  roomName: { fontSize: 13, color: "#111827" },
  roomType: { fontSize: 11, color: "#9ca3af" },
  empty: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 20 },
});
```

**Step 6: App.tsx 업데이트**

`app/App.tsx`:
```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ChatRoomList } from "./components/ChatRoomList";
import { OrderFeed } from "./components/OrderFeed";

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>카톡 물류 주문 관리</Text>
      </View>
      <View style={styles.body}>
        <ChatRoomList />
        <OrderFeed />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    height: 48,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  body: { flex: 1, flexDirection: "row" },
});
```

**Step 7: Commit**

```bash
git add app/
git commit -m "feat: add frontend UI with order feed, order card, and chat room list"
```

---

## Task 9: 배차앱 Dispatch Adapter 레이어

**Files:**
- Create: `src/dispatch/adapter.ts`
- Create: `src/dispatch/adapters/placeholder-adapter.ts`
- Create: `src/dispatch/__tests__/adapter.test.ts`

**Step 1: 테스트 작성**

`src/dispatch/__tests__/adapter.test.ts`:
```typescript
import { DispatchManager } from "../adapter";
import { PlaceholderAdapter } from "../adapters/placeholder-adapter";

describe("DispatchManager", () => {
  test("registers and retrieves adapter", () => {
    const manager = new DispatchManager();
    manager.register("24시전국특송", new PlaceholderAdapter("24시전국특송"));
    expect(manager.getAdapterNames()).toContain("24시전국특송");
  });

  test("dispatches order through adapter", async () => {
    const manager = new DispatchManager();
    manager.register("24시전국특송", new PlaceholderAdapter("24시전국특송"));
    const result = await manager.dispatch("24시전국특송", {
      origin: "서울 역삼동",
      destination: "부산 해운대",
      cargo: "박스 3개",
    });
    expect(result.success).toBe(true);
  });

  test("fails for unregistered adapter", async () => {
    const manager = new DispatchManager();
    const result = await manager.dispatch("없는앱", { origin: "서울" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("등록되지 않은");
  });
});
```

**Step 2: 테스트 실행 (실패)**

```bash
npx jest src/dispatch/__tests__/adapter.test.ts
```
Expected: FAIL

**Step 3: Adapter 인터페이스 및 매니저 구현**

`src/dispatch/adapter.ts`:
```typescript
export interface DispatchPayload {
  origin?: string;
  destination?: string;
  cargo?: string;
  deadline?: string;
  requestedPrice?: number;
  vehicleType?: string;
  specialNotes?: string;
}

export interface DispatchResult {
  success: boolean;
  responseCode?: number;
  error?: string;
  rawResponse?: string;
}

export interface DispatchAdapter {
  name: string;
  dispatch(payload: DispatchPayload): Promise<DispatchResult>;
}

export class DispatchManager {
  private adapters: Map<string, DispatchAdapter> = new Map();

  register(name: string, adapter: DispatchAdapter): void {
    this.adapters.set(name, adapter);
  }

  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  async dispatch(targetApp: string, payload: DispatchPayload): Promise<DispatchResult> {
    const adapter = this.adapters.get(targetApp);
    if (!adapter) {
      return { success: false, error: `등록되지 않은 배차앱: ${targetApp}` };
    }

    // 3회 재시도
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await adapter.dispatch(payload);
        if (result.success) return result;
        if (attempt === 3) return result;
      } catch (err) {
        if (attempt === 3) {
          return { success: false, error: `전송 실패 (3회 시도): ${String(err)}` };
        }
      }
    }

    return { success: false, error: "알 수 없는 오류" };
  }
}
```

**Step 4: Placeholder Adapter 구현**

`src/dispatch/adapters/placeholder-adapter.ts`:
```typescript
import { DispatchAdapter, DispatchPayload, DispatchResult } from "../adapter";

/**
 * Placeholder adapter - 실제 배차 앱 API가 확인되면 교체.
 * 현재는 성공을 반환하고 로그만 남김.
 */
export class PlaceholderAdapter implements DispatchAdapter {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
    console.log(`[${this.name}] 주문 전송:`, JSON.stringify(payload, null, 2));
    return {
      success: true,
      responseCode: 200,
      rawResponse: JSON.stringify({ message: "placeholder - 실제 API 연동 필요" }),
    };
  }
}
```

**Step 5: 테스트 실행 (통과)**

```bash
npx jest src/dispatch/__tests__/adapter.test.ts
```
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/dispatch/
git commit -m "feat: add dispatch adapter layer with retry logic and placeholder adapter"
```

---

## Task 10: 통합 테스트 및 설정 파일

**Files:**
- Create: `python/monitor_config.json`
- Create: `.env.example`
- Modify: `package.json` (빌드 스크립트)

**Step 1: 설정 파일 생성**

`python/monitor_config.json`:
```json
{
  "rooms": ["강남물류방", "부산화물방"],
  "poll_interval": 3,
  "image_cache_dir": ""
}
```

`.env.example`:
```
ANTHROPIC_API_KEY=your-api-key-here
```

**Step 2: 전체 테스트 실행**

```bash
npx jest --coverage
```
Expected: All test suites PASS

**Step 3: Python 테스트 실행**

```bash
cd python && python -m pytest tests/ -v
```
Expected: All tests PASS

**Step 4: 빌드 확인**

```bash
npm run build
```
Expected: Webpack + TypeScript 빌드 성공

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add config files, env example, and verify full test suite"
```

---

## 실행 순서 요약

```
Task 1: 프로젝트 초기화 (Electron + React Native Web)
Task 2: SQLite DB 레이어
Task 3: AI 서비스 (분류 + 파싱)
Task 4: Python 카톡 Monitor
Task 5: Electron ↔ Python 브릿지
Task 6: 메시지 처리 파이프라인
Task 7: Electron Main 통합 (IPC)
Task 8: 프론트엔드 UI
Task 9: 배차앱 Dispatch Adapter
Task 10: 통합 테스트 & 설정
```

**의존 관계:**
- Task 2, 3, 4는 독립적으로 병렬 진행 가능
- Task 5는 Task 4에 의존
- Task 6은 Task 2, 3에 의존
- Task 7은 Task 5, 6에 의존
- Task 8은 Task 7에 의존
- Task 9는 독립적
- Task 10은 전체 완료 후
