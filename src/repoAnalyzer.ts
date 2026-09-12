import * as fs from "fs";
import * as path from "path";
import { ProjectProfile } from "./types";

const DEFAULT_PROFILE: ProjectProfile = {
  hasPlaywright: false,
  usesTypeScript: true,
  existingTestDir: null,
  existingBaseUrl: null,
  testFileConvention: "*.spec.ts",
};

function readJsonSafe(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function findPlaywrightConfig(cwd: string): string | null {
  const candidates = [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.cjs",
  ];
  for (const name of candidates) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function extractFromConfigText(configText: string): { testDir: string | null; baseUrl: string | null } {
  const testDirMatch = configText.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
  const baseUrlMatch = configText.match(/baseURL\s*:\s*['"`]([^'"`]+)['"`]/);
  return {
    testDir: testDirMatch ? testDirMatch[1] : null,
    baseUrl: baseUrlMatch ? baseUrlMatch[1] : null,
  };
}

/**
 * Best-effort inspection of the HOST project (cwd), not this agent's own folder.
 * Falls back to DEFAULT_PROFILE whenever detection is ambiguous or absent,
 * so we never guess wrong and corrupt the host project's setup.
 */
export function analyzeRepo(cwd: string): ProjectProfile {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { ...DEFAULT_PROFILE };
  }

  const pkg = readJsonSafe(pkgPath);
  if (!pkg) {
    return { ...DEFAULT_PROFILE };
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasPlaywright = Boolean(deps["@playwright/test"] || deps["playwright"]);
  const configPath = findPlaywrightConfig(cwd);

  let usesTypeScript =
    fs.existsSync(path.join(cwd, "tsconfig.json")) ||
    Boolean(deps["typescript"]) ||
    Boolean(configPath && configPath.endsWith(".ts"));

  let existingTestDir: string | null = null;
  let existingBaseUrl: string | null = null;

  if (configPath && hasPlaywright) {
    try {
      const configText = fs.readFileSync(configPath, "utf-8");
      const { testDir, baseUrl } = extractFromConfigText(configText);
      if (testDir) existingTestDir = testDir;
      if (baseUrl) existingBaseUrl = baseUrl;
    } catch {
      // ambiguous/unreadable config -> fall back to defaults for these fields
    }
  }

  const testFileConvention = usesTypeScript ? "*.spec.ts" : "*.spec.js";

  return {
    hasPlaywright: hasPlaywright && Boolean(configPath),
    usesTypeScript,
    existingTestDir,
    existingBaseUrl,
    testFileConvention,
  };
}
