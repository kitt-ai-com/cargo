export interface Order {
  orderId: number;
  messageId: number;
  sender: string;
  roomName: string;
  rawContent: string;
  origin: string | null;
  destination: string | null;
  cargo: string | null;
  deadline: string | null;
  requestedPrice: number | null;
  vehicleType: string | null;
  specialNotes: string | null;
  confidence: number;
  status: string;
  sentTime: string;
  createdAt: string;
}

export interface ChatRoom {
  id: number;
  room_name: string;
  room_type: string;
  is_active: number;
}

declare global {
  interface Window {
    electronAPI: {
      onNewOrder: (callback: (order: Order) => void) => void;
      confirmOrder: (orderId: string, data: unknown) => Promise<{ success: boolean }>;
      dispatchOrder: (orderId: string, targetApp: string) => Promise<{ success: boolean }>;
      ignoreOrder: (orderId: string) => Promise<{ success: boolean }>;
      getOrders: (status?: string) => Promise<Order[]>;
      getChatRooms: () => Promise<ChatRoom[]>;
    };
  }
}
