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
  const pythonCmd = "C:\\Users\\PC\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";
  const bridge = new PythonBridge(pythonCmd, path.join(__dirname, "../../python"));

  bridge.on("message", async (data) => {
    console.log("[IPC] Got message from monitor:", JSON.stringify(data).slice(0, 200));
    const result = await pipeline.processMessage(data as any);
    console.log("[IPC] Pipeline result:", result ? "ORDER DETECTED" : "not an order");
    if (result) {
      const order = {
        ...result,
        sender: data.sender,
        roomName: data.room_name,
        rawContent: data.content,
      };
      console.log("[IPC] Sending to frontend:", JSON.stringify(order).slice(0, 200));
      mainWindow.webContents.send("new-order", order);
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
    console.log("[IPC] Monitor status:", JSON.stringify(data));
    mainWindow.webContents.send("monitor-status", data);
  });

  bridge.on("error", (data) => {
    console.log("[IPC] Monitor error:", JSON.stringify(data));
    mainWindow.webContents.send("monitor-error", data);
  });

  bridge.on("exit", (data) => {
    console.log("[IPC] Monitor process exited:", JSON.stringify(data));
  });

  console.log("[IPC] Starting Python monitor...");
  bridge.start();
  console.log("[IPC] Python monitor started, isRunning:", bridge.isRunning());

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
