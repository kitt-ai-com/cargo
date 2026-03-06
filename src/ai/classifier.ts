import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFY_PROMPT } from "./prompts";

export class ClassifierService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(message: string): Promise<boolean> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content[0];
    if (textBlock.type !== "text") {
      return false;
    }

    const result = JSON.parse(textBlock.text);
    return result.isOrder === true;
  }

  async classifyImage(
    imageBase64: string,
    mediaType: "image/jpeg" | "image/png"
  ): Promise<boolean> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: CLASSIFY_PROMPT,
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
      return false;
    }

    const result = JSON.parse(textBlock.text);
    return result.isOrder === true;
  }
}
