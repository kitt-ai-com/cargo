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

  return {
    cleanup: () => {
      bridge.stop();
      db.close();
    },
  };
}
