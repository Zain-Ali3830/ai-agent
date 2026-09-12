import { ChildProcess, spawn } from "child_process";
import * as http from "http";

const DEFAULT_PORT = 8931;
const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export class McpBrowser {
  private proc: ChildProcess | null = null;
  readonly port: number;

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
  }

  get mcpUrl(): string {
    return `http://localhost:${this.port}/mcp`;
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const reachable = await new Promise<boolean>((resolve) => {
        const req = http.get({ host: "localhost", port: this.port, path: "/mcp", timeout: 1000 }, (res) => {
          res.destroy();
          resolve(true);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (reachable) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Playwright MCP server did not become ready on port ${this.port} within ${READY_TIMEOUT_MS}ms.`
    );
  }

  async start(): Promise<void> {
    if (this.proc) return;

    this.proc = spawn(
      "npx",
      ["-y", "@playwright/mcp@latest", "--port", String(this.port)],
      { stdio: ["ignore", "pipe", "pipe"], shell: true }
    );

    this.proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[playwright-mcp] process exited with code ${code}`);
      }
      this.proc = null;
    });

    await this.waitUntilReady();
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      proc.kill();
      // Fallback in case the process ignores the signal.
      setTimeout(() => resolve(), 3000);
    });
  }
}
