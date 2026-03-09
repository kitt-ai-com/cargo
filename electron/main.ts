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
