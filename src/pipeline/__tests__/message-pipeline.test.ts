import { MessagePipeline } from "../message-pipeline";

const mockDb = {
  insertChatRoom: jest.fn().mockReturnValue(1),
  getChatRoom: jest.fn(),
  insertMessage: jest.fn().mockReturnValue(1),
  markMessageAsOrder: jest.fn(),
  insertParsedOrder: jest.fn().mockReturnValue(1),
  updateOrderStatus: jest.fn(),
  getAllChatRooms: jest.fn().mockReturnValue([]),
};

const mockClassifier = {
  classify: jest.fn(),
  classifyImage: jest.fn(),
};

const mockParser = {
  parse: jest.fn(),
  parseImage: jest.fn(),
};

describe("MessagePipeline", () => {
  let pipeline: MessagePipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new MessagePipeline(
      mockDb as any,
      mockClassifier as any,
      mockParser as any
    );
  });

  test("processes order message through full pipeline", async () => {
    mockClassifier.classify.mockResolvedValue(true);
    mockParser.parse.mockResolvedValue({
      origin: "서울 역삼동",
      destination: "부산 해운대",
      cargo: "박스 3개",
      confidence: 0.9,
    });

    const result = await pipeline.processMessage({
      room_name: "물류방",
      sender: "화주김",
      content: "역삼동에서 해운대 박스3개",
      content_type: "text",
    });

    expect(result).not.toBeNull();
    expect(result!.origin).toBe("서울 역삼동");
    expect(mockDb.markMessageAsOrder).toHaveBeenCalled();
    expect(mockDb.insertParsedOrder).toHaveBeenCalled();
  });

  test("skips non-order messages", async () => {
    mockClassifier.classify.mockResolvedValue(false);

    const result = await pipeline.processMessage({
      room_name: "물류방",
      sender: "화주김",
      content: "네 알겠습니다~",
      content_type: "text",
    });

    expect(result).toBeNull();
    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(mockDb.insertParsedOrder).not.toHaveBeenCalled();
  });
});
