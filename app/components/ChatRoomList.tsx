import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { ChatRoom } from "../types";

interface Props {
  selectedRoom: string | null;
  onSelectRoom: (roomName: string | null) => void;
}

export function ChatRoomList({ selectedRoom, onSelectRoom }: Props) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getChatRooms().then(setRooms);
    }
    // Refresh every 10 seconds to pick up new rooms
    const interval = setInterval(() => {
      if (window.electronAPI) {
        window.electronAPI.getChatRooms().then(setRooms);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>채팅방</Text>
      <TouchableOpacity
        style={[styles.room, !selectedRoom && styles.roomSelected]}
        onPress={() => onSelectRoom(null)}
      >
        <Text style={[styles.roomName, !selectedRoom && styles.roomNameSelected]}>전체</Text>
      </TouchableOpacity>
      <FlatList
        data={rooms}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.room, selectedRoom === item.room_name && styles.roomSelected]}
            onPress={() => onSelectRoom(item.room_name)}
          >
            <Text
              style={[styles.roomName, selectedRoom === item.room_name && styles.roomNameSelected]}
              numberOfLines={1}
            >
              {item.room_name}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>모니터링 중인 방 없음</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 200, borderRightWidth: 1, borderRightColor: "#e5e7eb", padding: 12 },
  title: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 12 },
  room: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, marginBottom: 2 },
  roomSelected: { backgroundColor: "#eff6ff" },
  roomName: { fontSize: 13, color: "#111827" },
  roomNameSelected: { color: "#2563eb", fontWeight: "600" },
  empty: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 20 },
});
