export type School = { educationOfficeCode: string; schoolCode: string; name: string; schoolKind: string; location: string };
export type Meal = { date: string; mealName: string; menu: string[]; originInfo?: string; calorieInfo?: string; nutritionInfo?: string };
export type MealResponse = { school: { educationOfficeCode: string; schoolCode: string; name: string }; items: Meal[] };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isErrorEnvelope = (value: unknown): value is { error: { code: string; message: string } } =>
  isRecord(value) &&
  isRecord(value.error) &&
  typeof value.error.code === "string" &&
  typeof value.error.message === "string";
const read = async <T>(url: string, validate: (value: unknown) => value is T): Promise<T> => {
  const response = await fetch(url);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok ? "응답 형식이 올바르지 않습니다." : "요청을 처리하지 못했습니다.");
  }
  if (!response.ok) {
    throw new Error(isErrorEnvelope(data) ? data.error.message : "요청을 처리하지 못했습니다.");
  }
  if (!validate(data)) throw new Error("응답 형식이 올바르지 않습니다.");
  return data;
};
const schoolsResponse = (value: unknown): value is { items: School[] } => isRecord(value) && Array.isArray(value.items) && value.items.every(item => isRecord(item) && typeof item.name === "string" && typeof item.schoolCode === "string" && typeof item.educationOfficeCode === "string" && typeof item.schoolKind === "string" && typeof item.location === "string");
const mealsResponse = (value: unknown): value is MealResponse => isRecord(value) && isRecord(value.school) && typeof value.school.name === "string" && Array.isArray(value.items) && value.items.every(item => isRecord(item) && typeof item.date === "string" && typeof item.mealName === "string" && Array.isArray(item.menu) && item.menu.every(entry => typeof entry === "string"));
export const searchSchools = (name: string) => read(`/api/schools?name=${encodeURIComponent(name.trim())}`, schoolsResponse);
export const fetchMeals = (school: School, from: string, to: string) => read(`/api/meals?educationOfficeCode=${school.educationOfficeCode}&schoolCode=${school.schoolCode}&from=${from.replaceAll("-", "")}&to=${to.replaceAll("-", "")}`, mealsResponse);
