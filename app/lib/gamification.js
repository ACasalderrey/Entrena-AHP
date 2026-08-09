export const DAILY_QUESTION_TARGET = 20;

const QUESTION_MILESTONES = [
  { target: 500, horizon: "initial" },
  { target: 1_000, horizon: "medium" },
  { target: 2_500, horizon: "medium" },
  { target: 5_000, horizon: "long" },
  { target: 10_000, horizon: "long" },
  { target: 20_000, horizon: "long" },
];
const STUDY_DAY_MILESTONES = [
  { target: 7, horizon: "initial" },
  { target: 30, horizon: "medium" },
  { target: 90, horizon: "medium" },
  { target: 180, horizon: "long" },
  { target: 365, horizon: "long" },
];
const STREAK_MILESTONES = [
  { target: 3, horizon: "initial" },
  { target: 7, horizon: "initial" },
  { target: 30, horizon: "medium" },
];
const CORRECTED_MISTAKE_MILESTONES = [
  { target: 10, horizon: "initial" },
  { target: 50, horizon: "medium" },
  { target: 100, horizon: "medium" },
  { target: 200, horizon: "long" },
];

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dateKeyParts(value) {
  if (typeof value !== "string") return null;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1_000 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(year, month - 1, day, 12);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDateKey(date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateFromKey(dateKey) {
  const parts = dateKeyParts(dateKey);
  if (!parts) throw new RangeError("La fecha de estudio debe tener el formato YYYY-MM-DD.");
  // Noon is deliberately used so DST changes cannot move the calendar day.
  return new Date(parts.year, parts.month - 1, parts.day, 12);
}

function shiftDateKey(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

/**
 * Returns the local calendar date for a timestamp. A valid YYYY-MM-DD value is
 * already a calendar date and is therefore returned without timezone conversion.
 */
export function localDateKey(value = Date.now()) {
  if (typeof value === "string" && dateKeyParts(value)) return value;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("El momento indicado no es una fecha válida.");
  return formatDateKey(date);
}

function validQuestionTotal(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function attemptDateKey(attempt) {
  if (!isRecord(attempt)) return null;
  if (dateKeyParts(attempt.studyDate)) return attempt.studyDate;
  if (attempt.completedAt === undefined || attempt.completedAt === null) return null;
  try {
    return localDateKey(attempt.completedAt);
  } catch {
    return null;
  }
}

function normalizedAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts.flatMap((attempt) => {
    const studyDate = attemptDateKey(attempt);
    if (!studyDate || !validQuestionTotal(attempt?.total)) return [];
    return [{ studyDate, total: attempt.total }];
  });
}

/**
 * Groups completed attempts by local study date. Several tests taken on the same
 * day add together towards the daily target.
 *
 * @param {Array<{studyDate?: string, completedAt?: number|string|Date, total: number}>} attempts
 */
export function aggregateDailyAttempts(attempts = []) {
  const byDate = new Map();

  for (const attempt of normalizedAttempts(attempts)) {
    const current = byDate.get(attempt.studyDate) ?? { totalQuestions: 0, attemptCount: 0 };
    current.totalQuestions += attempt.total;
    current.attemptCount += 1;
    byDate.set(attempt.studyDate, current);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([studyDate, value]) => ({
      studyDate,
      totalQuestions: value.totalQuestions,
      attemptCount: value.attemptCount,
      targetQuestions: DAILY_QUESTION_TARGET,
      goalMet: value.totalQuestions >= DAILY_QUESTION_TARGET,
    }));
}

function normalizedStoredActivity(dailyActivity) {
  if (!Array.isArray(dailyActivity)) return [];
  return dailyActivity.flatMap((day) => {
    if (
      !isRecord(day)
      || !dateKeyParts(day.studyDate)
      || !Number.isSafeInteger(day.totalQuestions)
      || day.totalQuestions < 0
    ) {
      return [];
    }
    return [{ studyDate: day.studyDate, totalQuestions: day.totalQuestions }];
  });
}

/**
 * Returns every calendar date that qualifies as a study day. Stored long-term
 * activity and the recent attempt window are merged without counting the same
 * questions twice; only dates with at least 20 completed questions qualify.
 */
export function completedStudyDays(attempts = [], dailyActivity = [], now = Date.now()) {
  const today = localDateKey(now);
  const byDate = new Map();

  for (const day of normalizedStoredActivity(dailyActivity)) {
    byDate.set(day.studyDate, Math.max(byDate.get(day.studyDate) ?? 0, day.totalQuestions));
  }
  for (const day of aggregateDailyAttempts(attempts)) {
    byDate.set(day.studyDate, Math.max(byDate.get(day.studyDate) ?? 0, day.totalQuestions));
  }

  return [...byDate.entries()]
    .filter(([studyDate, totalQuestions]) => studyDate <= today && totalQuestions >= DAILY_QUESTION_TARGET)
    .map(([studyDate]) => studyDate)
    .sort((left, right) => left.localeCompare(right));
}

function activityMap(attempts) {
  return new Map(aggregateDailyAttempts(attempts).map((day) => [day.studyDate, day]));
}

export function todayStudyProgress(attempts = [], now = Date.now()) {
  const studyDate = localDateKey(now);
  const day = activityMap(attempts).get(studyDate);
  const questionsCompleted = day?.totalQuestions ?? 0;

  return {
    studyDate,
    questionsCompleted,
    attemptCount: day?.attemptCount ?? 0,
    targetQuestions: DAILY_QUESTION_TARGET,
    remainingQuestions: Math.max(0, DAILY_QUESTION_TARGET - questionsCompleted),
    goalMet: questionsCompleted >= DAILY_QUESTION_TARGET,
  };
}

/**
 * Current streak uses a friendly rule: before today's target is reached, the
 * streak ending yesterday remains current. Once a missed day is behind us, it
 * breaks the streak normally.
 */
export function studyStreaks(attempts = [], now = Date.now(), dailyActivity = []) {
  const today = localDateKey(now);
  const completedDates = completedStudyDays(attempts, dailyActivity, now);
  const completed = new Set(completedDates);

  let bestStreak = 0;
  let running = 0;
  let previous = null;
  for (const studyDate of completedDates) {
    running = previous && shiftDateKey(previous, 1) === studyDate ? running + 1 : 1;
    bestStreak = Math.max(bestStreak, running);
    previous = studyDate;
  }

  let cursor = completed.has(today) ? today : shiftDateKey(today, -1);
  let currentStreak = 0;
  while (completed.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return { currentStreak, bestStreak };
}

export function currentWeekProgress(attempts = [], now = Date.now()) {
  const today = localDateKey(now);
  const todayDate = dateFromKey(today);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const weekStart = shiftDateKey(today, -mondayOffset);
  const weekEnd = shiftDateKey(weekStart, 6);
  const byDate = activityMap(attempts);

  const days = Array.from({ length: 7 }, (_, index) => {
    const studyDate = shiftDateKey(weekStart, index);
    const activity = studyDate <= today ? byDate.get(studyDate) : null;
    return {
      studyDate,
      totalQuestions: activity?.totalQuestions ?? 0,
      goalMet: activity?.goalMet ?? false,
    };
  });
  const completedDates = days.filter((day) => day.goalMet).map((day) => day.studyDate);

  return {
    weekStart,
    weekEnd,
    completedDays: completedDates.length,
    completedDates,
    totalQuestions: days.reduce((sum, day) => sum + day.totalQuestions, 0),
    days,
  };
}

function nonNegativeSafeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function achievement(id, title, description, value, target, horizon) {
  return {
    id,
    title,
    description,
    horizon,
    unlocked: value >= target,
    progress: Math.min(value, target),
    target,
  };
}

function correctedMistakeCount(questionStats) {
  if (!Array.isArray(questionStats)) return null;
  const corrected = new Set();

  questionStats.forEach((stat, index) => {
    if (!isRecord(stat)) return;
    const wasIncorrect = Number.isSafeInteger(stat.incorrectCount) && stat.incorrectCount > 0;
    const isNowCorrect = stat.latestStatus === "correct";
    if (wasIncorrect && isNowCorrect) corrected.add(stat.questionId ?? `stat-${index}`);
  });
  return corrected.size;
}

function normalizedTopicCoverage(topicCoverage) {
  if (!isRecord(topicCoverage)) return null;
  const { coveredTopics, totalTopics } = topicCoverage;
  if (
    !Number.isSafeInteger(coveredTopics)
    || !Number.isSafeInteger(totalTopics)
    || coveredTopics < 0
    || totalTopics < 1
  ) {
    return null;
  }
  return { coveredTopics: Math.min(coveredTopics, totalTopics), totalTopics };
}

/**
 * Derives educational achievements; no score, speed, XP or competitive data is
 * considered. `totalTestsCompleted` and `totalQuestionsCompleted` may be supplied
 * when the visible attempt list is only a recent-history window.
 *
 * Topic coverage uses `{ coveredTopics, totalTopics }`. A corrected mistake is a
 * question with `incorrectCount > 0` whose `latestStatus` is now `"correct"`.
 */
export function deriveEducationalAchievements({
  attempts = [],
  dailyActivity = [],
  totalTestsCompleted,
  totalQuestionsCompleted,
  questionStats,
  topicCoverage,
  now = Date.now(),
} = {}) {
  const validAttempts = normalizedAttempts(attempts);
  const tests = nonNegativeSafeInteger(totalTestsCompleted, validAttempts.length);
  const questions = nonNegativeSafeInteger(
    totalQuestionsCompleted,
    validAttempts.reduce((sum, attempt) => sum + attempt.total, 0),
  );
  const { bestStreak } = studyStreaks(attempts, now, dailyActivity);
  const studyDays = completedStudyDays(attempts, dailyActivity, now).length;

  const achievements = [
    achievement("first-test", "Primer test", "Completa tu primer test.", tests, 1, "initial"),
    ...QUESTION_MILESTONES.map(({ target, horizon }) => achievement(
      `questions-${target}`,
      `${target.toLocaleString("es-ES")} preguntas`,
      `Completa ${target.toLocaleString("es-ES")} preguntas.`,
      questions,
      target,
      horizon,
    )),
    ...STUDY_DAY_MILESTONES.map(({ target, horizon }) => achievement(
      `study-days-${target}`,
      `${target.toLocaleString("es-ES")} días de estudio`,
      `Completa al menos ${DAILY_QUESTION_TARGET} preguntas en ${target.toLocaleString("es-ES")} días distintos.`,
      studyDays,
      target,
      horizon,
    )),
    ...STREAK_MILESTONES.map(({ target, horizon }) => achievement(
      `streak-${target}`,
      `${target} días de constancia`,
      `Alcanza una racha de ${target} días de estudio.`,
      bestStreak,
      target,
      horizon,
    )),
  ];

  const corrected = correctedMistakeCount(questionStats);
  if (corrected !== null) {
    achievements.push(...CORRECTED_MISTAKE_MILESTONES.map(({ target, horizon }) => achievement(
      `corrected-mistakes-${target}`,
      target === 10 ? "Errores superados" : `${target} errores superados`,
      `Corrige ${target} preguntas que habías fallado anteriormente.`,
      corrected,
      target,
      horizon,
    )));
  }

  const coverage = normalizedTopicCoverage(topicCoverage);
  if (coverage) {
    achievements.push(achievement(
      "all-topics",
      "Todo el temario",
      "Practica al menos una pregunta de cada tema disponible.",
      coverage.coveredTopics,
      coverage.totalTopics,
      "medium",
    ));
  }

  return achievements;
}

/**
 * @param {{
 *   attempts?: Array<Record<string, any>>,
 *   dailyActivity?: Array<{studyDate: string, totalQuestions: number}>,
 *   totalTestsCompleted?: number,
 *   totalQuestionsCompleted?: number,
 *   questionStats?: Array<Record<string, any>>,
 *   topicCoverage?: {coveredTopics: number, totalTopics: number},
 *   now?: number | string | Date,
 * }} options
 */
export function buildGamificationSummary({
  attempts = [],
  dailyActivity = [],
  totalTestsCompleted,
  totalQuestionsCompleted,
  questionStats,
  topicCoverage,
  now = Date.now(),
} = {}) {
  const completedDays = completedStudyDays(attempts, dailyActivity, now);
  return {
    dailyTarget: DAILY_QUESTION_TARGET,
    dailyActivity: aggregateDailyAttempts(attempts),
    completedStudyDays: completedDays.length,
    today: todayStudyProgress(attempts, now),
    streaks: studyStreaks(attempts, now, dailyActivity),
    currentWeek: currentWeekProgress(attempts, now),
    achievements: deriveEducationalAchievements({
      attempts,
      dailyActivity,
      totalTestsCompleted,
      totalQuestionsCompleted,
      questionStats,
      topicCoverage,
      now,
    }),
  };
}
