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
