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
