import Anthropic from "@anthropic-ai/sdk";
import { TestCase } from "./types";

const MODEL = "claude-sonnet-4-5-20250929";

function buildSystemPrompt(): string {
  return `You are a senior QA engineer. You write clear, detailed UI test cases from a product/feature specification.

Rules:
- Output ONLY a JSON array, no prose, no markdown code fences.
- Each element must have exactly these fields: "id" (string, e.g. "TC-01"), "title" (string), "steps" (array of strings, each one concrete user action), "expectedResult" (string).
- expectedResult MUST be concrete and checkable in a browser: visible text, an element appearing/disappearing, a URL change, a form value, an alert/message, etc. Avoid vague results like "it should work".
- Cover the golden path plus realistic edge cases and validation cases implied by the spec.
- Do not invent features not implied by the spec.`;
}

function extractJsonArray(text: string): TestCase[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Claude did not return a JSON array. Raw response:\n${trimmed}`);
  }
  const jsonSlice = trimmed.slice(start, end + 1);
  const parsed = JSON.parse(jsonSlice);
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed response is not an array.");
  }
  return parsed as TestCase[];
}

export class TestCaseGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(specText: string): Promise<TestCase[]> {
    const message = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `Here is the specification:\n\n"""\n${specText}\n"""\n\nGenerate the UI test cases as a JSON array.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content for test case generation.");
    }
    return extractJsonArray(textBlock.text);
  }

  async regenerate(
    specText: string,
    previousTestCases: TestCase[],
    feedback: string
  ): Promise<TestCase[]> {
    const message = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `Here is the specification:\n\n"""\n${specText}\n"""`,
        },
        {
          role: "assistant",
          content: JSON.stringify(previousTestCases, null, 2),
        },
        {
          role: "user",
          content: `The user reviewed these test cases and requested changes:\n\n"${feedback}"\n\nRegenerate the full JSON array of test cases, applying this feedback. Keep unrelated test cases the same where reasonable.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content for test case regeneration.");
    }
    return extractJsonArray(textBlock.text);
  }
}
