import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ChatRoomList } from "./components/ChatRoomList";
import { OrderFeed } from "./components/OrderFeed";

export default function App() {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>카톡 물류 주문 관리</Text>
      </View>
      <View style={styles.body}>
        <ChatRoomList selectedRoom={selectedRoom} onSelectRoom={setSelectedRoom} />
        <OrderFeed selectedRoom={selectedRoom} />
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
