import Anthropic from "@anthropic-ai/sdk";
import { PARSE_PROMPT } from "./prompts";

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export interface ParsedOrder {
  origin: string | null;
  destination: string | null;
  cargo: string | null;
  deadline: string | null;
  requestedPrice: number | null;
  vehicleType: string | null;
  specialNotes: string | null;
  confidence: number;
}

export class ParserService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async parse(message: string): Promise<ParsedOrder> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: PARSE_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content[0];
    if (textBlock.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    return JSON.parse(extractJson(textBlock.text)) as ParsedOrder;
  }

  async parseImage(
    imageBase64: string,
    mediaType: "image/jpeg" | "image/png"
  ): Promise<ParsedOrder> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: PARSE_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
    });

    const textBlock = response.content[0];
    if (textBlock.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    return JSON.parse(extractJson(textBlock.text)) as ParsedOrder;
  }
}
