import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { TestResult, TestStatus } from "./types";

interface PlaywrightJsonSuite {
  suites?: PlaywrightJsonSuite[];
  specs?: Array<{
    title: string;
    tests: Array<{
      results: Array<{ status: string; duration: number; error?: { message?: string } }>;
    }>;
  }>;
}

function statusFromPlaywright(status: string): TestStatus {
  if (status === "passed") return "passed";
  if (status === "timedOut") return "timedOut";
  if (status === "skipped") return "skipped";
  return "failed";
}

function idFromTitle(title: string): string {
  const match = title.match(/TC-([A-Za-z0-9_-]+)/);
  return match ? `TC-${match[1]}` : title;
}

function collectResults(suite: PlaywrightJsonSuite, out: TestResult[]): void {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const last = test.results[test.results.length - 1];
      out.push({
        id: idFromTitle(spec.title),
        title: spec.title,
        status: statusFromPlaywright(last?.status ?? "failed"),
        error: last?.error?.message,
        durationMs: last?.duration,
      });
    }
  }
  for (const child of suite.suites ?? []) {
    collectResults(child, out);
  }
}

export class TestRunner {
  constructor(private testDir: string) {}

  run(): TestResult[] {
    const reportPath = path.join(this.testDir, ".qa-agent-report.json");

    const result = spawnSync(
      "npx",
      ["playwright", "test", this.testDir, "--reporter=json"],
      { encoding: "utf-8", shell: true, maxBuffer: 50 * 1024 * 1024 }
    );

    let jsonText = result.stdout;
    // Some Playwright versions write extra log lines before the JSON; find the first '{'.
    const firstBrace = jsonText.indexOf("{");
    if (firstBrace > 0) jsonText = jsonText.slice(firstBrace);

    let parsed: PlaywrightJsonSuite;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(
        `Could not parse Playwright JSON report.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }

    if (fs.existsSync(reportPath)) {
      fs.rmSync(reportPath);
    }

    const results: TestResult[] = [];
    collectResults(parsed, results);
    return results;
  }
}
