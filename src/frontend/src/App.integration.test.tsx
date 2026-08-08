import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, localToday } from "./main";
import { fetchMeals, searchSchools } from "./api";

vi.mock("./api", () => ({
  fetchMeals: vi.fn(),
  searchSchools: vi.fn(),
}));

const mockedSearchSchools = vi.mocked(searchSchools);
const mockedFetchMeals = vi.mocked(fetchMeals);

const schools = [
  { educationOfficeCode: "B10", schoolCode: "123", name: "서울고등학교", schoolKind: "고등학교", location: "서울" },
  { educationOfficeCode: "B10", schoolCode: "456", name: "서울중학교", schoolKind: "중학교", location: "서울" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearchSchools.mockResolvedValue({ items: schools });
  mockedFetchMeals.mockResolvedValue({
    school: { educationOfficeCode: "B10", schoolCode: "123", name: "서울고등학교" },
    items: [{ date: "20260807", mealName: "중식", menu: ["밥", "국"], calorieInfo: "650 Kcal" }],
  });
});

afterEach(() => cleanup());

describe("학교 급식 조회 통합 흐름", () => {
  it("uses the browser-local date for the default", () => {
    expect(localToday(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
  });

  it("학교 검색, 선택, 날짜 입력, 급식 조회를 연결한다", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByPlaceholderText("예: 서울고"), "서울");
    await waitFor(() => expect(mockedSearchSchools).toHaveBeenCalledWith("서울"));
    expect(await screen.findByRole("button", { name: /서울고등학교/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /서울고등학교/ }));
    expect(screen.queryByRole("button", { name: /서울중학교/ })).not.toBeInTheDocument();

    const dateInputs = screen.getAllByPlaceholderText("yyyy-mm-dd");
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-07" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-07" } });
    await user.click(screen.getByRole("button", { name: "급식 조회" }));

    await waitFor(() => expect(mockedFetchMeals).toHaveBeenCalledWith(schools[0], "2026-08-07", "2026-08-07"));
    expect(await screen.findByText("2026-08-07 · 중식")).toBeInTheDocument();
    expect(screen.getByText("국")).toBeInTheDocument();
  });

  it("검색 결과 없음, 오류, 빈 급식 결과를 표시한다", async () => {
    const user = userEvent.setup();
    mockedSearchSchools.mockResolvedValueOnce({ items: [] });
    render(<App />);

    await user.type(screen.getByPlaceholderText("예: 서울고"), "없는학교");
    expect(await screen.findByText("검색 결과가 없습니다. 다른 이름으로 검색해 보세요.")).toBeInTheDocument();

    mockedSearchSchools.mockRejectedValueOnce(new Error("검색에 실패했습니다."));
    await user.clear(screen.getByPlaceholderText("예: 서울고"));
    await user.type(screen.getByPlaceholderText("예: 서울고"), "오류학교");
    expect(await screen.findByRole("alert")).toHaveTextContent("검색에 실패했습니다.");
  });

  it("잘못된 날짜 범위에서는 급식 API를 호출하지 않는다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText("예: 서울고"), "서울");
    await user.click(await screen.findByRole("button", { name: /서울고등학교/ }));

    const dateInputs = screen.getAllByPlaceholderText("yyyy-mm-dd");
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-08" } });
    fireEvent.blur(dateInputs[0]);
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-07" } });
    fireEvent.blur(dateInputs[1]);
    await user.click(screen.getByRole("button", { name: "급식 조회" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("종료일은 시작일보다 빠를 수 없습니다.");
    expect(mockedFetchMeals).not.toHaveBeenCalled();
  });

  it("부분 기간에서 급식이 없는 날짜를 별도 상태로 표시한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText("예: 서울고"), "서울");
    await user.click(await screen.findByRole("button", { name: /서울고등학교/ }));

    const dateInputs = screen.getAllByPlaceholderText("yyyy-mm-dd");
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-07" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-08" } });
    fireEvent.blur(dateInputs[1]);
    await user.click(screen.getByRole("button", { name: "급식 조회" }));

    expect(await screen.findByText("2026-08-07 · 중식")).toBeInTheDocument();
    expect(screen.getByText("2026-08-08")).toBeInTheDocument();
    expect(screen.getByText("이 날짜에는 중식 정보가 없습니다.")).toBeInTheDocument();
  });

  it("새 조회 시작과 실패 시 이전 결과를 지우고 오래된 응답을 무시한다", async () => {
    const user = userEvent.setup();
    let resolveOld: ((value: Awaited<ReturnType<typeof fetchMeals>>) => void) | undefined;
    const oldRequest = new Promise<Awaited<ReturnType<typeof fetchMeals>>>(resolve => {
      resolveOld = resolve;
    });

    render(<App />);
    await user.type(screen.getByPlaceholderText("예: 서울고"), "서울");
    await user.click(await screen.findByRole("button", { name: /서울고등학교/ }));
    const initialDateInputs = screen.getAllByPlaceholderText("yyyy-mm-dd");
    fireEvent.change(initialDateInputs[0], { target: { value: "2026-08-07" } });
    fireEvent.change(initialDateInputs[1], { target: { value: "2026-08-07" } });

    await user.click(screen.getByRole("button", { name: "급식 조회" }));
    expect(await screen.findByText("국")).toBeInTheDocument();

    mockedFetchMeals
      .mockReturnValueOnce(oldRequest)
      .mockRejectedValueOnce(new Error("급식 조회 오류"));
    await user.click(screen.getByRole("button", { name: "급식 조회" }));
    expect(screen.getByText("급식 정보를 불러오는 중입니다.")).toBeInTheDocument();
    expect(screen.queryByText("국")).not.toBeInTheDocument();

    const dateInputs = screen.getAllByPlaceholderText("yyyy-mm-dd");
    fireEvent.change(dateInputs[0], { target: { value: "2026-08-08" } });
    fireEvent.blur(dateInputs[0]);
    fireEvent.change(dateInputs[1], { target: { value: "2026-08-08" } });
    fireEvent.blur(dateInputs[1]);
    await user.click(screen.getByRole("button", { name: "급식 조회" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("급식 조회 오류");
    resolveOld?.({
      school: { educationOfficeCode: "B10", schoolCode: "123", name: "서울고등학교" },
      items: [{ date: "20260807", mealName: "중식", menu: ["오래된 메뉴"] }],
    });
    await waitFor(() => expect(screen.queryByText("오래된 메뉴")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "급식 결과" })).not.toBeInTheDocument();
  });
});
