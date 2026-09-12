import Anthropic from "@anthropic-ai/sdk";
import { ProjectProfile, TestCase } from "./types";

const MODEL = "claude-sonnet-4-5-20250929";
const MCP_BETA = "mcp-client-2025-04-04";

function buildPrompt(testCase: TestCase, url: string, profile: ProjectProfile): string {
  const testDir = profile.existingTestDir ?? "tests/generated";
  const baseUrlNote = profile.existingBaseUrl
    ? `The host project already defines baseURL "${profile.existingBaseUrl}" in its Playwright config. Navigate with a relative path from that baseURL where possible instead of hardcoding the full URL.`
    : `No baseURL is configured in the host project; navigate directly to the full URL: ${url}`;

  return `You have access to a live Playwright MCP browser. Use its tools to:
1. Navigate to: ${url}
2. Perform these steps, inspecting the real page (accessibility snapshot / DOM) to find real, stable locators (prefer role/text/label-based locators over brittle CSS/XPath):
${testCase.steps.map((s, i) => `   ${i + 1}. ${s}`).join("\n")}
3. Verify this expected result actually happens on the real page: "${testCase.expectedResult}"

${baseUrlNote}

After exploring, respond with ONLY the body of a single Playwright Test (TypeScript) spec file — no markdown fences, no prose before or after. Requirements for the code:
- Import from "@playwright/test": \`import { test, expect } from '@playwright/test';\`
- One test: \`test('${testCase.title.replace(/'/g, "\\'")}', async ({ page }) => { ... });\`
- Use the REAL locators you discovered via the MCP tools (e.g. page.getByRole(...), page.getByText(...), page.getByLabel(...)).
- Include at least one \`expect(...)\` assertion that verifies the expected result stated above.
- The test must be self-contained and runnable via \`npx playwright test\` with no other setup.
- This file will be saved as ${testDir}/TC-${testCase.id}.spec.ts in a project where usesTypeScript=${profile.usesTypeScript}.`;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:ts|typescript)?\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export class ScriptGenerator {
  private client: Anthropic;
  private mcpUrl: string;

  constructor(apiKey: string, mcpUrl: string) {
    this.client = new Anthropic({ apiKey });
    this.mcpUrl = mcpUrl;
  }

  async generate(testCase: TestCase, url: string, profile: ProjectProfile): Promise<string> {
    const prompt = buildPrompt(testCase, url, profile);

    // MCP connector is a beta feature of the Messages API: the exact request
    // shape (mcp_servers / beta flag name) can move between SDK versions —
    // verify against the installed @anthropic-ai/sdk version if this errors.
    const response = await (this.client as any).beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      betas: [MCP_BETA],
      mcp_servers: [
        {
          type: "url",
          url: this.mcpUrl,
          name: "playwright",
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlocks = (response.content as any[]).filter((b) => b.type === "text");
    if (textBlocks.length === 0) {
      throw new Error(`No text content returned for test case ${testCase.id}.`);
    }
    const finalText = textBlocks[textBlocks.length - 1].text as string;
    const code = stripCodeFences(finalText);

    if (!code.includes("test(") || !code.includes("expect(")) {
      throw new Error(
        `Generated content for ${testCase.id} does not look like a valid Playwright test.`
      );
    }
    return code;
  }

  static buildStub(testCase: TestCase, reason: string): string {
    return `import { test } from '@playwright/test';

test('${testCase.title.replace(/'/g, "\\'")} [GENERATION FAILED]', async () => {
  throw new Error(${JSON.stringify(
    `Script generation failed for ${testCase.id}: ${reason}`
  )});
});
`;
  }
}
