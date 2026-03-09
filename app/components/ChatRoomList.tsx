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
