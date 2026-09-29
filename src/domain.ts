import {
  MASTERY_STREAK, isDue, answer, undoAnswer, regradeAnswer, continueSession, createInitialData, createSession, decodeAppData,
  emptyDailyStats, lookupStarterWord, todayKey,
} from "../miniprogram/shared/domain.js";
export type { ActiveSession, AppData, DailyStats, PracticeMode, Rating, WordEntry, WordStatus } from "../miniprogram/shared/domain.js";
export { MASTERY_STREAK, isDue, answer, undoAnswer, regradeAnswer, continueSession, createInitialData, createSession, decodeAppData, emptyDailyStats, lookupStarterWord, todayKey };
export function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", { month:"long", day:"numeric", weekday:"long" }).format(date);
}
