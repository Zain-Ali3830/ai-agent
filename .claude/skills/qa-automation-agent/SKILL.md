---
name: qa-automation-agent
description: Conversational QA workflow that turns a spec file (.txt/.pdf/.docx) into approved UI test cases covering positive/negative/edge scenarios (saved as an Excel file), then explores a real website with a browser MCP tool and writes/runs Playwright TypeScript tests, reporting PASS/FAIL. Use when the user asks to generate test cases from a spec, run automated UI/QA testing against a URL, or invokes /qa-automation-agent. Uses only tools already available in this Claude Code session — no external LLM API key needed.
---

# QA Automation Agent

Runs entirely with this session's own tools (Read, Bash, AskUserQuestion, and whatever
browser-automation MCP tool is connected) — never call an external LLM API and never ask the
user for an ANTHROPIC_API_KEY. You (Claude, running this skill) generate the test cases and
scripts yourself, conversationally, exactly as in a normal turn.

All file writes (`tests/`, `results.txt`, config files) go under the user's **current working
directory** (their target project), never under this skill's own folder — this skill must work
portably against whatever project the user is pointed at.

## Instructions

### Step 1: Get the spec file
Ask the user for the path to a specification file (`.txt`, `.pdf`, or `.docx`).
- `.txt` / `.pdf`: read directly with the Read tool.
- `.docx`: use the docx skill/capability if one is available in this session to extract text;
  if none is available, tell the user and ask them to paste the text or provide a `.txt`/`.pdf`
  instead — do not guess at binary content.
Read and understand the full spec before moving on.

### Step 2: Generate test cases (positive, negative, and edge)
From the spec, write detailed UI test cases. Each test case needs exactly:
- **Test Case ID** (e.g. `TC-01`)
- **Test Case Title**
- **Category** — one of `Positive`, `Negative`, or `Edge`
- **Steps** (numbered, concrete user actions)
- **Expected Result** — must be concrete and checkable in a browser (visible text, a URL
  change, an element appearing/disappearing, a form value, an alert) — never vague phrasing
  like "it should work", since this becomes a real Playwright assertion later.

You must deliberately cover all three categories, not just the golden path:
- **Positive** — the feature used correctly (golden path, valid inputs).
- **Negative** — invalid input, wrong credentials, missing required fields, unauthorized
  actions, malformed data — anything that should be rejected or show an error.
- **Edge** — boundary values (min/max length, empty vs. very long input, special characters,
  double-submits, slow/duplicate clicks, empty states, unusual but valid combinations).

Don't invent features the spec doesn't imply, but do actively look for the negative/edge cases
implied by each feature (e.g. a required field implies a "left empty" negative case; a text
input implies a "very long input" edge case).

Then write all test cases to an Excel file using the xlsx skill/capability available in this
session. Columns, in order: `Test Case ID`, `Title`, `Category`, `Steps`, `Expected Result`
(steps as a single newline- or numbered-separated cell). Save it in the user's current project
directory as `test-cases.xlsx` (or ask if they'd prefer a different name/location).

### Step 3: Get approval — never skip this
Display all test cases clearly in chat (grouped by ID, with category, steps, and expected
result), and mention that the full list is also saved to `test-cases.xlsx`. Then ask:
**"Do you approve these test cases? (yes/no)"**
- If **no**: ask what changes are wanted, regenerate the test cases incorporating that
  feedback (keep unrelated test cases the same where reasonable), re-save `test-cases.xlsx`,
  and show them again. Repeat until approved.
- If **yes**: continue to Step 4.
Do not proceed to browser automation before explicit approval.

### Step 4: Get the target URL
Ask: **"Please provide the URL of the website you want to test."**

### Step 5: Check the project's existing test setup
Before writing any files, inspect the user's current project (cwd):
- Read `package.json` if present — check for `@playwright/test` in dependencies/devDependencies.
- Look for an existing `playwright.config.ts`/`.js` — if found, read it for `testDir` and
  `baseURL` so generated tests match the existing convention (reuse baseURL with relative
  navigation instead of hardcoding the full URL; write into the existing testDir).
- Note whether the project uses TypeScript (`tsconfig.json` present, or config file is `.ts`).

If no Playwright setup exists:
- Tell the user you'll set up a minimal one (`tests/generated/` + a `playwright.config.ts`,
  plus installing `@playwright/test` and running `npx playwright install`).
- **Ask before installing anything** (`npm install -D @playwright/test` and
  `npx playwright install` are state-changing) — get a yes before running them.

### Step 6: Explore the real page and write test scripts
Check whether a Playwright/browser automation MCP tool is connected in this session (e.g. tool
names starting with `mcp__playwright`, `mcp__Claude_Browser__`, or similar browser-control
tools). You need this to discover **real** locators rather than guessing.

- If one is available: for each approved test case, navigate to the URL and perform the test
  case's steps using that tool, inspecting the page structure (accessibility tree / DOM) to
  find stable locators. Locator priority, in this order:
  1. **`id` attribute**, if the element has one — `page.locator('#the-id')`.
  2. Role/label/text-based locators (`getByRole`, `getByLabel`, `getByText`) if no `id` is
     present.
  3. CSS/XPath only as a last resort, if nothing above uniquely identifies the element.
  Always check the real DOM for an `id` first before falling back down this list — don't reach
  for a role/text locator when a usable `id` is right there. Confirm the expected result
  actually happens on the real page.
- If none is available: stop and tell the user clearly that no browser MCP tool is connected,
  and that they can add one project-locally via a `.mcp.json` with an entry like:
  ```json
  { "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] } } }
  ```
  Do not silently fall back to guessing selectors from the spec text alone — that produces
  unreliable tests.

For each test case, once you've explored the real page, write a Playwright Test TypeScript
spec file:
- `import { test, expect } from '@playwright/test';`
- One `test('<title>', async ({ page }) => { ... })` block.
- Use the real locators discovered via the browser tool, following the id-first priority order
  from Step 6 above.
- Include at least one `expect(...)` assertion matching the test case's Expected Result.
- Save it as `<testDir>/TC-<id>.spec.ts` (testDir = the existing one detected in Step 5, or
  `tests/generated` by default).

If exploration or script writing fails for a given test case, don't abort the whole run —
write that one as a clearly-failing stub instead and move to the next test case:
```ts
import { test } from '@playwright/test';
test('<title> [GENERATION FAILED]', async () => {
  throw new Error('<short reason it failed>');
});
```

### Step 7: Run the tests and report
Run all generated tests with Bash:
```bash
npx playwright test <testDir> --reporter=json
```
Never pass `--bail` — every test case must run and be reported, even if earlier ones fail.

Parse the JSON reporter output for each test's status. In chat, report **PASSED** or **FAILED**
per test case as you go through the results, then a summary (total / passed / failed).

Write the same detail to `results.txt` in the user's current project directory: a timestamp,
per-test PASSED/FAILED lines (with the failure reason for failed ones), and the summary
totals.

## Key behaviors to always follow
- Stay conversational and step-by-step; don't dump everything at once.
- Test cases must include Positive, Negative, and Edge categories — not just the golden path.
- Always save/update `test-cases.xlsx` in the user's project directory alongside showing test
  cases in chat.
- Never skip the Step 3 approval gate.
- Never use `--bail`; one failing test case must not stop the others.
- Never hit an external LLM API or ask for an API key — you generate everything yourself as
  part of this conversation.
- All writes are relative to the user's current project directory, not this skill's folder.
