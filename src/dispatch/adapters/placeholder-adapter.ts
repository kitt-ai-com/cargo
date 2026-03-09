import { DispatchAdapter, DispatchPayload, DispatchResult } from "../adapter";

export class PlaceholderAdapter implements DispatchAdapter {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
    console.log(`[${this.name}] 주문 전송:`, JSON.stringify(payload, null, 2));
    return {
      success: true,
      responseCode: 200,
      rawResponse: JSON.stringify({ message: "placeholder - 실제 API 연동 필요" }),
    };
  }
}
