import { expect, test } from "@playwright/test";

const pad = (value: number) => String(value).padStart(2, "0");
const today = new Date();
const isoToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

test("분석 페이지에서 두 학교를 골라 배틀 결과를 확인한다", async ({ page }) => {
  await page.goto("/#/analysis");

  const pool = page.getByRole("region", { name: "분석 대상 학교" });
  await expect(pool.getByRole("button", { name: /분석고등학교/ })).toBeVisible({ timeout: 30_000 });

  await pool.getByRole("button", { name: /분석고등학교/ }).click();
  await pool.getByRole("button", { name: /분석중학교/ }).click();

  await page.getByLabel("분석 날짜").selectOption(isoToday);
  await expect(page.getByLabel("프롬프트")).toHaveValue(/분석고등학교/);

  await page.getByRole("button", { name: "분석 시작" }).click();

  const results = page.getByRole("region", { name: "분석 결과" });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.getByText(/총점 .*점/).first()).toBeVisible();
  await expect(results.getByText(/영양·건강성/).first()).toBeVisible();
  await expect(results.getByText(/승자: |동점/).first()).toBeVisible();
});

test("백엔드 dev UI가 워크플로우 그래프를 렌더링한다", async ({ page }) => {
  const response = await page.request.get("http://127.0.0.1:8000/dev/workflow");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("concurrent fan-out");

  const graph = await page.request.get("http://127.0.0.1:8000/api/analysis/workflow");
  const body = await graph.json();
  expect(body.pattern).toBe("concurrent-fan-out-sequential-fan-in");
  expect(body.nodes.filter((node: { stage: number }) => node.stage === 1)).toHaveLength(4);
});
