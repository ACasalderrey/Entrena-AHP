"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import bankMetadata from "./data/bank-metadata.json";
import explanationData from "./data/explanations.json";
import legalVerificationData from "./data/legal-verification.json";
import questionTaxonomyData from "./data/question-taxonomy.json";
import questionData from "./data/questions.json";
import taxonomyData from "./data/taxonomy.json";
import {
  createProgressBackup,
  createProgressCache,
  parseProgressBackup,
  parseProgressCache,
} from "./lib/progress-backup";
import {
  evaluateTest,
  formatDuration,
  proportionalScoreOutOfTen,
  timeLimitMillisecondsFor,
} from "./lib/scoring";
import {
  DAILY_QUESTION_TARGET,
  buildGamificationSummary,
  localDateKey,
} from "./lib/gamification";

type OptionKey = "A" | "B" | "C" | "D";
type AnswerStatus = "correct" | "incorrect" | "blank";
type TestMode = "standard" | "review" | "daily";
type ContentType = "all" | "topic" | "norm";
type Stage = "setup" | "dashboard" | "quiz" | "results";

type ContentSelection = {
  type: ContentType;
  id: string | null;
  label: string | null;
};

type TaxonomyArea = { id: string; label: string };
type TaxonomyTopic = { id: string; areaId: string; label: string };
type TaxonomyNorm = { id: string; label: string; shortLabel?: string };
type TaxonomyNormGroup = { id: string; label: string; shortLabel?: string; normIds: string[] };
type QuestionTaxonomy = { topicId: string; normIds: string[] };
type AchievementHorizon = "initial" | "medium" | "long";
type Achievement = {
  id: string;
  title: string;
  description: string;
  horizon: AchievementHorizon;
  unlocked: boolean;
  progress: number;
  target: number;
};

type Question = {
  id: string;
  year: number;
  sourceQuestionNumber: number;
  prompt: string;
  options: Record<OptionKey, string>;
  correctOptions: OptionKey[];
  isReserve: false;
  answerKeyLabel: "definitiva";
  sources: {
    questionnaire: string;
    answerKey: string;
  };
};

type QuestionExplanation = {
  explanation: string;
  reference: string;
};

type ReviewItem = {
  question: Question;
  selectedOption: OptionKey | null;
  status: AnswerStatus;
};

type TestResult = {
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  directScore: number;
  scoreOutOfTen: number;
  durationMs: number;
  timeLimitMs: number;
  mode: TestMode;
  content: ContentSelection;
  items: ReviewItem[];
};

type AttemptItem = {
  questionId: string;
  selectedOption: OptionKey | null;
  status: AnswerStatus;
};

type Attempt = {
  id: string;
  completedAt: number;
  mode: TestMode;
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  directScore: number;
  durationMs: number | null;
  timeLimitMs: number | null;
  studyDate: string;
  contentType: ContentType;
  contentId: string | null;
  contentLabel: string | null;
};

type AttemptSubmission = Attempt & { items: AttemptItem[] };

type QuestionStat = {
  questionId: string;
  attempts: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  lastSeen: number;
  latestStatus: AnswerStatus;
};

type DailyActivity = {
  studyDate: string;
  totalTests: number;
  totalQuestions: number;
};

type ProgressSettings = {
  weeklyGoal: number;
  gamificationEnabled: boolean;
  updatedAt: number | null;
};

type ProgressData = {
  attempts: Attempt[];
  questionStats: QuestionStat[];
  dailyActivity: DailyActivity[];
  settings: ProgressSettings;
  summary: {
    totalTests: number;
    totalQuestions: number;
    correct: number;
    incorrect: number;
    blank: number;
    directScore: number;
  };
};

type PendingAttempt = {
  profileKey: string;
  attempt: AttemptSubmission;
};

type CachedProgressData = {
  profileKey: string;
  progress: ProgressData;
  appliedAttemptIds: string[];
};

type ProgressBackupData = CachedProgressData & {
  pendingAttempts: AttemptSubmission[];
};

type ProgressBundle = {
  progress: ProgressData;
  appliedAttemptIds: Set<string>;
};

const QUESTIONS = questionData as Question[];
const QUESTIONS_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
const ANSWERS_BY_QUESTION = new Map(QUESTIONS.map((question) => [question.id, question.correctOptions[0]]));
const EXPLANATIONS = explanationData as Record<string, QuestionExplanation>;
const HISTORICAL_ONLY = legalVerificationData.historicalOnly as Record<string, string>;
const SOURCE_PENDING = legalVerificationData.sourcePending as Record<string, string>;
const TRACEABLE_EXPLANATIONS = legalVerificationData.coveredByLibrary + legalVerificationData.checkedWithExternalOfficialSources;
const TAXONOMY = taxonomyData as {
  areas: TaxonomyArea[];
  topics: TaxonomyTopic[];
  norms: TaxonomyNorm[];
  normGroups: TaxonomyNormGroup[];
};
const QUESTION_TAXONOMY = questionTaxonomyData as Record<string, QuestionTaxonomy>;
const TOPIC_QUESTIONS = new Map(TAXONOMY.topics.map((topic) => [
  topic.id,
  QUESTIONS.filter((question) => QUESTION_TAXONOMY[question.id]?.topicId === topic.id),
]));
const NORM_GROUP_QUESTIONS = new Map(TAXONOMY.normGroups.map((group) => [
  group.id,
  QUESTIONS.filter((question) => QUESTION_TAXONOMY[question.id]?.normIds.some((normId) => group.normIds.includes(normId))),
]));
const AVAILABLE_TOPICS = TAXONOMY.topics.filter((topic) => (TOPIC_QUESTIONS.get(topic.id)?.length ?? 0) > 0);
const MIN_NORM_GROUP_QUESTIONS = 5;
const AVAILABLE_NORM_GROUPS = TAXONOMY.normGroups.filter(
  (group) => (NORM_GROUP_QUESTIONS.get(group.id)?.length ?? 0) >= MIN_NORM_GROUP_QUESTIONS,
);
const ACHIEVEMENT_HORIZONS: Array<{ id: AchievementHorizon; label: string; description: string }> = [
  { id: "initial", label: "Primeros pasos", description: "Hitos para poner en marcha un hábito sólido." },
  { id: "medium", label: "Medio plazo", description: "Objetivos para sostener el estudio durante varios meses." },
  { id: "long", label: "Largo plazo", description: "Metas pensadas para una preparación de 9 a 24 meses." },
];
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const PRESETS = [10, 20, 40, 80];
const PROFILE_STORAGE_KEY = "entrena-ahp-progress-key";
const PENDING_STORAGE_PREFIX = "entrena-ahp-pending-attempt:";
const PROGRESS_CACHE_PREFIX = "entrena-ahp-progress-cache:v1:";
const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;
const PROGRESS_API_META_NAME = "entrena-ahp-progress-api";
const DEFAULT_PROGRESS_API_ENDPOINT = "/api/progress";
const PROFILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALL_CONTENT: ContentSelection = { type: "all", id: null, label: null };

