import { PythonBridge } from "../python-bridge";

describe("PythonBridge", () => {
  test("parses valid JSON message from stdout", () => {
    const bridge = new PythonBridge("echo test");
    const raw = '{"type": "message", "data": {"room_name": "테스트방", "sender": "화주김", "content": "역삼동에서 부산"}}';
    const result = bridge.parseMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("message");
    expect(result!.data.room_name).toBe("테스트방");
  });

  test("returns null for invalid JSON", () => {
    const bridge = new PythonBridge("echo test");
    const result = bridge.parseMessage("not json");
    expect(result).toBeNull();
  });

  test("returns null for empty line", () => {
    const bridge = new PythonBridge("echo test");
    const result = bridge.parseMessage("");
    expect(result).toBeNull();
  });
});
