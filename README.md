# AI QA Automation Agent

A conversational CLI agent that turns a spec file into approved UI test cases, then
automatically writes and runs real Playwright (TypeScript) browser tests against a URL you
provide, and reports PASS/FAIL for each one.

## How it works

1. You give it a spec file (`.txt`, `.pdf`, or `.docx`).
2. Claude generates UI test cases (ID, Title, Steps, Expected Result).
3. You review and approve them (or ask for changes — it will regenerate).
4. You give it a URL.
5. It analyzes the project you're running it from (if it already has Playwright set up, it
   reuses that setup; otherwise it creates its own `tests/generated/` folder).
6. It starts a local Playwright MCP browser server, and uses Claude (with MCP tool access)
   to actually open the page, find real locators, and write a `.spec.ts` file per test case.
7. It runs all the generated tests with Playwright, prints PASSED/FAILED per test case, and
   writes a full summary to `results.txt`.

## Prerequisites

- Node.js 18+ and npm
- An Anthropic API key (https://console.anthropic.com/)

## Setup

```bash
npm install
npx playwright install
```

Add your API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Running it in this project

```bash
npm start
```

Follow the prompts:
1. Enter the path to your spec file.
2. Review the generated test cases, type `y`/`n` to approve or reject.
3. If rejected, describe what to change — it will regenerate and show you again.
4. Once approved, enter the URL of the site to test.
5. Watch it generate and run the Playwright tests.
6. Check the console output and `results.txt` for the final report.

## Using it inside another project (portable mode)

This agent is meant to be droppable into any existing project so its generated tests match
that project's conventions.

From inside your target project directory:

```bash
npx <path-to-this-repo-or-git-url>
```

For example, if this repo lives locally at `C:\Users\user\Desktop\AI-agent`:

```bash
npx C:/Users/user/Desktop/AI-agent
```

or from a git remote:

```bash
npx git+https://github.com/your-org/qa-automation-agent.git
```

The agent will:
- Detect if your project already has `@playwright/test` installed and a `playwright.config.*`
  (using its existing `testDir` / `baseURL` and TypeScript/JavaScript convention).
- If found, write generated tests into your existing test directory so they run alongside
  your current suite.
- If not found, create its own `tests/generated/` folder and a minimal `playwright.config.ts`
  in your project.
- Write `results.txt` in your project's current directory.

You still need `ANTHROPIC_API_KEY` set (either in that project's `.env`/environment, or
exported in your shell) when running it this way.

## Notes / limitations

- Script generation uses Anthropic's beta MCP connector to let Claude drive a local
  Playwright MCP server — this requires network access to spin up `npx @playwright/mcp`.
- If Claude fails to generate a valid script for a test case, that test case is written as a
  failing stub (with a clear error message) instead of crashing the whole run — you'll see it
  reported as FAILED with the generation error as the reason.
- Test execution never stops early on a failure — every approved test case is always run and
  reported.