const EMPTY_PROGRESS: ProgressData = {
  attempts: [],
  questionStats: [],
  dailyActivity: [],
  settings: { weeklyGoal: 4, gamificationEnabled: true, updatedAt: null },
  summary: { totalTests: 0, totalQuestions: 0, correct: 0, incorrect: 0, blank: 0, directScore: 0 },
};

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function numberFrom(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableMillisecondsFrom(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeProgress(value: unknown): ProgressData {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawSummary = (raw.summary && typeof raw.summary === "object" ? raw.summary : {}) as Record<string, unknown>;
  const rawSettings = (raw.settings && typeof raw.settings === "object" ? raw.settings : {}) as Record<string, unknown>;
  const rawAttempts = Array.isArray(raw.attempts) ? raw.attempts : [];
  const rawStats = Array.isArray(raw.questionStats) ? raw.questionStats : [];
  const rawDailyActivity = Array.isArray(raw.dailyActivity) ? raw.dailyActivity : [];

  const attempts = rawAttempts.map((entry): Attempt => {
    const item = entry as Record<string, unknown>;
    const total = numberFrom(item.total);
    const completedAt = numberFrom(item.completedAt);
    const durationMs = nullableMillisecondsFrom(item.durationMs);
    const timeLimitMs = nullableMillisecondsFrom(item.timeLimitMs);
    const hasValidTiming = durationMs !== null && timeLimitMs === timeLimitMillisecondsFor(total);
    const isScoped = (item.contentType === "topic" || item.contentType === "norm")
      && typeof item.contentId === "string"
      && typeof item.contentLabel === "string";
    return {
      id: String(item.id ?? ""),
      completedAt,
      mode: item.mode === "review" || item.mode === "daily" ? item.mode : "standard",
      total,
      correct: numberFrom(item.correct),
      incorrect: numberFrom(item.incorrect),
      blank: numberFrom(item.blank),
      directScore: numberFrom(item.directScore),
      durationMs: hasValidTiming ? durationMs : null,
      timeLimitMs: hasValidTiming ? timeLimitMs : null,
      studyDate: typeof item.studyDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.studyDate)
        ? item.studyDate
        : localDateKey(completedAt),
      contentType: isScoped ? item.contentType as "topic" | "norm" : "all",
      contentId: isScoped ? String(item.contentId) : null,
      contentLabel: isScoped ? String(item.contentLabel) : null,
    };
  });

  const dailyActivity = rawDailyActivity.length
    ? rawDailyActivity.map((entry): DailyActivity => {
        const item = entry as Record<string, unknown>;
        return {
          studyDate: String(item.studyDate ?? ""),
          totalTests: numberFrom(item.totalTests),
          totalQuestions: numberFrom(item.totalQuestions),
        };
      }).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.studyDate))
    : [...attempts.reduce((days, attempt) => {
        const current = days.get(attempt.studyDate) ?? { studyDate: attempt.studyDate, totalTests: 0, totalQuestions: 0 };
        current.totalTests += 1;
        current.totalQuestions += attempt.total;
        days.set(attempt.studyDate, current);
        return days;
      }, new Map<string, DailyActivity>()).values()];

  return {
    attempts,
    questionStats: rawStats.map((entry) => {
      const item = entry as Record<string, unknown>;
      const latestStatus = item.latestStatus === "correct" || item.latestStatus === "incorrect" ? item.latestStatus : "blank";
      return {
        questionId: String(item.questionId ?? ""),
        attempts: numberFrom(item.attempts),
        correctCount: numberFrom(item.correctCount),
        incorrectCount: numberFrom(item.incorrectCount),
        blankCount: numberFrom(item.blankCount),
        lastSeen: numberFrom(item.lastSeen),
        latestStatus,
      };
    }),
    dailyActivity,
    settings: {
      weeklyGoal: Number.isInteger(rawSettings.weeklyGoal) && Number(rawSettings.weeklyGoal) >= 1 && Number(rawSettings.weeklyGoal) <= 7
        ? Number(rawSettings.weeklyGoal)
        : 4,
      gamificationEnabled: rawSettings.gamificationEnabled !== false,
      updatedAt: nullableMillisecondsFrom(rawSettings.updatedAt),
    },
    summary: {
      totalTests: numberFrom(rawSummary.totalTests),
      totalQuestions: numberFrom(rawSummary.totalQuestions),
      correct: numberFrom(rawSummary.correct),
      incorrect: numberFrom(rawSummary.incorrect),
      blank: numberFrom(rawSummary.blank),
      directScore: numberFrom(rawSummary.directScore),
    },
  };
}

function progressCacheKey(profileKey: string) {
  return `${PROGRESS_CACHE_PREFIX}${profileKey}`;
}

function readCachedProgress(profileKey: string): CachedProgressData | null {
  if (typeof window === "undefined" || !PROFILE_PATTERN.test(profileKey)) return null;
  try {
    const serialized = localStorage.getItem(progressCacheKey(profileKey));
    if (!serialized) return null;
    const parsed = parseProgressCache(serialized, ANSWERS_BY_QUESTION) as CachedProgressData | null;
    return parsed ? { ...parsed, progress: normalizeProgress(parsed.progress) } : null;
  } catch {
    return null;
  }
}

function writeCachedProgress(
  profileKey: string,
  progress: ProgressData,
  appliedAttemptIds: Iterable<string>,
): boolean {
  try {
    localStorage.setItem(
      progressCacheKey(profileKey),
      createProgressCache({ profileKey, progress, appliedAttemptIds }),
    );
    return true;
  } catch {
    return false;
  }
}

function applyAttempt(
  previous: ProgressData,
  attempt: AttemptSubmission,
  appliedAttemptIds?: Set<string>,
): ProgressData {
  if (appliedAttemptIds?.has(attempt.id) || previous.attempts.some((item) => item.id === attempt.id)) {
    appliedAttemptIds?.add(attempt.id);
    return previous;
  }
  appliedAttemptIds?.add(attempt.id);

  const stats = new Map(previous.questionStats.map((item) => [item.questionId, { ...item }]));
  for (const item of attempt.items) {
    const current = stats.get(item.questionId) ?? {
      questionId: item.questionId,
      attempts: 0,
      correctCount: 0,
      incorrectCount: 0,
      blankCount: 0,
      lastSeen: 0,
      latestStatus: "blank" as AnswerStatus,
    };
    current.attempts += 1;
    current.correctCount += item.status === "correct" ? 1 : 0;
    current.incorrectCount += item.status === "incorrect" ? 1 : 0;
    current.blankCount += item.status === "blank" ? 1 : 0;
    current.lastSeen = attempt.completedAt;
    current.latestStatus = item.status;
    stats.set(item.questionId, current);
  }

  const activity = new Map(previous.dailyActivity.map((day) => [day.studyDate, { ...day }]));
  const activeDay = activity.get(attempt.studyDate) ?? {
    studyDate: attempt.studyDate,
    totalTests: 0,
    totalQuestions: 0,
  };
  activeDay.totalTests += 1;
  activeDay.totalQuestions += attempt.total;
  activity.set(attempt.studyDate, activeDay);

  return {
    attempts: [attempt, ...previous.attempts].slice(0, 100),
    questionStats: [...stats.values()].sort((a, b) => b.incorrectCount - a.incorrectCount || b.lastSeen - a.lastSeen),
    dailyActivity: [...activity.values()].sort((a, b) => a.studyDate.localeCompare(b.studyDate)),
    settings: previous.settings,
    summary: {
      totalTests: previous.summary.totalTests + 1,
      totalQuestions: previous.summary.totalQuestions + attempt.total,
      correct: previous.summary.correct + attempt.correct,
      incorrect: previous.summary.incorrect + attempt.incorrect,
      blank: previous.summary.blank + attempt.blank,
      directScore: previous.summary.directScore + attempt.directScore,
    },
  };
}

function preserveLocalTimings(remote: ProgressData, cached?: ProgressData): ProgressData {
  if (!cached) return remote;
  const cachedById = new Map(cached.attempts.map((attempt) => [attempt.id, attempt]));
  return {
    ...remote,
    attempts: remote.attempts.map((attempt) => {
      if (attempt.durationMs !== null && attempt.timeLimitMs !== null) return attempt;
      const local = cachedById.get(attempt.id);
      return local?.durationMs !== null && local?.durationMs !== undefined && local.timeLimitMs !== null
        ? { ...attempt, durationMs: local.durationMs, timeLimitMs: local.timeLimitMs }
        : attempt;
    }),
  };
}

function readPendingAttempts(): PendingAttempt[] {
  try {
    const pending: PendingAttempt[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PENDING_STORAGE_PREFIX)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<PendingAttempt> | null;
      const attempt = parsed?.attempt as Partial<AttemptSubmission> | undefined;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.profileKey === "string" &&
        PROFILE_PATTERN.test(parsed.profileKey) &&
        attempt &&
        typeof attempt === "object" &&
        typeof attempt.id === "string" &&
        typeof attempt.completedAt === "number" &&
        (attempt.mode === "standard" || attempt.mode === "review" || attempt.mode === "daily") &&
        typeof attempt.total === "number" &&
        typeof attempt.correct === "number" &&
        typeof attempt.incorrect === "number" &&
        typeof attempt.blank === "number" &&
        typeof attempt.directScore === "number" &&
        ((attempt.durationMs === undefined && attempt.timeLimitMs === undefined) ||
          (attempt.durationMs === null && attempt.timeLimitMs === null) ||
          (typeof attempt.durationMs === "number" &&
            Number.isSafeInteger(attempt.durationMs) &&
            attempt.durationMs >= 0 &&
            typeof attempt.timeLimitMs === "number" &&
            Number.isSafeInteger(attempt.timeLimitMs) &&
            attempt.timeLimitMs === attempt.total * 67_500)) &&
        Array.isArray(attempt.items) &&
        attempt.items.every((item) =>
          item &&
          typeof item.questionId === "string" &&
          (item.selectedOption === null || OPTION_KEYS.includes(item.selectedOption)) &&
          (item.status === "correct" || item.status === "incorrect" || item.status === "blank"),
        )
      ) {
        pending.push(parsed as PendingAttempt);
      }
    }
    return pending;
  } catch {
    return [];
  }
}

function removePendingAttempt(id: string) {
  try {
    localStorage.removeItem(`${PENDING_STORAGE_PREFIX}${id}`);
  } catch {
    // Un duplicado posterior es inocuo: la API trata los UUID de intento como idempotentes.
  }
}

function queueAttempt(profileKey: string, attempt: AttemptSubmission): boolean {
  try {
    localStorage.setItem(
      `${PENDING_STORAGE_PREFIX}${attempt.id}`,
      JSON.stringify({ profileKey, attempt } satisfies PendingAttempt),
    );
    return true;
  } catch {
    return false;
  }
}

function getOrCreateProfileKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY)?.trim() ?? "";
    const key = PROFILE_PATTERN.test(stored) ? stored : crypto.randomUUID();
    localStorage.setItem(PROFILE_STORAGE_KEY, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function progressApiEndpoint(): string {
  if (typeof document === "undefined") return DEFAULT_PROGRESS_API_ENDPOINT;
  const configured = document
    .querySelector<HTMLMetaElement>(`meta[name="${PROGRESS_API_META_NAME}"]`)
    ?.content.trim();
  return configured || DEFAULT_PROGRESS_API_ENDPOINT;
}

async function postAttempt(profileKey: string, attempt: AttemptSubmission) {
  const response = await fetch(progressApiEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-progress-key": profileKey },
    body: JSON.stringify({ attempt }),
  });
  if (!response.ok) throw new Error("No se pudo guardar el intento");
}

async function patchProgressSettings(profileKey: string, settings: Pick<ProgressSettings, "weeklyGoal" | "gamificationEnabled">) {
  const response = await fetch(progressApiEndpoint(), {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-progress-key": profileKey },
    body: JSON.stringify({ settings }),
  });
  if (!response.ok) throw new Error("No se pudieron guardar las preferencias");
  return response.json() as Promise<{ settings?: ProgressSettings }>;
}

async function flushPendingAttempts(): Promise<boolean> {
  const pending = readPendingAttempts();
  let failed = 0;
  for (const item of pending) {
    try {
      await postAttempt(item.profileKey, item.attempt);
      removePendingAttempt(item.attempt.id);
    } catch {
      failed += 1;
    }
  }
  return failed === 0;
}

function formatScore(value: number) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStudyDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date).replace(".", ""),
    day: new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(date),
  };
}

function attemptTitle(attempt: Attempt) {
  if (attempt.mode === "daily") return "Práctica de hoy";
  if (attempt.mode === "review") return "Repaso de preguntas falladas";
  if (attempt.contentType === "topic") return `Test temático · ${attempt.contentLabel}`;
  if (attempt.contentType === "norm") return `Práctica normativa · ${attempt.contentLabel}`;
  return "Test aleatorio";
}

