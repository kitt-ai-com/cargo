import { DispatchManager } from "../adapter";
import { PlaceholderAdapter } from "../adapters/placeholder-adapter";

describe("DispatchManager", () => {
  test("registers and retrieves adapter", () => {
    const manager = new DispatchManager();
    manager.register("24시전국특송", new PlaceholderAdapter("24시전국특송"));
    expect(manager.getAdapterNames()).toContain("24시전국특송");
  });

  test("dispatches order through adapter", async () => {
    const manager = new DispatchManager();
    manager.register("24시전국특송", new PlaceholderAdapter("24시전국특송"));
    const result = await manager.dispatch("24시전국특송", {
      origin: "서울 역삼동",
      destination: "부산 해운대",
      cargo: "박스 3개",
    });
    expect(result.success).toBe(true);
  });

  test("fails for unregistered adapter", async () => {
    const manager = new DispatchManager();
    const result = await manager.dispatch("없는앱", { origin: "서울" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("등록되지 않은");
  });
});
