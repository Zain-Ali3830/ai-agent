#!/usr/bin/env node
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import prompts from "prompts";

import { readSpecFile } from "./specReader";
import { TestCaseGenerator } from "./testCaseGenerator";
import { analyzeRepo } from "./repoAnalyzer";
import { McpBrowser } from "./mcpBrowser";
import { ScriptGenerator } from "./scriptGenerator";
import { TestRunner } from "./testRunner";
import { TestCase, TestResult } from "./types";

dotenv.config();

function printTestCases(testCases: TestCase[]): void {
  console.log("\n===== Generated Test Cases =====\n");
  for (const tc of testCases) {
    console.log(`[${tc.id}] ${tc.title}`);
    console.log("  Steps:");
    tc.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
    console.log(`  Expected Result: ${tc.expectedResult}`);
    console.log("");
  }
  console.log("=================================\n");
}

async function getApprovedTestCases(
  generator: TestCaseGenerator,
  specText: string
): Promise<TestCase[]> {
  let testCases = await generator.generate(specText);

  while (true) {
    printTestCases(testCases);
    const { approved } = await prompts({
      type: "confirm",
      name: "approved",
      message: "Do you approve these test cases?",
      initial: true,
    });

    if (approved) return testCases;

    const { feedback } = await prompts({
      type: "text",
      name: "feedback",
      message: "What changes would you like?",
    });

    if (!feedback) {
      console.log("No feedback given, keeping current test cases as-is.\n");
      continue;
    }

    console.log("\nRegenerating test cases based on your feedback...\n");
    testCases = await generator.regenerate(specText, testCases, feedback);
  }
}

function printResultsAndBuildReport(results: TestResult[]): string {
  console.log("\n===== Test Execution Results =====\n");
  const lines: string[] = [];
  lines.push(`QA Automation Run — ${new Date().toISOString()}`);
  lines.push("");

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const label = r.status === "passed" ? "PASSED" : "FAILED";
    if (r.status === "passed") passed++;
    else failed++;

    console.log(`[${label}] ${r.id} - ${r.title}`);
    lines.push(`[${label}] ${r.id} - ${r.title}`);
    if (r.error) {
      console.log(`         Reason: ${r.error.split("\n")[0]}`);
      lines.push(`  Reason: ${r.error}`);
    }
  }

  const summary = `\nSummary: ${results.length} total, ${passed} passed, ${failed} failed.`;
  console.log(summary);
  lines.push(summary);

  return lines.join("\n") + "\n";
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env and try again.");
    process.exit(1);
  }

  const cwd = process.cwd();

  console.log("=== AI QA Automation Agent ===\n");

  const { specPath } = await prompts({
    type: "text",
    name: "specPath",
    message: "Please provide the path to your specification file (.txt, .pdf, .docx):",
  });
  if (!specPath) {
    console.log("No spec file provided. Exiting.");
    return;
  }

  let specText: string;
  try {
    specText = await readSpecFile(specPath);
  } catch (err: any) {
    console.error(`Failed to read spec file: ${err.message}`);
    return;
  }

  const generator = new TestCaseGenerator(apiKey);
  const testCases = await getApprovedTestCases(generator, specText);
  console.log(`\nApproved ${testCases.length} test case(s).\n`);

  const { url } = await prompts({
    type: "text",
    name: "url",
    message: "Please provide the URL of the website you want to test:",
  });
  if (!url) {
    console.log("No URL provided. Exiting.");
    return;
  }

  const profile = analyzeRepo(cwd);
  const testDir = path.resolve(cwd, profile.existingTestDir ?? "tests/generated");
  fs.mkdirSync(testDir, { recursive: true });

  if (profile.hasPlaywright) {
    console.log(`Detected existing Playwright setup. Using test dir: ${testDir}`);
  } else {
    console.log(`No existing Playwright setup detected. Using default test dir: ${testDir}`);
  }

  const mcpBrowser = new McpBrowser();
  const scriptGenerator = new ScriptGenerator(apiKey, mcpBrowser.mcpUrl);

  console.log("\nStarting Playwright MCP server...");
  await mcpBrowser.start();

  try {
    for (const tc of testCases) {
      console.log(`\nGenerating automation script for ${tc.id}: ${tc.title}...`);
      let code: string;
      try {
        code = await scriptGenerator.generate(tc, url, profile);
      } catch (err: any) {
        console.error(`  Script generation failed for ${tc.id}: ${err.message}`);
        code = ScriptGenerator.buildStub(tc, err.message);
      }
      const filePath = path.join(testDir, `TC-${tc.id}.spec.ts`);
      fs.writeFileSync(filePath, code, "utf-8");
      console.log(`  Written: ${filePath}`);
    }
  } finally {
    console.log("\nStopping Playwright MCP server...");
    await mcpBrowser.stop();
  }

  console.log("\nRunning generated Playwright tests...\n");
  const runner = new TestRunner(testDir);
  let results: TestResult[];
  try {
    results = runner.run();
  } catch (err: any) {
    console.error(`Failed to run/parse Playwright tests: ${err.message}`);
    return;
  }

  const report = printResultsAndBuildReport(results);
  const resultsPath = path.join(cwd, "results.txt");
  fs.writeFileSync(resultsPath, report, "utf-8");
  console.log(`\nFull results written to: ${resultsPath}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