function scrollToTop() {
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function Brand() {
  return (
    <div className="brand" aria-label="Entrena AHP">
      <span className="brand-mark" aria-hidden="true">✓</span>
      <span className="brand-name">Entrena AHP</span>
    </div>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [questionCount, setQuestionCount] = useState(20);
  const [contentType, setContentType] = useState<ContentType>("all");
  const [contentId, setContentId] = useState("");
  const [reviewCount, setReviewCount] = useState(10);
  const [quizMode, setQuizMode] = useState<TestMode>("standard");
  const [quizContent, setQuizContent] = useState<ContentSelection>(ALL_CONTENT);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [finishPrompt, setFinishPrompt] = useState(false);
  const [timingVisible, setTimingVisible] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [profileKey, setProfileKey] = useState(getOrCreateProfileKey);
  const [profileInput, setProfileInput] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [initialCache] = useState<CachedProgressData | null>(() => profileKey ? readCachedProgress(profileKey) : null);
  const [progressData, setProgressData] = useState<ProgressData>(initialCache?.progress ?? EMPTY_PROGRESS);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "offline" | "local">(
    initialCache ? "local" : "loading",
  );
  const syncRequest = useRef(0);
  const volatilePending = useRef<PendingAttempt[]>([]);
  const appliedAttemptIds = useRef(new Set(initialCache?.appliedAttemptIds ?? []));
  const activeProgressKey = useRef(profileKey);
  const backupFileInput = useRef<HTMLInputElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const quizStartedAt = useRef<number | null>(null);
  const isFinishing = useRef(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const workerUrl = new URL("sw.js", document.baseURI);
      navigator.serviceWorker.register(workerUrl).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!profileKey) return undefined;
    void synchronize(profileKey);

    const handleOnline = () => void synchronize(profileKey);
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // La sincronización se reinicia si se importa otro código de progreso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  useEffect(() => {
    if (!profileKey || activeProgressKey.current !== profileKey) return;
    writeCachedProgress(profileKey, progressData, appliedAttemptIds.current);
  }, [profileKey, progressData]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => pageHeading.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [stage, currentIndex]);

  useEffect(() => {
    if (stage !== "quiz" || !timingVisible || quizStartedAt.current === null) return undefined;
    const updateElapsed = () => setElapsedMs(Math.max(0, Date.now() - (quizStartedAt.current ?? Date.now())));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [stage, timingVisible]);

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = quizQuestions.length - answeredCount;
  const currentQuestion = quizQuestions[currentIndex];
  const progress = quizQuestions.length ? ((currentIndex + 1) / quizQuestions.length) * 100 : 0;
  const yearSummary = useMemo(
    () => Object.entries(bankMetadata.countsByYear) as [string, number][],
    [],
  );
  const selectedContent = useMemo<ContentSelection>(() => {
    if (contentType === "all") return ALL_CONTENT;
    const catalog = contentType === "topic" ? AVAILABLE_TOPICS : AVAILABLE_NORM_GROUPS;
    const selected = catalog.find((item) => item.id === contentId) ?? catalog[0];
    return selected
      ? { type: contentType, id: selected.id, label: selected.label }
      : ALL_CONTENT;
  }, [contentId, contentType]);
  const availableQuestions = useMemo(() => {
    if (selectedContent.type === "topic" && selectedContent.id) {
      return TOPIC_QUESTIONS.get(selectedContent.id) ?? [];
    }
    if (selectedContent.type === "norm" && selectedContent.id) {
      return NORM_GROUP_QUESTIONS.get(selectedContent.id) ?? [];
    }
    return QUESTIONS;
  }, [selectedContent]);
  const availablePresets = useMemo(() => {
    const maximum = availableQuestions.length;
    const presets = PRESETS.filter((preset) => preset <= maximum);
    if (maximum > 0 && !presets.includes(maximum) && (maximum < 80 || presets.length === 0)) presets.push(maximum);
    return [...new Set(presets)].sort((left, right) => left - right);
  }, [availableQuestions.length]);

  useEffect(() => {
    setQuestionCount((current) => Math.max(1, Math.min(availableQuestions.length || 1, current)));
  }, [availableQuestions.length]);

  const weakQuestions = useMemo(
    () => progressData.questionStats
      .filter((stat) => stat.incorrectCount > 0 && stat.latestStatus !== "correct")
      .map((stat) => ({ stat, question: QUESTIONS_BY_ID.get(stat.questionId) }))
      .filter((item): item is { stat: QuestionStat; question: Question } => Boolean(item.question)),
    [progressData.questionStats],
  );
  const topicProgress = useMemo(() => {
    const statsByQuestion = new Map(progressData.questionStats.map((stat) => [stat.questionId, stat]));
    return TAXONOMY.topics.map((topic) => {
      const questions = TOPIC_QUESTIONS.get(topic.id) ?? [];
      const practiced = questions.filter((question) => (statsByQuestion.get(question.id)?.attempts ?? 0) > 0);
      const totals = practiced.reduce((summary, question) => {
        const stat = statsByQuestion.get(question.id);
        if (!stat) return summary;
        summary.correct += stat.correctCount;
        summary.answered += stat.correctCount + stat.incorrectCount;
        return summary;
      }, { correct: 0, answered: 0 });
      return {
        ...topic,
        totalQuestions: questions.length,
        practicedQuestions: practiced.length,
        accuracy: totals.answered ? (totals.correct / totals.answered) * 100 : null,
      };
    });
  }, [progressData.questionStats]);
  const coveredTopics = topicProgress.filter((topic) => topic.practicedQuestions > 0).length;
  const gamification = useMemo(() => buildGamificationSummary({
    attempts: progressData.dailyActivity.map((day) => ({
      studyDate: day.studyDate,
      total: day.totalQuestions,
    })),
    dailyActivity: progressData.dailyActivity,
    totalTestsCompleted: progressData.summary.totalTests,
    totalQuestionsCompleted: progressData.summary.totalQuestions,
    questionStats: progressData.questionStats,
    topicCoverage: { coveredTopics, totalTopics: AVAILABLE_TOPICS.length },
  }), [coveredTopics, progressData.dailyActivity, progressData.questionStats, progressData.summary.totalQuestions, progressData.summary.totalTests]);

  async function requestProgress(key: string): Promise<ProgressData> {
    const response = await fetch(progressApiEndpoint(), { headers: { "x-progress-key": key } });
    if (!response.ok) throw new Error("No se pudo cargar el progreso");
    return normalizeProgress(await response.json());
  }

  function mergePending(
    key: string,
    base: ProgressData,
    knownAttemptIds: Iterable<string> = [],
  ): ProgressBundle {
    const ids = new Set(knownAttemptIds);
    const progress = [...readPendingAttempts(), ...volatilePending.current]
      .filter((item) => item.profileKey === key)
      .reduce((current, item) => applyAttempt(current, item.attempt, ids), base);
    return { progress, appliedAttemptIds: ids };
  }

  function activateProgress(key: string, bundle: ProgressBundle) {
    activeProgressKey.current = key;
    appliedAttemptIds.current = bundle.appliedAttemptIds;
    setProgressData(bundle.progress);
  }

  async function synchronize(key: string) {
    const requestId = ++syncRequest.current;
    setSyncState("loading");
    const cached = readCachedProgress(key);
    const localFlushed = await flushPendingAttempts();

    const volatileSnapshot = volatilePending.current.splice(0);
    const volatileRemaining: PendingAttempt[] = [];
    for (const item of volatileSnapshot) {
      try {
        await postAttempt(item.profileKey, item.attempt);
      } catch {
        volatileRemaining.push(item);
      }
    }
    volatilePending.current.unshift(...volatileRemaining);

    try {
      const fetched = await requestProgress(key);
      const localSettings = cached?.progress.settings;
      if (
        localSettings?.updatedAt &&
        (!fetched.settings.updatedAt || localSettings.updatedAt > fetched.settings.updatedAt)
      ) {
        try {
          const response = await patchProgressSettings(key, {
            weeklyGoal: localSettings.weeklyGoal,
            gamificationEnabled: localSettings.gamificationEnabled,
          });
          if (response.settings) fetched.settings = response.settings;
        } catch {
          fetched.settings = localSettings;
        }
      }
      const remote = preserveLocalTimings(fetched, cached?.progress);
      if (syncRequest.current !== requestId) return;
      const remoteIds = new Set(cached?.appliedAttemptIds ?? []);
      remote.attempts.forEach((attempt) => remoteIds.add(attempt.id));
      const remoteBundle = mergePending(key, remote, remoteIds);

      if (cached && cached.progress.summary.totalTests > remoteBundle.progress.summary.totalTests) {
        const protectedBundle = mergePending(key, cached.progress, cached.appliedAttemptIds);
        activateProgress(key, protectedBundle);
        setSyncState("local");
        return;
      }

      activateProgress(key, remoteBundle);
      setSyncState(localFlushed && volatileRemaining.length === 0 ? "ready" : "offline");
    } catch {
      if (syncRequest.current !== requestId) return;
      setProgressData((current) => {
        const currentBelongsToKey = activeProgressKey.current === key;
        const base = cached?.progress ?? (currentBelongsToKey ? current : EMPTY_PROGRESS);
        const knownIds = cached?.appliedAttemptIds ?? (currentBelongsToKey ? appliedAttemptIds.current : []);
        const localBundle = mergePending(key, base, knownIds);
        activeProgressKey.current = key;
        appliedAttemptIds.current = localBundle.appliedAttemptIds;
        return localBundle.progress;
      });
      setSyncState("offline");
    }
  }

  function chooseContentType(nextType: ContentType) {
    setContentType(nextType);
    if (nextType === "topic") setContentId(AVAILABLE_TOPICS[0]?.id ?? "");
    if (nextType === "norm") setContentId(AVAILABLE_NORM_GROUPS[0]?.id ?? "");
    if (nextType === "all") setContentId("");
  }

  function startQuiz(pool: Question[], count: number, mode: TestMode, content: ContentSelection = ALL_CONTENT) {
    const selectedCount = Math.max(1, Math.min(pool.length, Math.floor(count)));
    setQuizMode(mode);
    setQuizContent(content);
    setQuizQuestions(shuffled(pool).slice(0, selectedCount));
    setAnswers({});
    setCurrentIndex(0);
    setFinishPrompt(false);
    setTimingVisible(false);
    setElapsedMs(0);
    setResult(null);
    quizStartedAt.current = Date.now();
    isFinishing.current = false;
    setStage("quiz");
    scrollToTop();
  }

  function startTest() {
    const selectedCount = Math.max(1, Math.min(availableQuestions.length, Math.floor(questionCount)));
    setQuestionCount(selectedCount);
    startQuiz(availableQuestions, selectedCount, "standard", selectedContent);
  }

  function startReviewTest() {
    if (weakQuestions.length === 0) return;
    startQuiz(weakQuestions.map((item) => item.question), Math.min(reviewCount, weakQuestions.length), "review");
  }

  function startDailyPractice() {
    const statsByQuestion = new Map(progressData.questionStats.map((stat) => [stat.questionId, stat]));
    const pendingMistakes = shuffled(weakQuestions.map((item) => item.question));
    const unseen = shuffled(QUESTIONS.filter((question) => !statsByQuestion.has(question.id)));
    const seen = shuffled(QUESTIONS.filter((question) => statsByQuestion.has(question.id)));
    const unique = new Map<string, Question>();
    [...pendingMistakes, ...unseen, ...seen].forEach((question) => unique.set(question.id, question));
    startQuiz([...unique.values()].slice(0, DAILY_QUESTION_TARGET), DAILY_QUESTION_TARGET, "daily");
  }

  function prepareTopicTest(topicId: string) {
    setContentType("topic");
    setContentId(topicId);
    setQuestionCount(Math.min(20, TOPIC_QUESTIONS.get(topicId)?.length ?? 20));
    resetTest();
  }

  async function updateProgressSettings(next: Pick<ProgressSettings, "weeklyGoal" | "gamificationEnabled">) {
    const previous = progressData.settings;
    const optimistic = { ...previous, ...next, updatedAt: Date.now() };
    setSettingsMessage("Guardando…");
    setProgressData((current) => ({ ...current, settings: optimistic }));
    try {
      const response = await patchProgressSettings(profileKey, next);
      const saved = response.settings ? normalizeProgress({ settings: response.settings }).settings : optimistic;
      setProgressData((current) => ({ ...current, settings: saved }));
      setSettingsMessage("Preferencias guardadas.");
    } catch {
      setProgressData((current) => ({ ...current, settings: previous }));
      setSettingsMessage("No se pudieron guardar. Inténtalo de nuevo cuando tengas conexión.");
    }
  }

  function chooseAnswer(questionId: string, option: OptionKey) {
    setAnswers((previous) => ({ ...previous, [questionId]: option }));
    setFinishPrompt(false);
  }

  function moveTo(index: number) {
    setCurrentIndex(Math.max(0, Math.min(quizQuestions.length - 1, index)));
    setFinishPrompt(false);
    scrollToTop();
  }

  function requestFinish() {
    if (unansweredCount > 0) {
      setFinishPrompt(true);
      return;
    }
    finishTest();
  }

  function finishTest() {
    if (isFinishing.current) return;
    isFinishing.current = true;
    const completedAt = Date.now();
    const durationMs = Math.max(0, completedAt - (quizStartedAt.current ?? completedAt));
    const timeLimitMs = timeLimitMillisecondsFor(quizQuestions.length);
    const evaluated = evaluateTest(quizQuestions, answers) as Omit<TestResult, "durationMs" | "timeLimitMs">;
    const timedResult: TestResult = { ...evaluated, durationMs, timeLimitMs, mode: quizMode, content: quizContent };
    const key = profileKey || crypto.randomUUID();
    if (!profileKey) {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, key);
      } catch {
        // El progreso sigue funcionando durante esta sesión aunque el navegador bloquee el almacenamiento local.
      }
      setProfileKey(key);
    }
    const attempt: AttemptSubmission = {
      id: crypto.randomUUID(),
      completedAt,
      mode: quizMode,
      total: evaluated.total,
      correct: evaluated.correct,
      incorrect: evaluated.incorrect,
      blank: evaluated.blank,
      directScore: evaluated.directScore,
      durationMs,
      timeLimitMs,
      studyDate: localDateKey(completedAt),
      contentType: quizContent.type,
      contentId: quizContent.id,
      contentLabel: quizContent.label,
      items: evaluated.items.map((item) => ({
        questionId: item.question.id,
        selectedOption: item.selectedOption,
        status: item.status,
      })),
    };

    setResult(timedResult);
    quizStartedAt.current = null;
    activeProgressKey.current = key;
    setProgressData((current) => applyAttempt(current, attempt, appliedAttemptIds.current));
    if (!queueAttempt(key, attempt)) {
      volatilePending.current.push({ profileKey: key, attempt });
    }
    setFinishPrompt(false);
    setStage("results");
    scrollToTop();
    void synchronize(key);
  }

  function resetTest() {
    setStage("setup");
    setQuizQuestions([]);
    setAnswers({});
    setResult(null);
    setFinishPrompt(false);
    setTimingVisible(false);
    setElapsedMs(0);
    quizStartedAt.current = null;
    isFinishing.current = false;
    scrollToTop();
  }

  function showDashboard() {
    setStage("dashboard");
    scrollToTop();
    if (profileKey) void synchronize(profileKey);
  }

  async function copyProfileKey() {
    try {
      await navigator.clipboard.writeText(profileKey);
      setProfileMessage("Código copiado.");
    } catch {
      setProfileMessage("No se pudo copiar automáticamente; selecciónalo y cópialo.");
    }
  }

  async function importProfileKey() {
    const key = profileInput.trim().toLowerCase();
    if (!PROFILE_PATTERN.test(key)) {
      setProfileMessage("El código no tiene un formato válido.");
      return;
    }

    const requestId = ++syncRequest.current;
    setProfileMessage("Comprobando el código…");
    try {
      let remote = await requestProgress(key);
      if (syncRequest.current !== requestId) return;
      if (remote.summary.totalTests === 0) {
        setProfileMessage("No se encontró historial para ese código. Se conserva tu progreso actual.");
        if (profileKey) void synchronize(profileKey);
        return;
      }

      let stored = true;
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, key);
      } catch {
        stored = false;
      }
      setProfileKey(key);
      setProfileInput("");
      const cached = readCachedProgress(key);
      remote = preserveLocalTimings(remote, cached?.progress);
      const remoteIds = new Set(cached?.appliedAttemptIds ?? []);
      remote.attempts.forEach((attempt) => remoteIds.add(attempt.id));
      const remoteBundle = mergePending(key, remote, remoteIds);
      if (cached && cached.progress.summary.totalTests > remoteBundle.progress.summary.totalTests) {
        activateProgress(key, mergePending(key, cached.progress, cached.appliedAttemptIds));
        setSyncState("local");
        setProfileMessage("Código recuperado. Se ha protegido una copia local con más tests que el historial remoto.");
      } else {
        activateProgress(key, remoteBundle);
        setSyncState("ready");
        setProfileMessage(stored
          ? "Progreso recuperado con el nuevo código."
          : "Progreso recuperado para esta sesión; el navegador impidió guardar el código.");
      }
    } catch {
      if (syncRequest.current !== requestId) return;
      setProfileMessage("No se pudo comprobar el código. Se conserva tu progreso actual; inténtalo con conexión.");
      setSyncState("offline");
    }
  }

  function exportProgressBackup() {
    if (!profileKey) {
      setProfileMessage("Todavía no hay un perfil de progreso que exportar.");
      return;
    }

    const knownIds = new Set(appliedAttemptIds.current);
    progressData.attempts.forEach((attempt) => knownIds.add(attempt.id));
    const snapshot = mergePending(profileKey, progressData, knownIds);
    const pendingById = new Map<string, AttemptSubmission>();
    [...readPendingAttempts(), ...volatilePending.current]
      .filter((item) => item.profileKey === profileKey)
      .forEach((item) => pendingById.set(item.attempt.id, item.attempt));

    try {
      const contents = createProgressBackup({
        profileKey,
        progress: snapshot.progress,
        appliedAttemptIds: snapshot.appliedAttemptIds,
        pendingAttempts: [...pendingById.values()],
      });
      const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `entrena-ahp-progreso-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setProfileMessage("Copia de seguridad descargada. Incluye el historial y el código anónimo de este perfil.");
    } catch {
      setProfileMessage("No se pudo crear la copia de seguridad en este navegador.");
    }
  }

  async function importProgressBackupFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setProfileMessage("La copia supera el límite de 5 MB y no se ha abierto.");
      return;
    }

    try {
      const parsed = parseProgressBackup(
        await file.text(),
        ANSWERS_BY_QUESTION,
      ) as unknown as ProgressBackupData;
      parsed.progress = normalizeProgress(parsed.progress);
      const key = parsed.profileKey;
      const existing = readCachedProgress(key);
      const keepExisting = Boolean(
        existing && existing.progress.summary.totalTests > parsed.progress.summary.totalTests,
      );
      const base = keepExisting && existing ? existing.progress : parsed.progress;
      const knownIds = new Set([
        ...parsed.appliedAttemptIds,
        ...(existing?.appliedAttemptIds ?? []),
      ]);

      syncRequest.current += 1;
      for (const attempt of parsed.pendingAttempts) {
        if (!queueAttempt(key, attempt)) {
          volatilePending.current.push({ profileKey: key, attempt });
        }
      }
      const restored = mergePending(key, base, knownIds);
      const cacheStored = writeCachedProgress(key, restored.progress, restored.appliedAttemptIds);
      let profileStored = true;
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, key);
      } catch {
        profileStored = false;
      }

      activateProgress(key, restored);
      setProfileKey(key);
      setProfileInput("");
      setSyncState("local");
      if (keepExisting) {
        setProfileMessage("La copia era anterior al historial guardado en este dispositivo; se ha conservado la versión más reciente.");
      } else if (!cacheStored || !profileStored) {
        setProfileMessage("Copia abierta para esta sesión; el navegador impidió conservarla localmente.");
      } else {
        setProfileMessage(`Copia restaurada: ${restored.progress.summary.totalTests} tests disponibles en este dispositivo.`);
      }

      if (key === profileKey) void synchronize(key);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "El archivo no es una copia válida.";
      setProfileMessage(detail);
    }
  }

  if (stage === "quiz" && currentQuestion) {
    const selectedOption = answers[currentQuestion.id];

    return (
      <div className="app-shell quiz-shell">
        <header className="quiz-header">
          <Brand />
          <div className="quiz-header-progress">
            <div className="progress-copy">
              <span>Pregunta {currentIndex + 1} de {quizQuestions.length}</span>
              <span>{answeredCount} respondidas</span>
              <button
                className="quiz-timing-toggle"
                type="button"
                aria-expanded={timingVisible}
                aria-controls="quiz-timing-readout"
                onClick={() => setTimingVisible((visible) => !visible)}
              >
                {timingVisible ? "Ocultar tiempo" : "Consultar tiempo"}
              </button>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            {timingVisible && (
              <div className="quiz-timing-readout" id="quiz-timing-readout">
                <span>Transcurrido <strong>{formatDuration(elapsedMs / 1_000)}</strong></span>
                <span>Tiempo máximo proporcional <strong>{formatDuration(timeLimitMillisecondsFor(quizQuestions.length) / 1_000)}</strong></span>
              </div>
            )}
          </div>
          <button className="button button-quiet header-finish" type="button" onClick={requestFinish}>
            Finalizar
          </button>
        </header>

        <main className="quiz-main">
          {quizMode === "review" && <div className="mode-chip">Repaso de preguntas falladas</div>}
          {quizMode === "daily" && <div className="mode-chip daily-chip">Práctica de hoy · 20 preguntas</div>}
          {quizMode === "standard" && quizContent.label && (
            <div className="mode-chip">{quizContent.type === "topic" ? "Test temático" : "Práctica normativa"} · {quizContent.label}</div>
          )}
          <section className="question-card" aria-labelledby="question-title">
            <div className="question-meta">
              <span className="source-chip">Convocatoria {currentQuestion.year}</span>
              <span>Pregunta {currentQuestion.sourceQuestionNumber}</span>
            </div>
            <h1 className="focus-heading" id="question-title" ref={pageHeading} tabIndex={-1}>{currentQuestion.prompt}</h1>

            <fieldset className="options-list">
              <legend className="sr-only">Elige una respuesta</legend>
              {OPTION_KEYS.map((key) => (
                <label className={`option-card ${selectedOption === key ? "is-selected" : ""}`} key={key}>
                  <input
                    type="radio"
                    name={`answer-${currentQuestion.id}`}
                    value={key}
                    checked={selectedOption === key}
                    onChange={() => chooseAnswer(currentQuestion.id, key)}
                  />
                  <span className="option-key" aria-hidden="true">{key}</span>
                  <span className="option-text">{currentQuestion.options[key]}</span>
                </label>
              ))}
            </fieldset>
          </section>

          {finishPrompt && (
            <section className="finish-prompt" role="alert" aria-live="assertive">
              <div>
                <strong>Quedan {unansweredCount} sin responder.</strong>
                <p>Las respuestas en blanco no penalizan. Puedes entregarlo ahora o continuar.</p>
              </div>
              <div className="finish-actions">
                <button className="button button-quiet" type="button" onClick={() => setFinishPrompt(false)}>Continuar</button>
                <button className="button button-primary" type="button" onClick={finishTest}>Entregar igualmente</button>
              </div>
            </section>
          )}

          <nav className="question-navigation" aria-label="Navegación del test">
            <button className="button button-quiet" type="button" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)}>
              ← Anterior
            </button>
            <span className="unanswered-copy">{unansweredCount} en blanco</span>
            {currentIndex < quizQuestions.length - 1 ? (
              <button className="button button-primary" type="button" onClick={() => moveTo(currentIndex + 1)}>Siguiente →</button>
            ) : (
              <button className="button button-primary" type="button" onClick={requestFinish}>Corregir test</button>
            )}
          </nav>
        </main>
      </div>
    );
  }

  if (stage === "results" && result) {
    const reviewItems = result.items.filter((item) => item.status !== "correct");

    return (
      <div className="app-shell results-shell">
        <header className="simple-header">
          <Brand />
          <div className="header-actions">
            <button className="button button-quiet" type="button" onClick={showDashboard}>Mi progreso</button>
            <button className="button button-quiet" type="button" onClick={resetTest}>Nuevo test</button>
          </div>
        </header>

        <main className="results-main">
          <section className="results-hero">
            <div className="results-kicker">{result.mode === "daily" ? "Resultado de la práctica de hoy" : result.mode === "review" ? "Resultado del repaso" : "Resultado del test"}</div>
            {result.content.label && <div className="result-scope">{result.content.type === "topic" ? "Tema" : "Normativa"}: {result.content.label}</div>}
            <div className="result-heading-row">
              <div>
                <h1 className="focus-heading" ref={pageHeading} tabIndex={-1}>{result.correct} de {result.total} correctas</h1>
                <p>Penalización oficial y conversión proporcional al tamaño del test.</p>
              </div>
              <div className="score-block" aria-label={`Nota proporcional ${formatScore(result.scoreOutOfTen)} sobre 10`}>
                <span className="score-number">{formatScore(result.scoreOutOfTen)}</span>
                <span className="score-maximum">sobre 10</span>
                <span className="score-direct">Puntuación directa: {formatScore(result.directScore)} / {result.total}</span>
              </div>
            </div>

            <div className="result-stats">
              <article className="result-stat correct-stat"><span className="stat-label">Aciertos</span><strong>{result.correct}</strong><small>+{formatScore(result.correct)}</small></article>
              <article className="result-stat incorrect-stat"><span className="stat-label">Errores</span><strong>{result.incorrect}</strong><small>−{formatScore(result.incorrect / 4)}</small></article>
              <article className="result-stat blank-stat"><span className="stat-label">En blanco</span><strong>{result.blank}</strong><small>0 puntos</small></article>
            </div>

            <div className="score-formula">
              <span>Fórmula aplicada</span>
              <strong>{result.correct} − ({result.incorrect} ÷ 4) = {formatScore(result.directScore)}; × 10 ÷ {result.total} = {formatScore(result.scoreOutOfTen)}</strong>
              <p>Nota proporcional de práctica sobre 10 con penalización oficial. El Tribunal fija la transformación definitiva y la nota de corte.</p>
            </div>

            <div className="time-summary" aria-label="Resumen de tiempo del test">
              <div><span>Tiempo empleado</span><strong>{formatDuration(result.durationMs / 1_000)}</strong></div>
              <div><span>Tiempo máximo proporcional</span><strong>{formatDuration(result.timeLimitMs / 1_000)}</strong></div>
            </div>

            {progressData.settings.gamificationEnabled && (
              <div className={`result-day-progress ${gamification.today.goalMet ? "is-complete" : ""}`}>
                <div>
                  <span>Constancia de hoy</span>
                  <strong>{gamification.today.goalMet
                    ? "Sesión diaria completada"
                    : `${Math.min(gamification.today.questionsCompleted, DAILY_QUESTION_TARGET)} de ${DAILY_QUESTION_TARGET} preguntas`}</strong>
                </div>
                <div className="daily-progress-track" role="progressbar" aria-label="Preguntas completadas hoy" aria-valuemin={0} aria-valuemax={DAILY_QUESTION_TARGET} aria-valuenow={Math.min(gamification.today.questionsCompleted, DAILY_QUESTION_TARGET)}>
                  <span style={{ width: `${Math.min(100, (gamification.today.questionsCompleted / DAILY_QUESTION_TARGET) * 100)}%` }} />
                </div>
              </div>
            )}
          </section>

          <section className="review-section" aria-labelledby="review-title">
            <div className="section-heading">
              <div><span className="eyebrow">Revisión razonada</span><h2 id="review-title">Errores y preguntas en blanco</h2></div>
              <span className="review-count">{reviewItems.length}</span>
            </div>

            {reviewItems.length === 0 ? (
              <div className="perfect-card"><span aria-hidden="true">✓</span><div><h3>Test perfecto</h3><p>No hay errores ni preguntas sin responder.</p></div></div>
            ) : (
              <div className="review-list">
                {reviewItems.map((item, index) => {
                  const { question, selectedOption, status } = item;
                  const correctOption = question.correctOptions[0];
                  const explanation = EXPLANATIONS[question.id];
                  const historicalNote = HISTORICAL_ONLY[question.id];
                  const pendingSourceNote = SOURCE_PENDING[question.id];
                  const fallback = `La regla aplicable conduce a la opción ${correctOption}: ${question.options[correctOption]}`;
                  return (
                    <article className="review-card" key={question.id}>
                      <div className="review-card-topline">
                        <span className={`status-chip ${status}`}>{status === "blank" ? "En blanco" : "Error"}</span>
                        <span>#{index + 1} · {question.year} · pregunta {question.sourceQuestionNumber}</span>
                      </div>
                      <h3>{question.prompt}</h3>
                      <div className="answer-comparison">
                        <div className="answer-row user-answer">
                          <span>Tu respuesta</span>
                          <p>{selectedOption ? <><b>{selectedOption}.</b> {question.options[selectedOption]}</> : "Sin responder"}</p>
                        </div>
                        <div className="answer-row correct-answer">
                          <span>Respuesta correcta</span>
                          <p><b>{correctOption}.</b> {question.options[correctOption]}</p>
                        </div>
                      </div>
                      <div className="error-explanation">
                        {historicalNote && <p className="legal-status-note historical-status"><strong>Vigencia:</strong> {historicalNote}</p>}
                        {pendingSourceNote && <p className="legal-status-note pending-status"><strong>Trazabilidad pendiente:</strong> {pendingSourceNote}</p>}
                        <strong>Por qué:</strong> {explanation?.explanation || fallback}
                        {explanation?.reference && <p className="explanation-reference"><strong>Fundamento:</strong> {explanation.reference}</p>}
                      </div>
                      <p className="source-line">Fuente: cuestionario oficial {question.year} · plantilla definitiva.</p>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="results-cta">
              <button className="button button-primary button-large" type="button" onClick={showDashboard}>Ver mi progreso</button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (stage === "dashboard") {
    const answeredForAccuracy = progressData.summary.correct + progressData.summary.incorrect;
    const accuracy = answeredForAccuracy ? (progressData.summary.correct / answeredForAccuracy) * 100 : 0;
    const reviewSize = weakQuestions.length ? Math.min(reviewCount, weakQuestions.length) : 0;
    const practicedTopics = [...topicProgress]
      .filter((topic) => topic.practicedQuestions > 0)
      .sort((left, right) => right.practicedQuestions - left.practicedQuestions || left.label.localeCompare(right.label))
      .slice(0, 6);
    const achievements = gamification.achievements as Achievement[];
    const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked).length;
    const achievementGroups = ACHIEVEMENT_HORIZONS.map((horizon) => {
      const items = achievements.filter((achievement) => achievement.horizon === horizon.id);
      return {
        ...horizon,
        items,
        unlocked: items.filter((achievement) => achievement.unlocked).length,
      };
    });

    return (
      <div className="app-shell dashboard-shell">
        <header className="simple-header">
          <Brand />
          <div className="header-actions">
            <span className={`sync-chip ${syncState}`} role="status" aria-live="polite">{syncState === "ready" ? "Progreso sincronizado" : syncState === "loading" ? "Sincronizando…" : syncState === "local" ? "Copia local protegida" : "Guardado localmente"}</span>
            <button className="button button-primary" type="button" onClick={resetTest}>Nuevo test</button>
          </div>
        </header>

        <main className="dashboard-main">
          <section className="dashboard-hero">
            <div><span className="eyebrow">Panel de estudio</span><h1 className="focus-heading" ref={pageHeading} tabIndex={-1}>Tu progreso, de un vistazo.</h1><p>El historial identifica las preguntas que conviene volver a practicar.</p></div>
          </section>

          <section className={`panel-card motivation-panel ${progressData.settings.gamificationEnabled ? "" : "is-disabled"}`} aria-labelledby="motivation-title">
            {progressData.settings.gamificationEnabled ? (
              <>
                <div className="motivation-heading">
                  <div><span className="eyebrow">Tu constancia</span><h2 id="motivation-title">Un hábito serio, sin presión.</h2></div>
                  <button className="button button-quiet" type="button" onClick={() => void updateProgressSettings({ gamificationEnabled: false, weeklyGoal: progressData.settings.weeklyGoal })}>Ocultar motivación</button>
                </div>
                <div className="motivation-grid">
                  <div className="today-practice">
                    <div className="today-practice-copy">
                      <span>Práctica de hoy</span>
                      <strong>{Math.min(gamification.today.questionsCompleted, DAILY_QUESTION_TARGET)} de {DAILY_QUESTION_TARGET}</strong>
                      <p>{gamification.today.goalMet
                        ? "Has completado la sesión diaria. Puedes seguir practicando si te apetece."
                        : `${gamification.today.remainingQuestions} preguntas para completar el día.`}</p>
                    </div>
                    <div className="daily-progress-track" role="progressbar" aria-label="Progreso de la práctica de hoy" aria-valuemin={0} aria-valuemax={DAILY_QUESTION_TARGET} aria-valuenow={Math.min(gamification.today.questionsCompleted, DAILY_QUESTION_TARGET)}>
                      <span style={{ width: `${Math.min(100, (gamification.today.questionsCompleted / DAILY_QUESTION_TARGET) * 100)}%` }} />
                    </div>
                    <button className="button button-primary" type="button" onClick={startDailyPractice}>{gamification.today.goalMet ? "Otra práctica de 20 preguntas" : "Practicar 20 preguntas"}</button>
                  </div>

                  <div className="streak-summary" aria-label="Resumen de rachas">
                    <div><span>Racha actual</span><strong>{gamification.streaks.currentStreak}</strong><small>{gamification.streaks.currentStreak === 1 ? "día" : "días"}</small></div>
                    <div><span>Mejor racha</span><strong>{gamification.streaks.bestStreak}</strong><small>{gamification.streaks.bestStreak === 1 ? "día" : "días"}</small></div>
                    <div><span>Objetivo semanal</span><strong>{Math.min(gamification.currentWeek.completedDays, progressData.settings.weeklyGoal)}/{progressData.settings.weeklyGoal}</strong><small>días completos</small></div>
                  </div>

                  <div className="study-week">
                    <div className="study-week-heading"><span>Esta semana</span><strong>{gamification.currentWeek.completedDays >= progressData.settings.weeklyGoal ? "Objetivo completado" : `${gamification.currentWeek.completedDays} de ${progressData.settings.weeklyGoal} días`}</strong></div>
                    <div className="week-days">
                      {gamification.currentWeek.days.map((day: { studyDate: string; totalQuestions: number; goalMet: boolean }) => {
                        const formatted = formatStudyDay(day.studyDate);
                        const isToday = day.studyDate === gamification.today.studyDate;
                        return (
                          <div className={`${day.goalMet ? "is-complete" : ""} ${isToday ? "is-today" : ""}`} key={day.studyDate} aria-label={`${formatted.weekday} ${formatted.day}: ${day.totalQuestions} preguntas${day.goalMet ? ", día completado" : ""}`}>
                            <span>{formatted.weekday}</span>
                            <strong>{day.goalMet ? "✓" : formatted.day}</strong>
                          </div>
                        );
                      })}
                    </div>
                    <label className="weekly-goal-control" htmlFor="weekly-goal">
                      <span>Meta semanal</span>
                      <select id="weekly-goal" value={progressData.settings.weeklyGoal} onChange={(event) => void updateProgressSettings({ weeklyGoal: Number(event.target.value), gamificationEnabled: true })}>
                        {[1, 2, 3, 4, 5, 6, 7].map((days) => <option value={days} key={days}>{days} {days === 1 ? "día" : "días"}</option>)}
                      </select>
                    </label>
                    {settingsMessage && <p className="settings-message" role="status" aria-live="polite">{settingsMessage}</p>}
                  </div>
                </div>
              </>
            ) : (
              <div className="motivation-disabled-copy">
                <div><span className="eyebrow">Motivación opcional</span><h2 id="motivation-title">La racha y los logros están ocultos.</h2><p>Tu actividad sigue formando parte del historial; puedes volver a mostrarla cuando quieras.</p>{settingsMessage && <p className="settings-message" role="status" aria-live="polite">{settingsMessage}</p>}</div>
                <button className="button button-quiet" type="button" onClick={() => void updateProgressSettings({ gamificationEnabled: true, weeklyGoal: progressData.settings.weeklyGoal })}>Mostrar motivación</button>
              </div>
            )}
          </section>

          <section className="metrics-grid" aria-label="Resumen de progreso">
            <article className="metric-card"><span>Tests completados</span><strong>{progressData.summary.totalTests}</strong></article>
            <article className="metric-card"><span>Preguntas practicadas</span><strong>{progressData.summary.totalQuestions}</strong></article>
            <article className="metric-card"><span>Precisión</span><strong>{formatPercent(accuracy)}%</strong><small>sobre preguntas contestadas</small></article>
            <article className="metric-card attention"><span>Por reforzar</span><strong>{weakQuestions.length}</strong><small>fallos aún no corregidos</small></article>
          </section>

          <div className="dashboard-grid">
            <section className="panel-card review-panel" aria-labelledby="weak-title">
              <div className="panel-heading"><div><span className="eyebrow">Repaso inteligente</span><h2 id="weak-title">Preguntas falladas</h2></div><span className="review-count">{weakQuestions.length}</span></div>
              {weakQuestions.length === 0 ? (
                <div className="empty-dashboard"><span aria-hidden="true">✓</span><p>{progressData.summary.totalTests ? "No tienes fallos pendientes de corregir." : "Completa un test para crear tu lista de repaso."}</p></div>
              ) : (
                <>
                  <div className="review-launch">
                    <label htmlFor="review-count">Número de preguntas</label>
                    <input id="review-count" type="number" min="1" max={weakQuestions.length} value={reviewSize} onChange={(event) => setReviewCount(Math.max(1, Math.min(weakQuestions.length, Number(event.target.value) || 1)))} />
                    <button className="button button-primary" type="button" onClick={startReviewTest}>Practicar {reviewSize} falladas</button>
                  </div>
                  <div className="weak-list">
                    {weakQuestions.slice(0, 8).map(({ stat, question }) => (
                      <article className="weak-item" key={question.id}>
                        <div><span>{question.year} · pregunta {question.sourceQuestionNumber}</span><p>{question.prompt}</p></div>
                        <strong>{stat.incorrectCount} {stat.incorrectCount === 1 ? "fallo" : "fallos"}</strong>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="panel-card history-panel" aria-labelledby="history-title">
              <div className="panel-heading"><div><span className="eyebrow">Evolución</span><h2 id="history-title">Últimos tests</h2></div></div>
              {progressData.attempts.length === 0 ? (
                <div className="empty-dashboard"><p>Aquí aparecerán tus resultados cuando termines el primer test.</p></div>
              ) : (
                <div className="history-list">
                  {progressData.attempts.slice(0, 8).map((attempt) => (
                    <article className="history-item" key={attempt.id}>
                      <div>
                        <strong>{attemptTitle(attempt)}</strong>
                        <span>{formatDate(attempt.completedAt)} · {attempt.total} preguntas</span>
                        <span>{attempt.durationMs !== null && attempt.timeLimitMs !== null
                          ? `${formatDuration(attempt.durationMs / 1_000)} empleados · máximo ${formatDuration(attempt.timeLimitMs / 1_000)}`
                          : "Tiempo no registrado"}</span>
                      </div>
                      <div className="history-score">
                        <strong>{formatScore(proportionalScoreOutOfTen(attempt.directScore, attempt.total))} / 10</strong>
                        <span>directa {formatScore(attempt.directScore)} / {attempt.total}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className={`learning-grid ${progressData.settings.gamificationEnabled ? "" : "single"}`}>
            <section className="panel-card topic-progress-panel" aria-labelledby="topic-progress-title">
              <div className="panel-heading"><div><span className="eyebrow">Cobertura del temario</span><h2 id="topic-progress-title">Progreso por temas</h2></div><span className="coverage-count">{coveredTopics}/{AVAILABLE_TOPICS.length}</span></div>
              {practicedTopics.length === 0 ? (
                <div className="empty-dashboard"><p>Cuando completes un test, aquí verás qué temas has practicado.</p></div>
              ) : (
                <div className="topic-progress-list">
                  {practicedTopics.map((topic) => {
                    const coverage = topic.totalQuestions ? (topic.practicedQuestions / topic.totalQuestions) * 100 : 0;
                    return (
                      <article className="topic-progress-item" key={topic.id}>
                        <div className="topic-progress-copy"><strong>{topic.label}</strong><span>{topic.practicedQuestions} de {topic.totalQuestions} preguntas · {topic.accuracy === null ? "sin precisión disponible" : `${formatPercent(topic.accuracy)}% de aciertos`}</span></div>
                        <div className="topic-progress-bar" aria-hidden="true"><span style={{ width: `${coverage}%` }} /></div>
                        <button className="button button-quiet" type="button" onClick={() => prepareTopicTest(topic.id)}>Practicar</button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {progressData.settings.gamificationEnabled && (
              <section className="panel-card achievements-panel" aria-labelledby="achievements-title">
                <div className="panel-heading"><div><span className="eyebrow">Hitos de estudio</span><h2 id="achievements-title">Logros para todo el camino</h2></div><span className="coverage-count">{unlockedAchievements}/{achievements.length}</span></div>
                <p className="achievements-intro">Los objetivos combinan avances cercanos con metas de varios meses. Los días de estudio solo cuentan al completar al menos 20 preguntas.</p>
                <div className="achievement-groups">
                  {achievementGroups.map((group) => (
                    <section className={`achievement-group achievement-group-${group.id}`} aria-labelledby={`achievement-group-${group.id}`} key={group.id}>
                      <div className="achievement-group-heading">
                        <div><h3 id={`achievement-group-${group.id}`}>{group.label}</h3><p>{group.description}</p></div>
                        <span>{group.unlocked}/{group.items.length}</span>
                      </div>
                      <div className="achievements-grid">
                        {group.items.map((achievement) => {
                          const percentage = achievement.target ? Math.min(100, (achievement.progress / achievement.target) * 100) : 0;
                          return (
                            <article className={`achievement-card ${achievement.unlocked ? "is-unlocked" : ""}`} key={achievement.id}>
                              <span className="achievement-mark" aria-hidden="true">{achievement.unlocked ? "✓" : "·"}</span>
                              <div>
                                <strong>{achievement.title}</strong>
                                <p>{achievement.description}</p>
                                <div className="achievement-progress" role="progressbar" aria-label={`Progreso de ${achievement.title}`} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={achievement.progress}><span style={{ width: `${percentage}%` }} /></div>
                                <small>{achievement.unlocked ? "Conseguido" : `${achievement.progress.toLocaleString("es-ES")} de ${achievement.target.toLocaleString("es-ES")}`}</small>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            )}
          </div>

          <section className="panel-card profile-panel" aria-labelledby="profile-title">
            <div><span className="eyebrow">Recuperación</span><h2 id="profile-title">Conserva tu código de progreso</h2><p>El historial se sincroniza con Sites y también se conserva completo en este navegador. El código permite recuperarlo en otro dispositivo.</p></div>
            <div className="profile-controls">
              <div className="profile-code"><code>{profileKey || "Preparando…"}</code><button className="button button-quiet" type="button" disabled={!profileKey} onClick={copyProfileKey}>Copiar</button></div>
              <div className="profile-import"><label htmlFor="profile-input">Recuperar otro código</label><div><input id="profile-input" value={profileInput} onChange={(event) => setProfileInput(event.target.value)} placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" /><button className="button button-quiet" type="button" onClick={() => void importProfileKey()}>Recuperar</button></div></div>
              <fieldset className="profile-backup" aria-describedby="profile-backup-help">
                <legend>Copia de seguridad</legend>
                <div className="profile-backup-actions">
                  <button className="button button-quiet" type="button" disabled={!profileKey} onClick={exportProgressBackup}>Exportar historial</button>
                  <button className="button button-quiet" type="button" onClick={() => backupFileInput.current?.click()}>Importar copia</button>
                </div>
                <input ref={backupFileInput} id="backup-file-input" className="sr-only" type="file" accept=".json,application/json" tabIndex={-1} onChange={(event) => void importProgressBackupFile(event)} />
                <p id="profile-backup-help">El archivo JSON incluye el código anónimo y el historial de este perfil. Guárdalo como conservarías tu código de progreso.</p>
              </fieldset>
              {profileMessage && <p className="profile-message" role="status" aria-live="polite" aria-atomic="true">{profileMessage}</p>}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell landing-shell">
      <header className="landing-header">
        <Brand />
        <div className="header-actions"><span className="header-source">Banco histórico 2022–2025</span><button className="button button-quiet" type="button" onClick={showDashboard}>Mi progreso</button></div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Simulador de Agentes de Hacienda</span>
            <h1 className="focus-heading" ref={pageHeading} tabIndex={-1}>Entrena como el día del examen.</h1>
            <p className="hero-lead">Tests aleatorios construidos únicamente con preguntas y respuestas de convocatorias anteriores. Las preguntas anuladas están excluidas.</p>
            <div className="trust-row" aria-label="Características del banco">
              <span><b>{bankMetadata.totalQuestions}</b> preguntas válidas</span><span><b>4</b> convocatorias</span><span><b>0</b> anuladas incluidas</span>
            </div>
          </div>

          <section className="setup-card" aria-labelledby="setup-title">
            <div className="setup-card-heading"><span className="step-label">Configura tu test</span><h2 id="setup-title">Elige qué quieres practicar.</h2></div>
            <fieldset className="content-filter">
              <legend>Contenido</legend>
              <div className="content-mode-buttons">
                <button type="button" className={contentType === "all" ? "is-active" : ""} aria-pressed={contentType === "all"} onClick={() => chooseContentType("all")}>Todo el temario</button>
                <button type="button" className={contentType === "topic" ? "is-active" : ""} aria-pressed={contentType === "topic"} onClick={() => chooseContentType("topic")}>Por tema</button>
                <button type="button" className={contentType === "norm" ? "is-active" : ""} aria-pressed={contentType === "norm"} onClick={() => chooseContentType("norm")}>Por normativa</button>
              </div>
              {contentType === "topic" && (
                <label className="content-select" htmlFor="topic-select">
                  <span>Tema oficial</span>
                  <select id="topic-select" value={selectedContent.id ?? ""} onChange={(event) => setContentId(event.target.value)}>
                    {TAXONOMY.areas.map((area) => (
                      <optgroup label={area.label} key={area.id}>
                        {TAXONOMY.topics.filter((topic) => topic.areaId === area.id).map((topic) => (
                          <option value={topic.id} key={topic.id} disabled={(TOPIC_QUESTIONS.get(topic.id)?.length ?? 0) === 0}>{topic.label} · {TOPIC_QUESTIONS.get(topic.id)?.length ?? 0}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              {contentType === "norm" && (
                <label className="content-select" htmlFor="norm-select">
                  <span>Familia normativa</span>
                  <select id="norm-select" value={selectedContent.id ?? ""} onChange={(event) => setContentId(event.target.value)}>
                    {AVAILABLE_NORM_GROUPS.map((group) => (
                      <option value={group.id} key={group.id}>{group.label} · {NORM_GROUP_QUESTIONS.get(group.id)?.length ?? 0}</option>
                    ))}
                  </select>
                  <small>Las leyes, reglamentos y órdenes relacionados se agrupan; solo se muestran familias con al menos {MIN_NORM_GROUP_QUESTIONS} preguntas.</small>
                </label>
              )}
              <p className="content-availability">
                <strong>{availableQuestions.length}</strong> preguntas disponibles
                {selectedContent.label ? <> · {selectedContent.label}</> : " en todo el banco"}
              </p>
            </fieldset>
            <div className="question-count-heading"><span>Número de preguntas</span></div>
            <div className="preset-grid" aria-label="Cantidades rápidas">
              {availablePresets.map((preset) => <button className={`preset-button ${questionCount === preset ? "is-active" : ""}`} type="button" key={preset} onClick={() => setQuestionCount(preset)}>{preset}</button>)}
            </div>
            <label className="count-control" htmlFor="question-count"><span>Número personalizado</span><input id="question-count" type="number" min="1" max={availableQuestions.length} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(availableQuestions.length, Number(event.target.value) || 1)))} /></label>
            <input className="count-range" type="range" min="1" max={availableQuestions.length} value={questionCount} aria-label="Número de preguntas" onChange={(event) => setQuestionCount(Number(event.target.value))} />
            <div className="range-labels" aria-hidden="true"><span>1</span><span>{availableQuestions.length}</span></div>
            <button className="button button-primary button-large start-button" type="button" onClick={startTest}>Comenzar test de {questionCount} preguntas{selectedContent.type === "topic" ? " del tema" : selectedContent.type === "norm" ? " de esta normativa" : ""}</button>
            <p className="setup-note">Tiempo máximo proporcional: {formatDuration(timeLimitMillisecondsFor(questionCount) / 1_000)}. Podrás consultarlo durante el test; no habrá avisos ni cierre automático.</p>
          </section>
        </section>

        <section className="details-section">
          <article className="detail-card scoring-card"><span className="detail-index">01</span><div><span className="eyebrow">Corrección oficial</span><h2>Penalización oficial y nota proporcional.</h2><div className="formula-visual" aria-label="Acierto más uno, error menos cero coma veinticinco, blanco cero"><span className="formula-good">+1 <small>acierto</small></span><span className="formula-bad">−0,25 <small>error</small></span><span className="formula-neutral">0 <small>en blanco</small></span></div><p>La puntuación directa se convierte linealmente a una nota sobre 10 según el tamaño del test. Es una referencia de práctica; el Tribunal fija su transformación y la nota de corte.</p></div></article>
          <article className="detail-card source-card"><span className="detail-index">02</span><div><span className="eyebrow">Trazabilidad</span><h2>Sabes de dónde sale cada pregunta.</h2><div className="year-grid">{yearSummary.map(([year, count]) => <div key={year}><strong>{year}</strong><span>{count} válidas</span></div>)}</div><p>La revisión muestra convocatoria, número original y una explicación razonada. Todas las plantillas utilizadas tienen carácter definitivo, incluida la de 2022. Auditoría normativa a {legalVerificationData.verifiedAt.split("-").reverse().join("/")}: fuente trazable en {TRACEABLE_EXPLANATIONS} de {legalVerificationData.questionsReviewed} explicaciones; la excepción pendiente y las reglas históricas se advierten expresamente.</p></div></article>
          <article className="detail-card motivation-detail"><span className="detail-index">03</span><div><span className="eyebrow">Constancia sin presión</span><h2>Práctica de hoy, racha y logros.</h2><p>La racha solo avanza al completar la unidad mínima de estudio: 20 preguntas. Los logros incluyen objetivos iniciales, de medio plazo y metas pensadas para acompañar una preparación de 9 a 24 meses, sin premiar la rapidez.</p></div></article>
        </section>
      </main>

      <footer className="landing-footer"><Brand /><p>Herramienta de práctica no oficial. Banco limitado a convocatorias de acceso libre.</p></footer>
    </div>
  );
}
