import { expect, test } from "@playwright/test";

test("검색부터 날짜별 중식 확인까지의 사용자 흐름", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("학교 이름").fill("서울");

  await expect(page.getByRole("button", { name: /서울고등학교/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /서울중학교/ })).toBeVisible();

  await page.getByRole("button", { name: /서울고등학교/ }).click();
  await expect(page.getByRole("region", { name: "학교 검색 결과" })).toHaveCount(0);
  await expect(page.getByText("선택한 학교: 서울고등학교")).toBeVisible();

  await page.getByPlaceholder("yyyy-mm-dd").nth(0).fill("2026-08-07");
  await page.getByPlaceholder("yyyy-mm-dd").nth(1).fill("2026-08-08");
  await page.getByRole("button", { name: "급식 조회" }).click();

  await expect(page.getByRole("region", { name: "급식 결과" })).toBeVisible();
  await expect(page.getByText("2026-08-07 · 중식")).toBeVisible();
  await expect(page.getByText("제육볶음")).toBeVisible();
  await expect(page.getByText("2026-08-08")).toBeVisible();
  await expect(page.getByText("이 날짜에는 중식 정보가 없습니다.")).toBeVisible();
});

test("두 글자 미만 입력에서는 학교 검색을 호출하지 않는다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("학교 이름").fill("서");
  await page.waitForTimeout(500);

  await expect(page.getByRole("region", { name: "학교 검색 결과" })).toHaveCount(0);
  await expect(page.getByText("두 글자 이상 입력하면 검색 결과가 자동으로 표시됩니다.")).toBeVisible();
});

test("검색 결과 없음과 NEIS 오류를 안내한다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("학교 이름").fill("없는학교");
  await expect(page.getByText("검색 결과가 없습니다. 다른 이름으로 검색해 보세요.")).toBeVisible();

  await page.getByLabel("학교 이름").fill("오류학교");
  await expect(page.getByRole("alert")).toContainText("급식 정보 서비스를 처리할 수 없습니다.");
});

test("잘못된 날짜 범위와 전체 급식 없음 상태를 안내한다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("학교 이름").fill("서울");
  await page.getByRole("button", { name: /서울고등학교/ }).click();

  await page.getByPlaceholder("yyyy-mm-dd").nth(0).fill("2026-08-10");
  await page.getByPlaceholder("yyyy-mm-dd").nth(1).fill("2026-08-09");
  await page.getByRole("button", { name: "급식 조회" }).click();
  await expect(page.getByRole("alert")).toContainText("종료일은 시작일보다 빠를 수 없습니다.");

  await page.getByPlaceholder("yyyy-mm-dd").nth(0).fill("2026-08-09");
  await page.getByRole("button", { name: "급식 조회" }).click();
  await expect(page.getByText("선택한 기간에 중식 정보가 없습니다.")).toBeVisible();
  await expect(page.getByText("2026-08-09")).toBeVisible();
  await expect(page.getByText("이 날짜에는 중식 정보가 없습니다.")).toBeVisible();
});
