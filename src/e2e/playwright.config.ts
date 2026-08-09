import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "python support/mock_neis.py",
      cwd: __dirname,
      url: "http://127.0.0.1:8010/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "uv run --extra dev uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: path.resolve(__dirname, "../backend"),
      url: "http://127.0.0.1:8000/health",
      env: { NEIS_BASE_URL: "http://127.0.0.1:8010/hub" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      cwd: path.resolve(__dirname, "../frontend"),
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
