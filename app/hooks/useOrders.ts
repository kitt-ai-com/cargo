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
