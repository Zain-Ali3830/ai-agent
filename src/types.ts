export interface TestCase {
  id: string;
  title: string;
  steps: string[];
  expectedResult: string;
}

export interface ProjectProfile {
  hasPlaywright: boolean;
  usesTypeScript: boolean;
  existingTestDir: string | null;
  existingBaseUrl: string | null;
  testFileConvention: string;
}

export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "generation_error";

export interface TestResult {
  id: string;
  title: string;
  status: TestStatus;
  error?: string;
  durationMs?: number;
}
