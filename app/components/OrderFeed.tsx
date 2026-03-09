import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { OrderCard } from "./OrderCard";
import { useOrders } from "../hooks/useOrders";

const TABS = [
  { key: "READY", label: "새 주문" },
  { key: "CONFIRMED", label: "확인됨" },
  { key: "DISPATCHED", label: "전송 완료" },
];

interface Props {
  selectedRoom: string | null;
}

export function OrderFeed({ selectedRoom }: Props) {
  const { orders, filter, setFilter, confirmOrder, dispatchOrder, ignoreOrder } = useOrders();

  const filteredOrders = selectedRoom
    ? orders.filter((o) => o.roomName === selectedRoom)
    : orders;

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
        {filteredOrders.length === 0 ? (
          <Text style={styles.empty}>주문이 없습니다</Text>
        ) : (
          filteredOrders.map((order) => (
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
