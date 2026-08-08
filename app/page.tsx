"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import bankMetadata from "./data/bank-metadata.json";
import explanationData from "./data/explanations.json";
import questionData from "./data/questions.json";
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

const QUESTIONS = questionData as Question[];
const QUESTIONS_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
const EXPLANATIONS = explanationData as Record<string, QuestionExplanation>;
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const PRESETS = [10, 20, 40, 80];
const PROFILE_STORAGE_KEY = "entrena-ahp-progress-key";
const PENDING_STORAGE_PREFIX = "entrena-ahp-pending-attempt:";
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

function applyAttempt(previous: ProgressData, attempt: AttemptSubmission): ProgressData {
  if (previous.attempts.some((item) => item.id === attempt.id)) return previous;

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

async function postAttempt(profileKey: string, attempt: AttemptSubmission) {
  const response = await fetch("/api/progress", {
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
      <span className="brand-mark" aria-hidden="true">✓</span>
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
  const [progressData, setProgressData] = useState<ProgressData>(EMPTY_PROGRESS);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "offline">("loading");
  const syncRequest = useRef(0);
  const volatilePending = useRef<PendingAttempt[]>([]);
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
    // La sincronización se reinicia si se importa otro código de progreso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => pageHeading.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [stage, currentIndex]);

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = quizQuestions.length - answeredCount;
  const currentQuestion = quizQuestions[currentIndex];
  const progress = quizQuestions.length ? ((currentIndex + 1) / quizQuestions.length) * 100 : 0;
  const yearSummary = useMemo(
    () => Object.entries(bankMetadata.countsByYear) as [string, number][],
    [],
  );
  const weakQuestions = useMemo(
    () => progressData.questionStats
      .filter((stat) => stat.incorrectCount > 0 && stat.latestStatus !== "correct")
      .map((stat) => ({ stat, question: QUESTIONS_BY_ID.get(stat.questionId) }))
      .filter((item): item is { stat: QuestionStat; question: Question } => Boolean(item.question)),
    [progressData.questionStats],
  );

  async function requestProgress(key: string): Promise<ProgressData> {
    const response = await fetch("/api/progress", { headers: { "x-progress-key": key } });
    if (!response.ok) throw new Error("No se pudo cargar el progreso");
    return normalizeProgress(await response.json());
  }

  function mergePending(key: string, remote: ProgressData): ProgressData {
    return [...readPendingAttempts(), ...volatilePending.current]
      .filter((item) => item.profileKey === key)
      .reduce((current, item) => applyAttempt(current, item.attempt), remote);
  }

  async function synchronize(key: string) {
    const requestId = ++syncRequest.current;
    setSyncState("loading");
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
      const remote = await requestProgress(key);
      if (syncRequest.current !== requestId) return;
      setProgressData(mergePending(key, remote));
      setSyncState(localFlushed && volatileRemaining.length === 0 ? "ready" : "offline");
    } catch {
      if (syncRequest.current !== requestId) return;
      setProgressData((current) => mergePending(key, current));
      setSyncState("offline");
    }
  }

  function startQuiz(pool: Question[], count: number, mode: TestMode) {
    const selectedCount = Math.max(1, Math.min(pool.length, Math.floor(count)));
    setQuizMode(mode);
    setQuizQuestions(shuffled(pool).slice(0, selectedCount));
    setAnswers({});
    setCurrentIndex(0);
    setFinishPrompt(false);
    setResult(null);
    setStage("quiz");
    scrollToTop();
  }

  function startTest() {
    const selectedCount = Math.max(1, Math.min(QUESTIONS.length, Math.floor(questionCount)));
    setQuestionCount(selectedCount);
    startQuiz(QUESTIONS, selectedCount, "standard");
  }

  function startReviewTest() {
    if (weakQuestions.length === 0) return;
    startQuiz(weakQuestions.map((item) => item.question), Math.min(reviewCount, weakQuestions.length), "review");
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
    const evaluated = evaluateTest(quizQuestions, answers) as TestResult;
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
      completedAt: Date.now(),
      mode: quizMode,
      total: evaluated.total,
      correct: evaluated.correct,
      incorrect: evaluated.incorrect,
      blank: evaluated.blank,
      directScore: evaluated.directScore,
      items: evaluated.items.map((item) => ({
        questionId: item.question.id,
        selectedOption: item.selectedOption,
        status: item.status,
      })),
    };

    setResult(evaluated);
    setProgressData((current) => applyAttempt(current, attempt));
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
      const remote = await requestProgress(key);
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
      setProgressData(mergePending(key, remote));
      setSyncState("ready");
      setProfileMessage(stored
        ? "Progreso recuperado con el nuevo código."
        : "Progreso recuperado para esta sesión; el navegador impidió guardar el código.");
    } catch {
      if (syncRequest.current !== requestId) return;
      setProfileMessage("No se pudo comprobar el código. Se conserva tu progreso actual; inténtalo con conexión.");
      setSyncState("offline");
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
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button className="button button-quiet header-finish" type="button" onClick={requestFinish}>
            Finalizar
          </button>
        </header>

        <main className="quiz-main">
          {quizMode === "review" && <div className="mode-chip">Repaso de preguntas falladas</div>}
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
            <div className="results-kicker">Resultado del test</div>
            <div className="result-heading-row">
              <div>
                <h1 className="focus-heading" ref={pageHeading} tabIndex={-1}>{result.correct} de {result.total} correctas</h1>
                <p>Corrección con la fórmula oficial de puntuación directa.</p>
              </div>
              <div className="score-block" aria-label={`Puntuación directa ${formatScore(result.directScore)} de ${result.total}`}>
                <span className="score-number">{formatScore(result.directScore)}</span>
                <span className="score-maximum">de {result.total} puntos</span>
              </div>
            </div>

            <div className="result-stats">
              <article className="result-stat correct-stat"><span className="stat-label">Aciertos</span><strong>{result.correct}</strong><small>+{formatScore(result.correct)}</small></article>
              <article className="result-stat incorrect-stat"><span className="stat-label">Errores</span><strong>{result.incorrect}</strong><small>−{formatScore(result.incorrect / 4)}</small></article>
              <article className="result-stat blank-stat"><span className="stat-label">En blanco</span><strong>{result.blank}</strong><small>0 puntos</small></article>
            </div>

            <div className="score-formula">
              <span>Fórmula aplicada</span>
              <strong>{result.correct} − ({result.incorrect} ÷ 4) = {formatScore(result.directScore)}</strong>
              <p>No se muestra una nota oficial sobre 10: esa transformación depende del baremo de cada tribunal.</p>
            </div>
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
                        <strong>Por qué:</strong> {explanation?.explanation || fallback}
                        {selectedOption && (
                          <p className="answer-contrast">Tu opción afirmaba «{question.options[selectedOption]}»; el elemento decisivo es la regla anterior.</p>
                        )}
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

    return (
      <div className="app-shell dashboard-shell">
        <header className="simple-header">
          <Brand />
          <div className="header-actions">
            <span className={`sync-chip ${syncState}`} role="status" aria-live="polite">{syncState === "ready" ? "Progreso guardado" : syncState === "loading" ? "Sincronizando…" : "Pendiente de conexión"}</span>
            <button className="button button-primary" type="button" onClick={resetTest}>Nuevo test</button>
          </div>
        </header>

        <main className="dashboard-main">
          <section className="dashboard-hero">
            <div><span className="eyebrow">Panel de estudio</span><h1 className="focus-heading" ref={pageHeading} tabIndex={-1}>Tu progreso, de un vistazo.</h1><p>El historial identifica las preguntas que conviene volver a practicar.</p></div>
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
                      <div><strong>{attempt.mode === "review" ? "Repaso" : "Test aleatorio"}</strong><span>{formatDate(attempt.completedAt)} · {attempt.total} preguntas</span></div>
                      <div className="history-score"><strong>{formatScore(attempt.directScore)} / {attempt.total}</strong><span>puntuación directa</span></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel-card profile-panel" aria-labelledby="profile-title">
            <div><span className="eyebrow">Recuperación</span><h2 id="profile-title">Conserva tu código de progreso</h2><p>Tu historial se asocia a este identificador anónimo. Guárdalo para recuperar el progreso en otro navegador o dispositivo.</p></div>
            <div className="profile-controls">
              <div className="profile-code"><code>{profileKey || "Preparando…"}</code><button className="button button-quiet" type="button" disabled={!profileKey} onClick={copyProfileKey}>Copiar</button></div>
              <div className="profile-import"><label htmlFor="profile-input">Recuperar otro código</label><div><input id="profile-input" value={profileInput} onChange={(event) => setProfileInput(event.target.value)} placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" /><button className="button button-quiet" type="button" onClick={() => void importProfileKey()}>Recuperar</button></div></div>
              {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
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
            <div className="setup-card-heading"><span className="step-label">Configura tu test</span><h2 id="setup-title">¿Cuántas preguntas quieres responder?</h2></div>
            <div className="preset-grid" aria-label="Cantidades rápidas">
              {PRESETS.map((preset) => <button className={`preset-button ${questionCount === preset ? "is-active" : ""}`} type="button" key={preset} onClick={() => setQuestionCount(preset)}>{preset}</button>)}
            </div>
            <label className="count-control" htmlFor="question-count"><span>Número personalizado</span><input id="question-count" type="number" min="1" max={QUESTIONS.length} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(QUESTIONS.length, Number(event.target.value) || 1)))} /></label>
            <input className="count-range" type="range" min="1" max={QUESTIONS.length} value={questionCount} aria-label="Número de preguntas" onChange={(event) => setQuestionCount(Number(event.target.value))} />
            <div className="range-labels" aria-hidden="true"><span>1</span><span>{QUESTIONS.length}</span></div>
            <button className="button button-primary button-large start-button" type="button" onClick={startTest}>Comenzar test de {questionCount} preguntas</button>
            <p className="setup-note">Selección aleatoria, sin repetir preguntas dentro del mismo test.</p>
          </section>
        </section>

        <section className="details-section">
          <article className="detail-card scoring-card"><span className="detail-index">01</span><div><span className="eyebrow">Corrección oficial</span><h2>Una fórmula clara, sin notas inventadas.</h2><div className="formula-visual" aria-label="Acierto más uno, error menos cero coma veinticinco, blanco cero"><span className="formula-good">+1 <small>acierto</small></span><span className="formula-bad">−0,25 <small>error</small></span><span className="formula-neutral">0 <small>en blanco</small></span></div><p>La aplicación muestra la puntuación directa. No declara aprobados ni convierte el resultado a una calificación oficial sobre 10.</p></div></article>
          <article className="detail-card source-card"><span className="detail-index">02</span><div><span className="eyebrow">Trazabilidad</span><h2>Sabes de dónde sale cada pregunta.</h2><div className="year-grid">{yearSummary.map(([year, count]) => <div key={year}><strong>{year}</strong><span>{count} válidas</span></div>)}</div><p>La revisión muestra convocatoria, número original y una explicación razonada. Todas las plantillas utilizadas tienen carácter definitivo, incluida la correspondiente a 2022.</p></div></article>
        </section>
      </main>

      <footer className="landing-footer"><Brand /><p>Herramienta de práctica no oficial. Banco limitado a convocatorias de acceso libre.</p></footer>
    </div>
  );
}
