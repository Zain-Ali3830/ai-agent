# QA Automation Agent — Project Notes

> **Two implementations exist.** This file documents the standalone Node.js/Anthropic-API CLI
> below. There is also a no-API-cost version as a Claude Code skill at
> `.claude/skills/qa-automation-agent/SKILL.md` in this same project — run it by asking Claude
> Code to run the QA automation agent, or via `/qa-automation-agent`. That version covers
> positive/negative/edge test cases, saves them to `test-cases.xlsx`, and prioritizes `id`
> locators. Prefer the skill unless you specifically need the standalone CLI tool.

This project is a conversational CLI agent (TypeScript/Node) that:
1. Reads a spec file (.txt/.pdf/.docx /.md).
2. Uses Claude to generate structured UI test cases (id, title, steps, expectedResult).
3. Requires explicit user approval before proceeding (regenerates on feedback if rejected).
4. Asks for a target URL.
5. Analyzes the host project (`repoAnalyzer.ts`) it's being run from, to match any existing
   Playwright setup (test dir, baseURL, TS/JS) instead of assuming a fresh project.
6. Uses Anthropic's MCP connector to let Claude drive a real Playwright MCP browser session,
   discover real locators on the live page, and write a Playwright Test (TypeScript) spec
   per test case.
7. Runs the generated specs with `npx playwright test --reporter=json`, reports PASS/FAIL
   per test case, and writes `results.txt` in the directory the agent was run from.

## Key files
- `src/agent.ts` — main orchestrator / CLI entry point (registered as `bin: qa-agent`).
- `src/specReader.ts` — spec file parsing (txt/pdf/docx).
- `src/testCaseGenerator.ts` — Claude call for generating/regenerating test cases.
- `src/repoAnalyzer.ts` — best-effort detection of the host project's existing test setup.
- `src/mcpBrowser.ts` — spawns/stops the local `@playwright/mcp` server (HTTP/SSE mode).
- `src/scriptGenerator.ts` — Claude call (MCP connector) that explores the live page and
  returns a `.spec.ts` file body per test case.
- `src/testRunner.ts` — runs `npx playwright test` and parses the JSON reporter output.

## Conventions
- All file writes (`tests/`, `results.txt`) happen relative to `process.cwd()`, since this
  tool is meant to be run via `npx` from inside someone else's project — never relative to
  this package's own install location.
- `repoAnalyzer` must fail safe: if detection is ambiguous, fall back to this agent's own
  defaults (`tests/generated`, no baseURL) rather than guessing and corrupting the host
  project's existing config.
- Never skip the approval step in `agent.ts`; the loop must go back to regeneration on "no".
- Test execution must never pass `--bail` — one failing test case must not stop the rest.
