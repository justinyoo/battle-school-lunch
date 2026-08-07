import { describe, expect, it, vi } from "vitest";
import { fetchMeals, searchSchools } from "./api";

describe("API client", () => {
  it("encodes school search terms and validates the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              educationOfficeCode: "B10",
              schoolCode: "123",
              name: "서울고등학교",
              schoolKind: "고등학교",
              location: "서울",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(searchSchools(" 서울고 ")).resolves.toMatchObject({ items: [{ schoolCode: "123" }] });
    expect(fetchMock).toHaveBeenCalledWith("/api/schools?name=%EC%84%9C%EC%9A%B8%EA%B3%A0");
    fetchMock.mockRestore();
  });

  it("normalizes date query parameters before requesting meals", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          school: { educationOfficeCode: "B10", schoolCode: "123", name: "서울고등학교" },
          items: [{ date: "20260807", mealName: "중식", menu: ["밥"] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const school = {
      educationOfficeCode: "B10",
      schoolCode: "123",
      name: "서울고등학교",
      schoolKind: "고등학교",
      location: "서울",
    };
    await fetchMeals(school, "2026-08-07", "2026-08-07");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/meals?educationOfficeCode=B10&schoolCode=123&from=20260807&to=20260807",
    );
    fetchMock.mockRestore();
  });

  it("uses the backend error envelope message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "급식 정보 서비스를 잠시 사용할 수 없습니다.",
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(searchSchools("서울")).rejects.toThrow("급식 정보 서비스를 잠시 사용할 수 없습니다.");
    fetchMock.mockRestore();
  });

  it("falls back to a safe message for malformed error responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>error</html>", { status: 500, headers: { "Content-Type": "text/html" } }),
    );

    await expect(searchSchools("서울")).rejects.toThrow("요청을 처리하지 못했습니다.");
    fetchMock.mockRestore();
  });
});
