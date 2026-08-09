import assert from "node:assert/strict";
import test from "node:test";
import {
  DAILY_QUESTION_TARGET,
  aggregateDailyAttempts,
  buildGamificationSummary,
  currentWeekProgress,
  deriveEducationalAchievements,
  localDateKey,
  studyStreaks,
  todayStudyProgress,
} from "../app/lib/gamification.js";

function localTimestamp(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function attempt(studyDate, total) {
  return { studyDate, completedAt: `${studyDate}T12:00:00`, total };
}

test("el objetivo diario es de 20 preguntas y varios tests del día se acumulan", () => {
  const attempts = [attempt("2026-08-09", 12), attempt("2026-08-09", 8)];
  const [day] = aggregateDailyAttempts(attempts);

  assert.equal(DAILY_QUESTION_TARGET, 20);
  assert.deepEqual(day, {
    studyDate: "2026-08-09",
    totalQuestions: 20,
    attemptCount: 2,
    targetQuestions: 20,
    goalMet: true,
  });
  assert.deepEqual(todayStudyProgress(attempts, localTimestamp(2026, 8, 9)), {
    studyDate: "2026-08-09",
    questionsCompleted: 20,
    attemptCount: 2,
    targetQuestions: 20,
    remainingQuestions: 0,
    goalMet: true,
  });
});

test("19 preguntas no completan el día y el progreso indica cuánto falta", () => {
  const progress = todayStudyProgress([attempt("2026-08-09", 19)], localTimestamp(2026, 8, 9));

  assert.equal(progress.goalMet, false);
  assert.equal(progress.remainingQuestions, 1);
  assert.equal(studyStreaks([attempt("2026-08-09", 19)], localTimestamp(2026, 8, 9)).currentStreak, 0);
});

test("studyDate prevalece sobre completedAt y los intentos inválidos se ignoran", () => {
  const days = aggregateDailyAttempts([
    { studyDate: "2026-08-08", completedAt: "2026-08-09T12:00:00", total: 20 },
    { studyDate: "fecha-inválida", completedAt: "2026-08-09T12:00:00", total: 4 },
    { completedAt: localTimestamp(2026, 8, 9, 23, 30), total: 6 },
    { completedAt: "fecha-inválida", total: 20 },
    { completedAt: localTimestamp(2026, 8, 9), total: 0 },
    null,
  ]);

  assert.deepEqual(days.map(({ studyDate, totalQuestions }) => ({ studyDate, totalQuestions })), [
    { studyDate: "2026-08-08", totalQuestions: 20 },
    { studyDate: "2026-08-09", totalQuestions: 10 },
  ]);
});

test("la fecha se obtiene en calendario local y acepta directamente YYYY-MM-DD", () => {
  assert.equal(localDateKey(localTimestamp(2026, 3, 29, 23, 30)), "2026-03-29");
  assert.equal(localDateKey("2026-10-25"), "2026-10-25");
  assert.throws(() => localDateKey("no-es-fecha"), /fecha válida/i);
});

test("la racha amable conserva la de ayer mientras hoy no llegue a 20", () => {
  const attempts = [
    attempt("2026-08-06", 20),
    attempt("2026-08-07", 20),
    attempt("2026-08-08", 20),
    attempt("2026-08-09", 19),
  ];

  assert.deepEqual(studyStreaks(attempts, localTimestamp(2026, 8, 9)), {
    currentStreak: 3,
    bestStreak: 3,
  });
});

test("al completar hoy, el día se incorpora a la racha", () => {
  const attempts = [
    attempt("2026-08-07", 20),
    attempt("2026-08-08", 20),
    attempt("2026-08-09", 20),
  ];

  assert.deepEqual(studyStreaks(attempts, localTimestamp(2026, 8, 9)), {
    currentStreak: 3,
    bestStreak: 3,
  });
});

test("los días vacíos rompen la racha actual sin borrar la mejor racha", () => {
  const attempts = [
    attempt("2026-08-01", 20),
    attempt("2026-08-02", 20),
    attempt("2026-08-03", 20),
    attempt("2026-08-05", 20),
    attempt("2026-08-06", 20),
  ];

  assert.deepEqual(studyStreaks(attempts, localTimestamp(2026, 8, 8)), {
    currentStreak: 0,
    bestStreak: 3,
  });
});

test("la semana va de lunes a domingo y cambia limpiamente al llegar el lunes", () => {
  const attempts = [
    attempt("2026-08-09", 20), // domingo
    attempt("2026-08-10", 20), // lunes siguiente
    attempt("2026-08-11", 25), // futuro respecto al momento consultado
  ];
  const sunday = currentWeekProgress(attempts, localTimestamp(2026, 8, 9));
  const monday = currentWeekProgress(attempts, localTimestamp(2026, 8, 10));

  assert.equal(sunday.weekStart, "2026-08-03");
  assert.equal(sunday.weekEnd, "2026-08-09");
  assert.equal(sunday.completedDays, 1);
  assert.deepEqual(sunday.completedDates, ["2026-08-09"]);

  assert.equal(monday.weekStart, "2026-08-10");
  assert.equal(monday.weekEnd, "2026-08-16");
  assert.equal(monday.completedDays, 1);
  assert.equal(monday.totalQuestions, 20);
  assert.deepEqual(monday.completedDates, ["2026-08-10"]);
});

test("una semana sin actividad devuelve siete días vacíos", () => {
  const week = currentWeekProgress([], localTimestamp(2026, 8, 12));

  assert.equal(week.completedDays, 0);
  assert.equal(week.totalQuestions, 0);
  assert.equal(week.days.length, 7);
  assert.ok(week.days.every((day) => day.totalQuestions === 0 && !day.goalMet));
});

test("los logros de tests, preguntas y constancia se derivan sin usar nota ni rapidez", () => {
  const attempts = [
    attempt("2026-08-06", 20),
    attempt("2026-08-07", 20),
    attempt("2026-08-08", 20),
  ];
  const achievements = deriveEducationalAchievements({
    attempts,
    totalTestsCompleted: 25,
    totalQuestionsCompleted: 500,
    now: localTimestamp(2026, 8, 9),
  });
  const byId = new Map(achievements.map((item) => [item.id, item]));

  assert.equal(byId.get("first-test").unlocked, true);
  assert.equal(byId.get("questions-100").unlocked, true);
  assert.equal(byId.get("questions-500").unlocked, true);
  assert.equal(byId.get("questions-1000").unlocked, false);
  assert.equal(byId.get("streak-3").unlocked, true);
  assert.equal(byId.get("streak-7").unlocked, false);
  assert.equal(byId.has("corrected-mistakes-10"), false);
  assert.equal(byId.has("all-topics"), false);
});

test("se reconoce el logro de corregir diez preguntas antes falladas", () => {
  const corrected = Array.from({ length: 10 }, (_, index) => ({
    questionId: `q-${index}`,
    incorrectCount: 1,
    correctCount: 1,
    latestStatus: "correct",
  }));
  const notCorrected = {
    questionId: "q-pending",
    incorrectCount: 2,
    correctCount: 1,
    latestStatus: "incorrect",
  };
  const achievement = deriveEducationalAchievements({
    questionStats: [...corrected, corrected[0], notCorrected],
  }).find(({ id }) => id === "corrected-mistakes-10");

  assert.equal(achievement.progress, 10);
  assert.equal(achievement.unlocked, true);
});

test("la cobertura temática solo aparece cuando se proporciona una cobertura válida", () => {
  const partial = deriveEducationalAchievements({
    topicCoverage: { coveredTopics: 31, totalTopics: 32 },
  }).find(({ id }) => id === "all-topics");
  const complete = deriveEducationalAchievements({
    topicCoverage: { coveredTopics: 32, totalTopics: 32 },
  }).find(({ id }) => id === "all-topics");
  const invalid = deriveEducationalAchievements({
    topicCoverage: { coveredTopics: 1, totalTopics: 0 },
  });

  assert.equal(partial.unlocked, false);
  assert.equal(partial.progress, 31);
  assert.equal(complete.unlocked, true);
  assert.equal(invalid.some(({ id }) => id === "all-topics"), false);
});

test("el resumen ofrece una única vista coherente para el panel", () => {
  const summary = buildGamificationSummary({
    attempts: [attempt("2026-08-09", 20)],
    totalTestsCompleted: 1,
    totalQuestionsCompleted: 20,
    now: localTimestamp(2026, 8, 9),
  });

  assert.equal(summary.dailyTarget, 20);
  assert.equal(summary.today.goalMet, true);
  assert.equal(summary.streaks.currentStreak, 1);
  assert.equal(summary.currentWeek.completedDays, 1);
  assert.equal(summary.achievements.find(({ id }) => id === "first-test").unlocked, true);
});
