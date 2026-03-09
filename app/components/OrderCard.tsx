import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Order } from "../types";

interface Props {
  order: Order;
  onConfirm: (orderId: number, data: Record<string, unknown>) => void;
  onDispatch: (orderId: number, targetApp: string) => void;
  onIgnore: (orderId: number) => void;
}

const DISPATCH_APPS = ["24시전국특송", "인성퀵", "기타"];

export function OrderCard({ order, onConfirm, onDispatch, onIgnore }: Props) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    origin: order.origin ?? "",
    destination: order.destination ?? "",
    cargo: order.cargo ?? "",
    deadline: order.deadline ?? "",
    requestedPrice: order.requestedPrice?.toString() ?? "",
    vehicleType: order.vehicleType ?? "",
    specialNotes: order.specialNotes ?? "",
  });
  const [selectedApp, setSelectedApp] = useState(DISPATCH_APPS[0]);

  const confidenceColor =
    order.confidence >= 0.8 ? "#22c55e" : order.confidence >= 0.5 ? "#f59e0b" : "#ef4444";

  const displayTime = order.sentTime || (order.createdAt
    ? new Date(order.createdAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "");

  const handleSave = () => {
    onConfirm(order.orderId, {
      ...fields,
      requestedPrice: fields.requestedPrice ? parseInt(fields.requestedPrice) : null,
    });
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sender}>
            {order.sender} ({order.roomName})
          </Text>
          {displayTime ? <Text style={styles.time}>{displayTime}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: confidenceColor }]}>
          <Text style={styles.badgeText}>{Math.round(order.confidence * 100)}%</Text>
        </View>
      </View>

      <Text style={styles.rawContent}>원본: "{order.rawContent}"</Text>

      <View style={styles.fields}>
        {Object.entries({
          출발지: "origin",
          도착지: "destination",
          물품: "cargo",
          마감: "deadline",
          금액: "requestedPrice",
          차량: "vehicleType",
          특이사항: "specialNotes",
        }).map(([label, key]) => (
          <View key={key} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              style={styles.fieldInput}
              value={fields[key as keyof typeof fields]}
              onChangeText={(v) => setFields((prev) => ({ ...prev, [key]: v }))}
              editable={editing}
              placeholder="(미지정)"
              placeholderTextColor="#9ca3af"
            />
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {editing ? (
          <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
            <Text style={styles.btnText}>저장</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnEdit} onPress={() => setEditing(true)}>
            <Text style={styles.btnText}>수정</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.btnIgnore} onPress={() => onIgnore(order.orderId)}>
          <Text style={styles.btnText}>무시</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnDispatch}
          onPress={() => onDispatch(order.orderId, selectedApp)}
        >
          <Text style={styles.btnTextWhite}>전송 ({selectedApp})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sender: { fontSize: 14, fontWeight: "600", color: "#374151" },
  time: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  rawContent: {
    fontSize: 12,
    color: "#6b7280",
    backgroundColor: "#f9fafb",
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  fields: { marginBottom: 12 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabel: { width: 60, fontSize: 13, color: "#6b7280", fontWeight: "500" },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: "#111827",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btnEdit: { backgroundColor: "#e5e7eb", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnSave: { backgroundColor: "#3b82f6", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnIgnore: { backgroundColor: "#fef2f2", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnDispatch: { backgroundColor: "#2563eb", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnText: { fontSize: 13, fontWeight: "500", color: "#374151" },
  btnTextWhite: { fontSize: 13, fontWeight: "500", color: "#fff" },
});
