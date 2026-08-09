import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Card, Field, FluentProvider, Input, MessageBar, Spinner, Text, Title1, makeStyles, tokens, webLightTheme } from "@fluentui/react-components";
import { DatePicker } from "@fluentui/react-datepicker-compat";
import { fetchMeals, Meal, School, searchSchools } from "./api";
import { Analysis } from "./Analysis";
import "./styles.css";

const useStyles = makeStyles({
  app: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground2,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
  },
  content: {
    maxWidth: "900px",
    margin: "0 auto",
    display: "grid",
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: "grid",
    gap: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalM,
  },
  stack: { display: "grid", gap: tokens.spacingVerticalM },
  results: { display: "grid", gap: tokens.spacingVerticalS },
  meal: { padding: tokens.spacingVerticalL, borderRadius: tokens.borderRadiusXLarge },
  panel: { padding: tokens.spacingVerticalL },
  meta: { color: tokens.colorNeutralForeground3 },
});
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const toDate = (value: string) => {
  if (!isValidDate(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const formatDate = (value?: Date) => value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : "";
export const localToday = (value = new Date()) => formatDate(value);
const datesInRange = (from: string, to: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

export function App() {
  const styles = useStyles();
  const [route, setRoute] = useState(() => (typeof window === "undefined" ? "" : window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [name, setName] = useState(""); const [schools, setSchools] = useState<School[]>([]); const [school, setSchool] = useState<School>();
  const [from, setFrom] = useState(localToday); const [to, setTo] = useState(localToday); const [meals, setMeals] = useState<Meal[]>([]);
  const [searching, setSearching] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [searched, setSearched] = useState(false); const [queried, setQueried] = useState(false);
  const searchRequestId = useRef(0);
  const mealRequestId = useRef(0);
  const search = async (query = name) => {
    const term = query.trim();
    if (term.length < 2) {
      setError("학교 이름을 두 글자 이상 입력해 주세요.");
      setSchools([]);
      setSearched(false);
      return;
    }
    const requestId = ++searchRequestId.current;
    setError(""); setSchools([]); setSearching(true); setSearched(true);
    try {
      const result = await searchSchools(term);
      if (requestId === searchRequestId.current) setSchools(result.items);
    } catch (e) {
      if (requestId === searchRequestId.current) {
        setSchools([]);
        setError(e instanceof Error ? e.message : "검색에 실패했습니다.");
      }
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  };
  useEffect(() => {
    const term = name.trim();
    if (term.length < 2) {
      searchRequestId.current += 1;
      setSchools([]);
      setSearched(false);
      setSearching(false);
      setError("");
      return;
    }
    const timer = window.setTimeout(() => void search(term), 350);
    return () => window.clearTimeout(timer);
  }, [name]);
  const resetMealQuery = () => {
    mealRequestId.current += 1;
    setLoading(false);
    setMeals([]);
    setQueried(false);
  };
  const query = async () => {
    if (!school) return setError("먼저 학교를 선택해 주세요.");
    if (!isValidDate(from) || !isValidDate(to)) return setError("날짜를 yyyy-mm-dd 형식으로 입력해 주세요.");
    if (from > to) return setError("종료일은 시작일보다 빠를 수 없습니다.");
    const requestId = ++mealRequestId.current;
    const requestedSchool = school;
    const requestedFrom = from;
    const requestedTo = to;
    setError("");
    setMeals([]);
    setLoading(true);
    setQueried(true);
    try {
      const result = await fetchMeals(requestedSchool, requestedFrom, requestedTo);
      if (requestId === mealRequestId.current) setMeals(result.items);
    } catch (e) {
      if (requestId === mealRequestId.current) {
        setMeals([]);
        setQueried(false);
        setError(e instanceof Error ? e.message : "급식 조회에 실패했습니다.");
      }
    } finally {
      if (requestId === mealRequestId.current) setLoading(false);
    }
  };
  const mealsByDate = new Map(meals.map(meal => [meal.date, meal]));
  const resultDates = queried ? datesInRange(from, to) : [];
  const nav = <nav aria-label="페이지 이동" className="inline">
    <Button appearance={route === "#/analysis" ? "secondary" : "primary"} onClick={() => { window.location.hash = ""; setRoute(""); }}>급식 메뉴</Button>
    <Button appearance={route === "#/analysis" ? "primary" : "secondary"} onClick={() => { window.location.hash = "#/analysis"; setRoute("#/analysis"); }}>급식 배틀 분석</Button>
  </nav>;
  if (route === "#/analysis") {
    return <FluentProvider theme={webLightTheme}><main className={styles.app}><div className={styles.content}>{nav}<Analysis /></div></main></FluentProvider>;
  }
  return <FluentProvider theme={webLightTheme}><main className={styles.app}><div className={styles.content}>
    {nav}
    <header className={styles.header}><Title1>급식 배틀</Title1><Text size={400}>학교를 검색하고 날짜별 중식 메뉴를 확인하세요.</Text></header>
    {error && <MessageBar intent="error" role="alert">{error}</MessageBar>}
    <Field label="학교 이름" hint="두 글자 이상 입력하면 검색 결과가 자동으로 표시됩니다."><div className="inline"><Input value={name} onChange={(_, d) => { setName(d.value); if (school) { setSchool(undefined); resetMealQuery(); } }} onKeyDown={e => e.key === "Enter" && void search()} placeholder="예: 서울고" /></div></Field>
    {searching && <Spinner label="학교를 검색하는 중입니다." />}
    {!searching && searched && schools.length === 0 && <MessageBar>검색 결과가 없습니다. 다른 이름으로 검색해 보세요.</MessageBar>}
    {schools.length > 0 && !school && <section aria-label="학교 검색 결과" className={styles.results}>{schools.map(item => <Button key={item.schoolCode} appearance="secondary" onClick={() => { setSchool(item); resetMealQuery(); }}><span>{item.name} · {item.schoolKind} · {item.location}</span></Button>)}</section>}
    {school && <Card className={styles.panel}><div className={styles.stack}><Text weight="semibold">선택한 학교: {school.name}</Text><div className="dates"><Field label="시작일"><DatePicker value={toDate(from)} formatDate={formatDate} parseDateFromString={value => toDate(value) ?? null} allowTextInput placeholder="yyyy-mm-dd" aria-label="조회 시작일" onChange={(_, data) => { const date = toDate(data.value); if (date) { resetMealQuery(); setFrom(formatDate(date)); } }} onSelectDate={date => { if (date) { resetMealQuery(); setFrom(formatDate(date)); } }} /></Field><Field label="종료일"><DatePicker value={toDate(to)} formatDate={formatDate} parseDateFromString={value => toDate(value) ?? null} allowTextInput placeholder="yyyy-mm-dd" aria-label="조회 종료일" onChange={(_, data) => { const date = toDate(data.value); if (date) { resetMealQuery(); setTo(formatDate(date)); } }} onSelectDate={date => { if (date) { resetMealQuery(); setTo(formatDate(date)); } }} /></Field></div><Button appearance="primary" onClick={() => void query()} disabled={loading}>{loading ? <Spinner size="tiny" /> : "급식 조회"}</Button></div></Card>}
    {loading && <Spinner label="급식 정보를 불러오는 중입니다." />}
    {!loading && queried && meals.length === 0 && <MessageBar>선택한 기간에 중식 정보가 없습니다.</MessageBar>}
    {!loading && queried && <section aria-label="급식 결과" className={styles.results}>{resultDates.map(date => {
      const meal = mealsByDate.get(date.replaceAll("-", ""));
      return <Card className={styles.meal} key={date}><Text weight="semibold">{date}{meal ? ` · ${meal.mealName}` : ""}</Text>{meal ? <><ul>{meal.menu.map((entry, i) => <li key={`${entry}-${i}`}>{entry}</li>)}</ul>{meal.calorieInfo && <Text className={styles.meta}>{meal.calorieInfo}</Text>}</> : <Text>이 날짜에는 중식 정보가 없습니다.</Text>}</Card>;
    })}</section>}
  </div></main></FluentProvider>;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
