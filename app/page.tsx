"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import bankMetadata from "./data/bank-metadata.json";
import explanationData from "./data/explanations.json";
import legalVerificationData from "./data/legal-verification.json";
import questionData from "./data/questions.json";
import {
  createProgressBackup,
  createProgressCache,
  parseProgressBackup,
  parseProgressCache,
} from "./lib/progress-backup";
import { evaluateTest } from "./lib/scoring";

type OptionKey = "A" | "B" | "C" | "D";
type AnswerStatus = "correct" | "incorrect" | "blank";
type TestMode = "standard" | "review";
type Stage = "setup" | "dashboard" | "quiz" | "results";

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

type ProgressData = {
  attempts: Attempt[];
  questionStats: QuestionStat[];
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
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const PRESETS = [10, 20, 40, 80];
const PROFILE_STORAGE_KEY = "entrena-ahp-progress-key";
const PENDING_STORAGE_PREFIX = "entrena-ahp-pending-attempt:";
const PROGRESS_CACHE_PREFIX = "entrena-ahp-progress-cache:v1:";
const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;
const PROGRESS_API_META_NAME = "entrena-ahp-progress-api";
const DEFAULT_PROGRESS_API_ENDPOINT = "/api/progress";
const PROFILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMPTY_PROGRESS: ProgressData = {
  attempts: [],
  questionStats: [],
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

function normalizeProgress(value: unknown): ProgressData {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawSummary = (raw.summary && typeof raw.summary === "object" ? raw.summary : {}) as Record<string, unknown>;
  const rawAttempts = Array.isArray(raw.attempts) ? raw.attempts : [];
  const rawStats = Array.isArray(raw.questionStats) ? raw.questionStats : [];

  return {
    attempts: rawAttempts.map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        completedAt: numberFrom(item.completedAt),
        mode: item.mode === "review" ? "review" : "standard",
        total: numberFrom(item.total),
        correct: numberFrom(item.correct),
        incorrect: numberFrom(item.incorrect),
        blank: numberFrom(item.blank),
        directScore: numberFrom(item.directScore),
      };
    }),
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
    return parseProgressCache(serialized, ANSWERS_BY_QUESTION) as CachedProgressData | null;
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

  return {
    attempts: [attempt, ...previous.attempts].slice(0, 100),
    questionStats: [...stats.values()].sort((a, b) => b.incorrectCount - a.incorrectCount || b.lastSeen - a.lastSeen),
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
        (attempt.mode === "standard" || attempt.mode === "review") &&
        typeof attempt.total === "number" &&
        typeof attempt.correct === "number" &&
        typeof attempt.incorrect === "number" &&
        typeof attempt.blank === "number" &&
        typeof attempt.directScore === "number" &&
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

function scrollToTop() {
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function Brand() {
  return (
    <div className="brand" aria-label="Entrena AHP">
      <span className="brand-mark" aria-hidden="true">âœ“</span>
      <span className="brand-name">Entrena AHP</span>
    </div>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [questionCount, setQuestionCount] = useState(20);
  const [reviewCount, setReviewCount] = useState(10);
  const [quizMode, setQuizMode] = useState<TestMode>("standard");
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [finishPrompt, setFinishPrompt] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [profileKey, setProfileKey] = useState(getOrCreateProfileKey);
  const [profileInput, setProfileInput] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
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
    // La sincronizaciÃ³n se reinicia si se importa otro cÃ³digo de progreso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  useEffect(() => {
    if (!profileKey || activeProgressKey.cuënµ¶‰žËkºwµçA•¹‘”‘•°‰…É•µ¼‘”…‘„ÑÉ¥‰Õ¹…°¸ð½Àø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰É•Ù¥•ÜµÍ•Ñ¥½¸ˆ…É¥„µ±…‰•±±•‘‰äô‰É•Ù¥•ÜµÑ¥Ñ±”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆø(€€€€€€€€€€€€€€ñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùI•Ù¥Í§Í¸É…é½¹…‘„ð½ÍÁ…¸øñ È¥ô‰É•Ù¥•ÜµÑ¥Ñ±”ˆùÉÉ½É•ÌäÁÉ•Õ¹Ñ…Ì•¸‰±…¹¼ð½ Èøð½‘¥Øø(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰É•Ù¥•Üµ½Õ¹ÐˆùíÉ•Ù¥•Ý%Ñ•µÌ¹±•¹Ñ¡ôð½ÍÁ…¸ø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€íÉ•Ù¥•Ý%Ñ•µÌ¹±•¹Ñ €ôôô€À€ü€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á•É™•Ðµ…ÉˆøñÍÁ…¸…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûŠrLð½ÍÁ…¸øñ‘¥Øøñ ÌùQ•ÍÐÁ•É™•Ñ¼ð½ ÌøñÀù9¼¡…ä•ÉÉ½É•Ì¹¤ÁÉ•Õ¹Ñ…ÌÍ¥¸É•ÍÁ½¹‘•È¸ð½Àøð½‘¥Øøð½‘¥Øø(€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•Ù¥•Üµ±¥ÍÐˆø(€€€€€€€€€€€€€€€íÉ•Ù¥•Ý%Ñ•µÌ¹µ…À ¡¥Ñ•´°¥¹‘•à¤€ôøì(€€€€€€€€€€€€€€€€€½¹ÍÐìÅÕ•ÍÑ¥½¸°Í•±•Ñ•‘=ÁÑ¥½¸°ÍÑ…ÑÕÌô€ô¥Ñ•´ì(€€€€€€€€€€€€€€€€€½¹ÍÐ½ÉÉ•Ñ=ÁÑ¥½¸€ôÅÕ•ÍÑ¥½¸¹½ÉÉ•Ñ=ÁÑ¥½¹ÍlÁtì(€€€€€€€€€€€€€€€€€½¹ÍÐ•áÁ±…¹…Ñ¥½¸€ôaA19Q%=9MmÅÕ•ÍÑ¥½¸¹¥‘tì(€€€€€€€€€€€€€€€€€½¹ÍÐ¡¥ÍÑ½É¥…±9½Ñ”€ô!%MQ=I%1}=91emÅÕ•ÍÑ¥½¸¹¥‘tì(€€€€€€€€€€€€€€€€€½¹ÍÐÁ•¹‘¥¹M½ÕÉ•9½Ñ”€ôM=UI}A9%9mÅÕ•ÍÑ¥½¸¹¥‘tì(€€€€€€€€€€€€€€€€€½¹ÍÐ™…±±‰…¬€ô1„É•±„…Á±¥…‰±”½¹‘Õ”„±„½Á§Í¸€‘í½ÉÉ•Ñ=ÁÑ¥½¹ôè€‘íÅÕ•ÍÑ¥½¸¹½ÁÑ¥½¹Ím½ÉÉ•Ñ=ÁÑ¥½¹uõ€ì(€€€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰É•Ù¥•Üµ…Éˆ­•äõíÅÕ•ÍÑ¥½¸¹¥‘ôø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•Ù¥•Üµ…ÉµÑ½Á±¥¹”ˆø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õíÍÑ…ÑÕÌµ¡¥À€‘íÍÑ…ÑÕÍõôùíÍÑ…ÑÕÌ€ôôô€‰‰±…¹¬ˆ€ü€‰¸‰±…¹¼ˆ€è€‰ÉÉ½È‰ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸øí¥¹‘•à€¬€Åôƒ
ÜíÅÕ•ÍÑ¥½¸¹å•…Éôƒ
ÜÁÉ•Õ¹Ñ„íÅÕ•ÍÑ¥½¸¹Í½ÕÉ•EÕ•ÍÑ¥½¹9Õµ‰•Éôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ñ ÌùíÅÕ•ÍÑ¥½¸¹ÁÉ½µÁÑôð½ Ìø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…¹ÍÝ•Èµ½µÁ…É¥Í½¸ˆø(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…¹ÍÝ•ÈµÉ½ÜÕÍ•Èµ…¹ÍÝ•Èˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùQÔÉ•ÍÁÕ•ÍÑ„ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÀùíÍ•±•Ñ•‘=ÁÑ¥½¸€ü€ðøñˆùíÍ•±•Ñ•‘=ÁÑ¥½¹ô¸ð½ˆøíÅÕ•ÍÑ¥½¸¹½ÁÑ¥½¹ÍmÍ•±•Ñ•‘=ÁÑ¥½¹uôð¼ø€è€‰M¥¸É•ÍÁ½¹‘•È‰ôð½Àø(€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…¹ÍÝ•ÈµÉ½Ü½ÉÉ•Ðµ…¹ÍÝ•Èˆø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùI•ÍÁÕ•ÍÑ„½ÉÉ•Ñ„ð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€€€€€€€ñÀøñˆùí½ÉÉ•Ñ=ÁÑ¥½¹ô¸ð½ˆøíÅÕ•ÍÑ¥½¸¹½ÁÑ¥½¹Ím½ÉÉ•Ñ=ÁÑ¥½¹uôð½Àø(€€€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰•ÉÉ½Èµ•áÁ±…¹…Ñ¥½¸ˆø(€€€€€€€€€€€€€€€€€€€€€€€í¡¥ÍÑ½É¥…±9½Ñ”€˜˜€ñÀ±…ÍÍ9…µ”ô‰±•…°µÍÑ…ÑÕÌµ¹½Ñ”¡¥ÍÑ½É¥…°µÍÑ…ÑÕÌˆøñÍÑÉ½¹œùY¥•¹¥„èð½ÍÑÉ½¹œøí¡¥ÍÑ½É¥…±9½Ñ•ôð½Àùô(€€€€€€€€€€€€€€€€€€€€€€€íÁ•¹‘¥¹M½ÕÉ•9½Ñ”€˜˜€ñÀ±…ÍÍ9…µ”ô‰±•…°µÍÑ…ÑÕÌµ¹½Ñ”Á•¹‘¥¹œµÍÑ…ÑÕÌˆøñÍÑÉ½¹œùQÉ…é…‰¥±¥‘…Á•¹‘¥•¹Ñ”èð½ÍÑÉ½¹œøíÁ•¹‘¥¹M½ÕÉ•9½Ñ•ôð½Àùô(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùA½ÈÅ×¤èð½ÍÑÉ½¹œøí•áÁ±…¹…Ñ¥½¸ü¹•áÁ±…¹…Ñ¥½¸ñð™…±±‰…­ô(€€€€€€€€€€€€€€€€€€€€€€€íÍ•±•Ñ•‘=ÁÑ¥½¸€˜˜€ (€€€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰…¹ÍÝ•Èµ½¹ÑÉ…ÍÐˆùQÔ½Á§Í¸…™¥Éµ…‰„ƒ
­íÅÕ•ÍÑ¥½¸¹½ÁÑ¥½¹ÍmÍ•±•Ñ•‘=ÁÑ¥½¹u÷
ìì•°•±•µ•¹Ñ¼‘•¥Í¥Ù¼•Ì±„É•±„…¹Ñ•É¥½È¸ð½Àø(€€€€€€€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€€€€€€€í•áÁ±…¹…Ñ¥½¸ü¹É•™•É•¹”€˜˜€ñÀ±…ÍÍ9…µ”ô‰•áÁ±…¹…Ñ¥½¸µÉ•™•É•¹”ˆøñÍÑÉ½¹œùÕ¹‘…µ•¹Ñ¼èð½ÍÑÉ½¹œøí•áÁ±…¹…Ñ¥½¸¹É•™•É•¹•ôð½Àùô(€€€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½ÕÉ”µ±¥¹”ˆùÕ•¹Ñ”èÕ•ÍÑ¥½¹…É¥¼½™¥¥…°íÅÕ•ÍÑ¥½¸¹å•…Éôƒ
ÜÁ±…¹Ñ¥±±„‘•™¥¹¥Ñ¥Ù„¸ð½Àø(€€€€€€€€€€€€€€€€€€€€ð½…ÉÑ¥±”ø(€€€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€¥ô((€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•ÍÕ±ÑÌµÑ„ˆø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÁÉ¥µ…Éä‰ÕÑÑ½¸µ±…É”ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õíÍ¡½Ý…Í¡‰½…É‘ôùY•Èµ¤ÁÉ½É•Í¼ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€€€ð½µ…¥¸ø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€¥˜€¡ÍÑ…”€ôôô€‰‘…Í¡‰½…Éˆ¤ì(€€€½¹ÍÐ…¹ÍÝ•É•‘½ÉÕÉ…ä€ôÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹½ÉÉ•Ð€¬ÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹¥¹½ÉÉ•Ðì(€€€½¹ÍÐ…ÕÉ…ä€ô…¹ÍÝ•É•‘½ÉÕÉ…ä€ü€¡ÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹½ÉÉ•Ð€¼…¹ÍÝ•É•‘½ÉÕÉ…ä¤€¨€ÄÀÀ€è€Àì(€€€½¹ÍÐÉ•Ù¥•ÝM¥é”€ôÝ•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ €ü5…Ñ ¹µ¥¸¡É•Ù¥•Ý½Õ¹Ð°Ý•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ ¤€è€Àì((€€€É•ÑÕÉ¸€ (€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµÍ¡•±°‘…Í¡‰½…ÉµÍ¡•±°ˆø(€€€€€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰Í¥µÁ±”µ¡•…‘•Èˆø(€€€€€€€€€€ñ	É…¹€¼ø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡•…‘•Èµ…Ñ¥½¹Ìˆø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õíÍå¹Œµ¡¥À€‘íÍå¹MÑ…Ñ•õôÉ½±”ô‰ÍÑ…ÑÕÌˆ…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆùíÍå¹MÑ…Ñ”€ôôô€‰É•…‘äˆ€ü€‰AÉ½É•Í¼Í¥¹É½¹¥é…‘¼ˆ€èÍå¹MÑ…Ñ”€ôôô€‰±½…‘¥¹œˆ€ü€‰M¥¹É½¹¥é…¹‘¿Š˜ˆ€èÍå¹MÑ…Ñ”€ôôô€‰±½…°ˆ€ü€‰½Á¥„±½…°ÁÉ½Ñ•¥‘„ˆ€è€‰Õ…É‘…‘¼±½…±µ•¹Ñ”‰ôð½ÍÁ…¸ø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÁÉ¥µ…ÉäˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õíÉ•Í•ÑQ•ÍÑôù9Õ•Ù¼Ñ•ÍÐð½‰ÕÑÑ½¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½¡•…‘•Èø((€€€€€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰‘…Í¡‰½…Éµµ…¥¸ˆø(€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰‘…Í¡‰½…Éµ¡•É¼ˆø(€€€€€€€€€€€€ñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùA…¹•°‘”•ÍÑÕ‘¥¼ð½ÍÁ…¸øñ Ä±…ÍÍ9…µ”ô‰™½ÕÌµ¡•…‘¥¹œˆÉ•˜õíÁ…•!•…‘¥¹ôÑ…‰%¹‘•àõì´ÅôùQÔÁÉ½É•Í¼°‘”Õ¸Ù¥ÍÑ…é¼¸ð½ ÄøñÀù°¡¥ÍÑ½É¥…°¥‘•¹Ñ¥™¥„±…ÌÁÉ•Õ¹Ñ…ÌÅÕ”½¹Ù¥•¹”Ù½±Ù•È„ÁÉ…Ñ¥…È¸ð½Àøð½‘¥Øø(€€€€€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰µ•ÑÉ¥ÌµÉ¥ˆ…É¥„µ±…‰•°ô‰I•ÍÕµ•¸‘”ÁÉ½É•Í¼ˆø(€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰µ•ÑÉ¥Œµ…ÉˆøñÍÁ…¸ùQ•ÍÑÌ½µÁ±•Ñ…‘½Ìð½ÍÁ…¸øñÍÑÉ½¹œùíÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹Ñ½Ñ…±Q•ÍÑÍôð½ÍÑÉ½¹œøð½…ÉÑ¥±”ø(€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰µ•ÑÉ¥Œµ…ÉˆøñÍÁ…¸ùAÉ•Õ¹Ñ…ÌÁÉ…Ñ¥…‘…Ìð½ÍÁ…¸øñÍÑÉ½¹œùíÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹Ñ½Ñ…±EÕ•ÍÑ¥½¹Íôð½ÍÑÉ½¹œøð½…ÉÑ¥±”ø(€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰µ•ÑÉ¥Œµ…ÉˆøñÍÁ…¸ùAÉ•¥Í§Í¸ð½ÍÁ…¸øñÍÑÉ½¹œùí™½Éµ…ÑA•É•¹Ð¡…ÕÉ…ä¥ô”ð½ÍÑÉ½¹œøñÍµ…±°ùÍ½‰É”ÁÉ•Õ¹Ñ…Ì½¹Ñ•ÍÑ…‘…Ìð½Íµ…±°øð½…ÉÑ¥±”ø(€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰µ•ÑÉ¥Œµ…É…ÑÑ•¹Ñ¥½¸ˆøñÍÁ…¸ùA½ÈÉ•™½Éé…Èð½ÍÁ…¸øñÍÑÉ½¹œùíÝ•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ¡ôð½ÍÑÉ½¹œøñÍµ…±°ù™…±±½Ì‡é¸¹¼½ÉÉ•¥‘½Ìð½Íµ…±°øð½…ÉÑ¥±”ø(€€€€€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‘…Í¡‰½…ÉµÉ¥ˆø(€€€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Á…¹•°µ…ÉÉ•Ù¥•ÜµÁ…¹•°ˆ…É¥„µ±…‰•±±•‘‰äô‰Ý•…¬µÑ¥Ñ±”ˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…¹•°µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùI•Á…Í¼¥¹Ñ•±¥•¹Ñ”ð½ÍÁ…¸øñ È¥ô‰Ý•…¬µÑ¥Ñ±”ˆùAÉ•Õ¹Ñ…Ì™…±±…‘…Ìð½ Èøð½‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰É•Ù¥•Üµ½Õ¹ÐˆùíÝ•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ¡ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€€€€íÝ•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ €ôôô€À€ü€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰•µÁÑäµ‘…Í¡‰½…ÉˆøñÍÁ…¸…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûŠrLð½ÍÁ…¸øñÀùíÁÉ½É•ÍÍ…Ñ„¹ÍÕµµ…Éä¹Ñ½Ñ…±Q•ÍÑÌ€ü€‰9¼Ñ¥•¹•Ì™…±±½ÌÁ•¹‘¥•¹Ñ•Ì‘”½ÉÉ•¥È¸ˆ€è€‰½µÁ±•Ñ„Õ¸Ñ•ÍÐÁ…É„É•…ÈÑÔ±¥ÍÑ„‘”É•Á…Í¼¸‰ôð½Àøð½‘¥Øø(€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€ðø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•Ù¥•Üµ±…Õ¹ ˆø(€€€€€€€€€€€€€€€€€€€€ñ±…‰•°¡Ñµ±½Èô‰É•Ù¥•Üµ½Õ¹Ðˆù;éµ•É¼‘”ÁÉ•Õ¹Ñ…Ìð½±…‰•°ø(€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕÐ¥ô‰É•Ù¥•Üµ½Õ¹ÐˆÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÄˆµ…àõíÝ•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ¡ôÙ…±Õ”õíÉ•Ù¥•ÝM¥é•ô½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÍ•ÑI•Ù¥•Ý½Õ¹Ð¡5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸¡Ý•…­EÕ•ÍÑ¥½¹Ì¹±•¹Ñ °9Õµ‰•È¡•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¤ñð€Ä¤¤¥ô€¼ø(€€€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÁÉ¥µ…ÉäˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õíÍÑ…ÉÑI•Ù¥•ÝQ•ÍÑôùAÉ…Ñ¥…ÈíÉ•Ù¥•ÝM¥é•ô™…±±…‘…Ìð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ý•…¬µ±¥ÍÐˆø(€€€€€€€€€€€€€€€€€€€íÝ•…­EÕ•ÍÑ¥½¹Ì¹Í±¥” À°€à¤¹µ…À ¡ìÍÑ…Ð°ÅÕ•ÍÑ¥½¸ô¤€ôø€ (€€€€€€€€€€€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰Ý•…¬µ¥Ñ•´ˆ­•äõíÅÕ•ÍÑ¥½¸¹¥‘ôø(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥ØøñÍÁ…¸ùíÅÕ•ÍÑ¥½¸¹å•…Éôƒ
ÜÁÉ•Õ¹Ñ„íÅÕ•ÍÑ¥½¸¹Í½ÕÉ•EÕ•ÍÑ¥½¹9Õµ‰•Éôð½ÍÁ…¸øñÀùíÅÕ•ÍÑ¥½¸¹ÁÉ½µÁÑôð½Àøð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùíÍÑ…Ð¹¥¹½ÉÉ•Ñ½Õ¹ÑôíÍÑ…Ð¹¥¹½ÉÉ•Ñ½Õ¹Ð€ôôô€Ä€ü€‰™…±±¼ˆ€è€‰™…±±½Ì‰ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€€€€€ð½…ÉÑ¥±”ø(€€€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ð¼ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Á…¹•°µ…É¡¥ÍÑ½ÉäµÁ…¹•°ˆ…É¥„µ±…‰•±±•‘‰äô‰¡¥ÍÑ½ÉäµÑ¥Ñ±”ˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…¹•°µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùÙ½±Õ§Í¸ð½ÍÁ…¸øñ È¥ô‰¡¥ÍÑ½ÉäµÑ¥Ñ±”ˆûi±Ñ¥µ½ÌÑ•ÍÑÌð½ Èøð½‘¥Øøð½‘¥Øø(€€€€€€€€€€€€€íÁÉ½É•ÍÍ…Ñ„¹…ÑÑ•µÁÑÌ¹±•¹Ñ €ôôô€À€ü€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰•µÁÑäµ‘…Í¡‰½…ÉˆøñÀùÅ×´…Á…É••Ë…¸ÑÕÌÉ•ÍÕ±Ñ…‘½ÌÕ…¹‘¼Ñ•Éµ¥¹•Ì•°ÁÉ¥µ•ÈÑ•ÍÐ¸ð½Àøð½‘¥Øø(€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡¥ÍÑ½Éäµ±¥ÍÐˆø(€€€€€€€€€€€€€€€€€íÁÉ½É•ÍÍ…Ñ„¹…ÑÑ•µÁÑÌ¹Í±¥” À°€à¤¹µ…À ¡…ÑÑ•µÁÐ¤€ôø€ (€€€€€€€€€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰¡¥ÍÑ½Éäµ¥Ñ•´ˆ­•äõí…ÑÑ•µÁÐ¹¥‘ôø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥ØøñÍÑÉ½¹œùí…ÑÑ•µÁÐ¹µ½‘”€ôôô€‰É•Ù¥•Üˆ€ü€‰I•Á…Í¼ˆ€è€‰Q•ÍÐ…±•…Ñ½É¥¼‰ôð½ÍÑÉ½¹œøñÍÁ…¸ùí™½Éµ…Ñ…Ñ”¡…ÑÑ•µÁÐ¹½µÁ±•Ñ•‘Ð¥ôƒ
Üí…ÑÑ•µÁÐ¹Ñ½Ñ…±ôÁÉ•Õ¹Ñ…Ìð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡¥ÍÑ½ÉäµÍ½É”ˆøñÍÑÉ½¹œùí™½Éµ…ÑM½É”¡…ÑÑ•µÁÐ¹‘¥É•ÑM½É”¥ô€¼í…ÑÑ•µÁÐ¹Ñ½Ñ…±ôð½ÍÑÉ½¹œøñÍÁ…¸ùÁÕ¹ÑÕ…§Í¸‘¥É•Ñ„ð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€€€€€€€€€€€ð½…ÉÑ¥±”ø(€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Á…¹•°µ…ÉÁÉ½™¥±”µÁ…¹•°ˆ…É¥„µ±…‰•±±•‘‰äô‰ÁÉ½™¥±”µÑ¥Ñ±”ˆø(€€€€€€€€€€€€ñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùI•ÕÁ•É…§Í¸ð½ÍÁ…¸øñ È¥ô‰ÁÉ½™¥±”µÑ¥Ñ±”ˆù½¹Í•ÉÙ„ÑÔÍ‘¥¼‘”ÁÉ½É•Í¼ð½ ÈøñÀù°¡¥ÍÑ½É¥…°Í”Í¥¹É½¹¥é„½¸M¥Ñ•ÌäÑ…µ‰§¥¸Í”½¹Í•ÉÙ„½µÁ±•Ñ¼•¸•ÍÑ”¹…Ù•…‘½È¸°Í‘¥¼Á•Éµ¥Ñ”É•ÕÁ•É…É±¼•¸½ÑÉ¼‘¥ÍÁ½Í¥Ñ¥Ù¼¸ð½Àøð½‘¥Øø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µ½¹ÑÉ½±Ìˆø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µ½‘”ˆøñ½‘”ùíÁÉ½™¥±•-•äñð€‰AÉ•Á…É…¹‘¿Š˜‰ôð½½‘”øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÅÕ¥•ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘¥Í…‰±•õì…ÁÉ½™¥±•-•åô½¹±¥¬õí½ÁåAÉ½™¥±•-•åôù½Á¥…Èð½‰ÕÑÑ½¸øð½‘¥Øø(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µ¥µÁ½ÉÐˆøñ±…‰•°¡Ñµ±½Èô‰ÁÉ½™¥±”µ¥¹ÁÕÐˆùI•ÕÁ•É…È½ÑÉ¼Í‘¥¼ð½±…‰•°øñ‘¥Øøñ¥¹ÁÕÐ¥ô‰ÁÉ½™¥±”µ¥¹ÁÕÐˆÙ…±Õ”õíÁÉ½™¥±•%¹ÁÕÑô½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÍ•ÑAÉ½™¥±•%¹ÁÕÐ¡•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¥ôÁ±…•¡½±‘•Èô‰áááááááàµáááà´Ñááàµáááàµáááááááááááàˆ€¼øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÅÕ¥•ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôøÙ½¥¥µÁ½ÉÑAÉ½™¥±•-•ä ¥ôùI•ÕÁ•É…Èð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øø(€€€€€€€€€€€€€€ñ™¥•±‘Í•Ð±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µ‰…­ÕÀˆ…É¥„µ‘•ÍÉ¥‰•‘‰äô‰ÁÉ½™¥±”µ‰…­ÕÀµ¡•±Àˆø(€€€€€€€€€€€€€€€€ñ±••¹ù½Á¥„‘”Í•ÕÉ¥‘…ð½±••¹ø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µ‰…­ÕÀµ…Ñ¥½¹Ìˆø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÅÕ¥•ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘¥Í…‰±•õì…ÁÉ½™¥±•-•åô½¹±¥¬õí•áÁ½ÉÑAÉ½É•ÍÍ	…­ÕÁôùáÁ½ÉÑ…È¡¥ÍÑ½É¥…°ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÅÕ¥•ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø‰…­ÕÁ¥±•%¹ÁÕÐ¹ÕÉÉ•¹Ðü¹±¥¬ ¥ôù%µÁ½ÉÑ…È½Á¥„ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ñ¥¹ÁÕÐÉ•˜õí‰…­ÕÁ¥±•%¹ÁÕÑô¥ô‰‰…­ÕÀµ™¥±”µ¥¹ÁÕÐˆ±…ÍÍ9…µ”ô‰ÍÈµ½¹±äˆÑåÁ”ô‰™¥±”ˆ…•ÁÐôˆ¹©Í½¸±…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆÑ…‰%¹‘•àõì´Åô½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÙ½¥¥µÁ½ÉÑAÉ½É•ÍÍ	…­ÕÁ¥±”¡•Ù•¹Ð¥ô€¼ø(€€€€€€€€€€€€€€€€ñÀ¥ô‰ÁÉ½™¥±”µ‰…­ÕÀµ¡•±Àˆù°…É¡¥Ù¼)M=8¥¹±Õå”•°Í‘¥¼…»Í¹¥µ¼ä•°¡¥ÍÑ½É¥…°‘”•ÍÑ”Á•É™¥°¸×…É‘…±¼½µ¼½¹Í•ÉÙ…Ëµ…ÌÑÔÍ‘¥¼‘”ÁÉ½É•Í¼¸ð½Àø(€€€€€€€€€€€€€€ð½™¥•±‘Í•Ðø(€€€€€€€€€€€€€íÁÉ½™¥±•5•ÍÍ…”€˜˜€ñÀ±…ÍÍ9…µ”ô‰ÁÉ½™¥±”µµ•ÍÍ…”ˆÉ½±”ô‰ÍÑ…ÑÕÌˆ…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ…É¥„µ…Ñ½µ¥Œô‰ÑÉÕ”ˆùíÁÉ½™¥±•5•ÍÍ…•ôð½Àùô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€€€ð½µ…¥¸ø(€€€€€€ð½‘¥Øø(€€€€¤ì(€ô((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµÍ¡•±°±…¹‘¥¹œµÍ¡•±°ˆø(€€€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰±…¹‘¥¹œµ¡•…‘•Èˆø(€€€€€€€€ñ	É…¹€¼ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡•…‘•Èµ…Ñ¥½¹ÌˆøñÍÁ…¸±…ÍÍ9…µ”ô‰¡•…‘•ÈµÍ½ÕÉ”ˆù	…¹¼¡¥ÍÓÍÉ¥¼€ÈÀÈËŠLÈÀÈÔð½ÍÁ…¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÅÕ¥•ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õíÍ¡½Ý…Í¡‰½…É‘ôù5¤ÁÉ½É•Í¼ð½‰ÕÑÑ½¸øð½‘¥Øø(€€€€€€ð½¡•…‘•Èø((€€€€€€ñµ…¥¸ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰¡•É¼µÍ•Ñ¥½¸ˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡•É¼µ½Áäˆø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùM¥µÕ±…‘½È‘”•¹Ñ•Ì‘”!…¥•¹‘„ð½ÍÁ…¸ø(€€€€€€€€€€€€ñ Ä±…ÍÍ9…µ”ô‰™½ÕÌµ¡•…‘¥¹œˆÉ•˜õíÁ…•!•…‘¥¹ôÑ…‰%¹‘•àõì´Åôù¹ÑÉ•¹„½µ¼•°“µ„‘•°•á…µ•¸¸ð½ Äø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰¡•É¼µ±•…ˆùQ•ÍÑÌ…±•…Ñ½É¥½Ì½¹ÍÑÉÕ¥‘½Ìƒé¹¥…µ•¹Ñ”½¸ÁÉ•Õ¹Ñ…ÌäÉ•ÍÁÕ•ÍÑ…Ì‘”½¹Ù½…Ñ½É¥…Ì…¹Ñ•É¥½É•Ì¸1…ÌÁÉ•Õ¹Ñ…Ì…¹Õ±…‘…Ì•ÍÓ…¸•á±Õ¥‘…Ì¸ð½Àø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÑÉÕÍÐµÉ½Üˆ…É¥„µ±…‰•°ô‰…É…Ñ•ËµÍÑ¥…Ì‘•°‰…¹¼ˆø(€€€€€€€€€€€€€€ñÍÁ…¸øñˆùí‰…¹­5•Ñ…‘…Ñ„¹Ñ½Ñ…±EÕ•ÍÑ¥½¹Íôð½ˆøÁÉ•Õ¹Ñ…ÌÛ…±¥‘…Ìð½ÍÁ…¸øñÍÁ…¸øñˆøÐð½ˆø½¹Ù½…Ñ½É¥…Ìð½ÍÁ…¸øñÍÁ…¸øñˆøÀð½ˆø…¹Õ±…‘…Ì¥¹±Õ¥‘…Ìð½ÍÁ…¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•ÑÕÀµ…Éˆ…É¥„µ±…‰•±±•‘‰äô‰Í•ÑÕÀµÑ¥Ñ±”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í•ÑÕÀµ…Éµ¡•…‘¥¹œˆøñÍÁ…¸±…ÍÍ9…µ”ô‰ÍÑ•Àµ±…‰•°ˆù½¹™¥ÕÉ„ÑÔÑ•ÍÐð½ÍÁ…¸øñ È¥ô‰Í•ÑÕÀµÑ¥Ñ±”ˆû
ý×…¹Ñ…ÌÁÉ•Õ¹Ñ…ÌÅÕ¥•É•ÌÉ•ÍÁ½¹‘•Èüð½ Èøð½‘¥Øø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÁÉ•Í•ÐµÉ¥ˆ…É¥„µ±…‰•°ô‰…¹Ñ¥‘…‘•ÌË…Á¥‘…Ìˆø(€€€€€€€€€€€€€íAIMQL¹µ…À ¡ÁÉ•Í•Ð¤€ôø€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”õíÁÉ•Í•Ðµ‰ÕÑÑ½¸€‘íÅÕ•ÍÑ¥½¹½Õ¹Ð€ôôôÁÉ•Í•Ð€ü€‰¥Ìµ…Ñ¥Ù”ˆ€è€ˆ‰õôÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõíÁÉ•Í•Ñô½¹±¥¬õì ¤€ôøÍ•ÑEÕ•ÍÑ¥½¹½Õ¹Ð¡ÁÉ•Í•Ð¥ôùíÁÉ•Í•Ñôð½‰ÕÑÑ½¸ø¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰½Õ¹Ðµ½¹ÑÉ½°ˆ¡Ñµ±½Èô‰ÅÕ•ÍÑ¥½¸µ½Õ¹ÐˆøñÍÁ…¸ù;éµ•É¼Á•ÉÍ½¹…±¥é…‘¼ð½ÍÁ…¸øñ¥¹ÁÕÐ¥ô‰ÅÕ•ÍÑ¥½¸µ½Õ¹ÐˆÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÄˆµ…àõíEUMQ%=9L¹±•¹Ñ¡ôÙ…±Õ”õíÅÕ•ÍÑ¥½¹½Õ¹Ñô½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÍ•ÑEÕ•ÍÑ¥½¹½Õ¹Ð¡5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸¡EUMQ%=9L¹±•¹Ñ °9Õµ‰•È¡•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¤ñð€Ä¤¤¥ô€¼øð½±…‰•°ø(€€€€€€€€€€€€ñ¥¹ÁÕÐ±…ÍÍ9…µ”ô‰½Õ¹ÐµÉ…¹”ˆÑåÁ”ô‰É…¹”ˆµ¥¸ôˆÄˆµ…àõíEUMQ%=9L¹±•¹Ñ¡ôÙ…±Õ”õíÅÕ•ÍÑ¥½¹½Õ¹Ñô…É¥„µ±…‰•°ô‰;éµ•É¼‘”ÁÉ•Õ¹Ñ…Ìˆ½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÍ•ÑEÕ•ÍÑ¥½¹½Õ¹Ð¡9Õµ‰•È¡•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¤¥ô€¼ø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É…¹”µ±…‰•±Ìˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñÍÁ…¸øÄð½ÍÁ…¸øñÍÁ…¸ùíEUMQ%=9L¹±•¹Ñ¡ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰ÕÑÑ½¸‰ÕÑÑ½¸µÁÉ¥µ…Éä‰ÕÑÑ½¸µ±…É”ÍÑ…ÉÐµ‰ÕÑÑ½¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õíÍÑ…ÉÑQ•ÍÑôù½µ•¹é…ÈÑ•ÍÐ‘”íÅÕ•ÍÑ¥½¹½Õ¹ÑôÁÉ•Õ¹Ñ…Ìð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í•ÑÕÀµ¹½Ñ”ˆùM•±•§Í¸…±•…Ñ½É¥„°Í¥¸É•Á•Ñ¥ÈÁÉ•Õ¹Ñ…Ì‘•¹ÑÉ¼‘•°µ¥Íµ¼Ñ•ÍÐ¸ð½Àø(€€€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰‘•Ñ…¥±ÌµÍ•Ñ¥½¸ˆø(€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰‘•Ñ…¥°µ…ÉÍ½É¥¹œµ…ÉˆøñÍÁ…¸±…ÍÍ9…µ”ô‰‘•Ñ…¥°µ¥¹‘•àˆøÀÄð½ÍÁ…¸øñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½Üˆù½ÉÉ•§Í¸½™¥¥…°ð½ÍÁ…¸øñ ÈùU¹„›ÍÉµÕ±„±…É„°Í¥¸¹½Ñ…Ì¥¹Ù•¹Ñ…‘…Ì¸ð½ Èøñ‘¥Ø±…ÍÍ9…µ”ô‰™½ÉµÕ±„µÙ¥ÍÕ…°ˆ…É¥„µ±…‰•°ô‰¥•ÉÑ¼·…ÌÕ¹¼°•ÉÉ½Èµ•¹½Ì•É¼½µ„Ù•¥¹Ñ¥¥¹¼°‰±…¹¼•É¼ˆøñÍÁ…¸±…ÍÍ9…µ”ô‰™½ÉµÕ±„µ½½ˆø¬Ä€ñÍµ…±°ù…¥•ÉÑ¼ð½Íµ…±°øð½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰™½ÉµÕ±„µ‰…ˆûŠ"HÀ°ÈÔ€ñÍµ…±°ù•ÉÉ½Èð½Íµ…±°øð½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰™½ÉµÕ±„µ¹•ÕÑÉ…°ˆøÀ€ñÍµ…±°ù•¸‰±…¹¼ð½Íµ…±°øð½ÍÁ…¸øð½‘¥ØøñÀù1„…Á±¥…§Í¸µÕ•ÍÑÉ„±„ÁÕ¹ÑÕ…§Í¸‘¥É•Ñ„¸9¼‘•±…É„…ÁÉ½‰…‘½Ì¹¤½¹Ù¥•ÉÑ”•°É•ÍÕ±Ñ…‘¼„Õ¹„…±¥™¥…§Í¸½™¥¥…°Í½‰É”€ÄÀ¸ð½Àøð½‘¥Øøð½…ÉÑ¥±”ø(€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰‘•Ñ…¥°µ…ÉÍ½ÕÉ”µ…ÉˆøñÍÁ…¸±…ÍÍ9…µ”ô‰‘•Ñ…¥°µ¥¹‘•àˆøÀÈð½ÍÁ…¸øñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùQÉ…é…‰¥±¥‘…ð½ÍÁ…¸øñ ÈùM…‰•Ì‘”“Í¹‘”Í…±”…‘„ÁÉ•Õ¹Ñ„¸ð½ Èøñ‘¥Ø±…ÍÍ9…µ”ô‰å•…ÈµÉ¥ˆùíå•…ÉMÕµµ…Éä¹µ…À ¡må•…È°½Õ¹Ñt¤€ôø€ñ‘¥Ø­•äõíå•…ÉôøñÍÑÉ½¹œùíå•…Éôð½ÍÑÉ½¹œøñÍÁ…¸ùí½Õ¹ÑôÛ…±¥‘…Ìð½ÍÁ…¸øð½‘¥Øø¥ôð½‘¥ØøñÀù1„É•Ù¥Í§Í¸µÕ•ÍÑÉ„½¹Ù½…Ñ½É¥„°»éµ•É¼½É¥¥¹…°äÕ¹„•áÁ±¥…§Í¸É…é½¹…‘„¸Q½‘…Ì±…ÌÁ±…¹Ñ¥±±…ÌÕÑ¥±¥é…‘…ÌÑ¥•¹•¸…Ë…Ñ•È‘•™¥¹¥Ñ¥Ù¼°¥¹±Õ¥‘„±„‘”€ÈÀÈÈ¸Õ‘¥Ñ½Ëµ„¹½Éµ…Ñ¥Ù„„í±•…±Y•É¥™¥…Ñ¥½¹…Ñ„¹Ù•É¥™¥•‘Ð¹ÍÁ±¥Ð ˆ´ˆ¤¹É•Ù•ÉÍ” ¤¹©½¥¸ ˆ¼ˆ¥ôè™Õ•¹Ñ”ÑÉ…é…‰±”•¸íQI	1}aA19Q%=9Mô‘”í±•…±Y•É¥™¥…Ñ¥½¹…Ñ„¹ÅÕ•ÍÑ¥½¹ÍI•Ù¥•Ý•‘ô•áÁ±¥…¥½¹•Ìì±„•á•Á§Í¸Á•¹‘¥•¹Ñ”ä±…ÌÉ•±…Ì¡¥ÍÓÍÉ¥…ÌÍ”…‘Ù¥•ÉÑ•¸•áÁÉ•Í…µ•¹Ñ”¸ð½Àøð½‘¥Øøð½…ÉÑ¥±”ø(€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€ð½µ…¥¸ø((€€€€€€ñ™½½Ñ•È±…ÍÍ9…µ”ô‰±…¹‘¥¹œµ™½½Ñ•Èˆøñ	É…¹€¼øñÀù!•ÉÉ…µ¥•¹Ñ„‘”ÁË…Ñ¥„¹¼½™¥¥…°¸	…¹¼±¥µ¥Ñ…‘¼„½¹Ù½…Ñ½É¥…Ì‘”…•Í¼±¥‰É”¸ð½Àøð½™½½Ñ•Èø(€€€€ð½‘¥Øø(€€¤ì)ô(