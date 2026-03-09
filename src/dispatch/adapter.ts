export interface DispatchPayload {
  origin?: string;
  destination?: string;
  cargo?: string;
  deadline?: string;
  requestedPrice?: number;
  vehicleType?: string;
  specialNotes?: string;
}

export interface DispatchResult {
  success: boolean;
  responseCode?: number;
  error?: string;
  rawResponse?: string;
}

export interface DispatchAdapter {
  name: string;
  dispatch(payload: DispatchPayload): Promise<DispatchResult>;
}

export class DispatchManager {
  private adapters: Map<string, DispatchAdapter> = new Map();

  register(name: string, adapter: DispatchAdapter): void {
    this.adapters.set(name, adapter);
  }

  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  async dispatch(targetApp: string, payload: DispatchPayload): Promise<DispatchResult> {
    const adapter = this.adapters.get(targetApp);
    if (!adapter) {
      return { success: false, error: `등록되지 않은 배차앱: ${targetApp}` };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await adapter.dispatch(payload);
        if (result.success) return result;
        if (attempt === 3) return result;
      } catch (err) {
        if (attempt === 3) {
          return { success: false, error: `전송 실패 (3회 시도): ${String(err)}` };
        }
      }
    }

    return { success: false, error: "알 수 없는 오류" };
  }
}
