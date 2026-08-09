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

  const datePicker = page.getByRole("combobox", { name: "분석 날짜" });
  await expect(datePicker).toBeVisible();
  await datePicker.fill(isoToday);
  await datePicker.press("Enter");
  await datePicker.press("Escape");
  await expect(datePicker).toHaveValue(isoToday);
  await page.getByRole("button", { name: "날짜 확정" }).click();

  await expect(page.getByRole("textbox", { name: "프롬프트" })).toHaveValue(/분석고등학교/);
  await page.getByRole("button", { name: "프롬프트 확정" }).click();

  await page.getByRole("button", { name: "분석 시작" }).click();

  const results = page.getByRole("region", { name: "분석 결과" });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.getByText(/총점 .*점/).first()).toBeVisible();
  await expect(results.getByText(/영양·건강성/).first()).toBeVisible();
  await expect(results.getByText(/승자: |동점/).first()).toBeVisible();

  const graph = page.getByRole("region", { name: "워크플로우 그래프" });
  await expect(graph).toBeVisible();
  await expect(page.getByTestId("workflow-node-final-synthesis-agent")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("workflow-node-nutrition-health-agent")).toHaveAttribute("data-state", "done");
});

test("공식 Agent Framework DevUI가 워크플로우를 노출한다", async ({ page }) => {
  const ui = await page.request.get("http://127.0.0.1:8000/");
  expect(ui.status()).toBe(200);

  const entities = await page.request.get("http://127.0.0.1:8000/v1/entities");
  expect(entities.status()).toBe(200);
  const ids = (await entities.json()).entities.map((entity: { id: string }) => entity.id);
  expect(ids.some((id: string) => id.includes("school-lunch-evaluation"))).toBe(true);

  const graph = await page.request.get("http://127.0.0.1:8000/api/analysis/workflow");
  const body = await graph.json();
  expect(body.pattern).toBe("concurrent-fan-out-sequential-fan-in");
  expect(body.nodes.filter((node: { stage: number }) => node.stage === 1)).toHaveLength(4);
});
