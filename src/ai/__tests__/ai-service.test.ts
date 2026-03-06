jest.mock("@anthropic-ai/sdk");

import Anthropic from "@anthropic-ai/sdk";
import { ClassifierService } from "../classifier";
import { ParserService } from "../parser";

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

function buildMockResponse(text: string) {
  return {
    id: "msg_mock",
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    model: "mock-model",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

let mockCreate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate = jest.fn();
  MockedAnthropic.mockImplementation(
    () =>
      ({
        messages: { create: mockCreate },
      }) as any
  );
});

describe("ClassifierService", () => {
  test("classifies order message as true", async () => {
    mockCreate.mockResolvedValueOnce(
      buildMockResponse('{"isOrder": true}')
    );

    const classifier = new ClassifierService("test-api-key");
    const result = await classifier.classify(
      "서울에서 부산까지 5톤 냉동 화물 내일까지 보내주세요"
    );

    expect(result).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
      })
    );
  });

  test("classifies non-order message as false", async () => {
    mockCreate.mockResolvedValueOnce(
      buildMockResponse('{"isOrder": false}')
    );

    const classifier = new ClassifierService("test-api-key");
    const result = await classifier.classify("안녕하세요, 오늘 날씨 좋네요");

    expect(result).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("ParserService", () => {
  test("parses order message into structured data with correct fields", async () => {
    const parsedData = {
      origin: "서울 강남구",
      destination: "부산 해운대구",
      cargo: "냉동식품 5팔레트",
      deadline: "2026-03-07 오전",
      requestedPrice: 1500000,
      vehicleType: "5톤 냉동탑",
      specialNotes: "하차지 연락처: 010-1234-5678",
      confidence: 0.92,
    };

    mockCreate.mockResolvedValueOnce(
      buildMockResponse(JSON.stringify(parsedData))
    );

    const parser = new ParserService("test-api-key");
    const result = await parser.parse(
      "서울 강남구에서 부산 해운대구까지 냉동식품 5팔레트 5톤 냉동탑 내일 오전까지 150만원 하차지 연락처 010-1234-5678"
    );

    expect(result.origin).toBe("서울 강남구");
    expect(result.destination).toBe("부산 해운대구");
    expect(result.cargo).toBe("냉동식품 5팔레트");
    expect(result.deadline).toBe("2026-03-07 오전");
    expect(result.requestedPrice).toBe(1500000);
    expect(result.vehicleType).toBe("5톤 냉동탑");
    expect(result.specialNotes).toBe("하차지 연락처: 010-1234-5678");
    expect(result.confidence).toBeCloseTo(0.92);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
      })
    );
  });

  test("returns null fields for missing information", async () => {
    const parsedData = {
      origin: "인천",
      destination: null,
      cargo: null,
      deadline: null,
      requestedPrice: null,
      vehicleType: null,
      specialNotes: null,
      confidence: 0.35,
    };

    mockCreate.mockResolvedValueOnce(
      buildMockResponse(JSON.stringify(parsedData))
    );

    const parser = new ParserService("test-api-key");
    const result = await parser.parse("인천에서 화물 보내야 하는데요");

    expect(result.origin).toBe("인천");
    expect(result.destination).toBeNull();
    expect(result.cargo).toBeNull();
    expect(result.deadline).toBeNull();
    expect(result.requestedPrice).toBeNull();
    expect(result.vehicleType).toBeNull();
    expect(result.specialNotes).toBeNull();
    expect(result.confidence).toBeCloseTo(0.35);
  });
});
