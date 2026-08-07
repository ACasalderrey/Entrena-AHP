"use client";

import { useEffect, useMemo, useState } from "react";
import bankMetadata from "./data/bank-metadata.json";
import questionData from "./data/questions.json";
import { evaluateTest } from "./lib/scoring";

type OptionKey = "A" | "B" | "C" | "D";

type Question = {
  id: string;
  year: number;
  sourceQuestionNumber: number;
  prompt: string;
  options: Record<OptionKey, string>;
  correctOptions: OptionKey[];
  isReserve: false;
  answerKeyLabel: "provisional" | "definitiva";
  sources: {
    questionnaire: string;
    answerKey: string;
  };
};

type ReviewItem = {
  question: Question;
  selectedOption: OptionKey | null;
  status: "correct" | "incorrect" | "blank";
};

type TestResult = {
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  directScore: number;
  items: ReviewItem[];
};

const QUESTIONS = questionData as Question[];
const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];
const PRESETS = [10, 20, 40, 80];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function formatScore(value: number) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
  const [stage, setStage] = useState<"setup" | "quiz" | "results">("setup");
  const [questionCount, setQuestionCount] = useState(20);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [finishPrompt, setFinishPrompt] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = quizQuestions.length - answeredCount;
  const currentQuestion = quizQuestions[currentIndex];
  const progress = quizQuestions.length ? ((currentIndex + 1) / quizQuestions.length) * 100 : 0;

  const yearSummary = useMemo(
    () => Object.entries(bankMetadata.countsByYear),
    [],
  );

  function startTest() {
    const selectedCount = Math.max(1, Math.min(QUESTIONS.length, Math.floor(questionCount)));
    setQuestionCount(selectedCount);
    setQuizQuestions(shuffled(QUESTIONS).slice(0, selectedCount));
    setAnswers({});
    setCurrentIndex(0);
    setFinishPrompt(false);
    setResult(null);
    setStage("quiz");
    scrollToTop();
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
    setResult(evaluateTest(quizQuestions, answers) as TestResult);
    setFinishPrompt(false);
    setStage("results");
    scrollToTop();
  }

  function resetTest() {
    setStage("setup");
    setQuizQuestions([]);
    setAnswers({});
    setResult(null);
    setFinishPrompt(false);
    scrollToTop();
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
          <section className="question-card" aria-labelledby="question-title">
            <div className="question-meta">
              <span className="source-chip">Convocatoria {currentQuestion.year}</span>
              <span>Pregunta {currentQuestion.sourceQuestionNumber}</span>
            </div>
            <h1 id="question-title">{currentQuestion.prompt}</h1>

            <fieldset className="options-list">
              <legend className="sr-only">Elige una respuesta</legend>
              {OPTION_KEYS.map((key) => (
                <label
                  className={`option-card ${selectedOption === key ? "is-selected" : ""}`}
                  key={key}
                >
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
                <button className="button button-quiet" type="button" onClick={() => setFinishPrompt(false)}>
                  Continuar
                </button>
                <button className="button button-primary" type="button" onClick={finishTest}>
                  Entregar igualmente
                </button>
              </div>
            </section>
          )}

          <nav className="question-navigation" aria-label="Navegación del test">
            <button
              className="button button-quiet"
              type="button"
              disabled={currentIndex === 0}
              onClick={() => moveTo(currentIndex - 1)}
            >
              ← Anterior
            </button>
            <span className="unanswered-copy">{unansweredCount} en blanco</span>
            {currentIndex < quizQuestions.length - 1 ? (
              <button className="button button-primary" type="button" onClick={() => moveTo(currentIndex + 1)}>
                Siguiente →
              </button>
            ) : (
              <button className="button button-primary" type="button" onClick={requestFinish}>
                Corregir test
              </button>
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
          <button className="button button-quiet" type="button" onClick={resetTest}>Nuevo test</button>
        </header>

        <main className="results-main">
          <section className="results-hero">
            <div className="results-kicker">Resultado del test</div>
            <div className="result-heading-row">
              <div>
                <h1>{result.correct} de {result.total} correctas</h1>
                <p>Corrección con la fórmula oficial de puntuación directa.</p>
              </div>
              <div className="score-block" aria-label={`Puntuación directa ${formatScore(result.directScore)} de ${result.total}`}>
                <span className="score-number">{formatScore(result.directScore)}</span>
                <span className="score-maximum">de {result.total} puntos</span>
              </div>
            </div>

            <div className="result-stats">
              <article className="result-stat correct-stat">
                <span className="stat-label">Aciertos</span>
                <strong>{result.correct}</strong>
                <small>+{formatScore(result.correct)}</small>
              </article>
              <article className="result-stat incorrect-stat">
                <span className="stat-label">Errores</span>
                <strong>{result.incorrect}</strong>
                <small>−{formatScore(result.incorrect / 4)}</small>
              </article>
              <article className="result-stat blank-stat">
                <span className="stat-label">En blanco</span>
                <strong>{result.blank}</strong>
                <small>0 puntos</small>
              </article>
            </div>

            <div className="score-formula">
              <span>Fórmula aplicada</span>
              <strong>{result.correct} − ({result.incorrect} ÷ 4) = {formatScore(result.directScore)}</strong>
              <p>No se muestra una nota oficial sobre 10: esa transformación depende del baremo de cada tribunal.</p>
            </div>
          </section>

          <section className="review-section" aria-labelledby="review-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Revisión</span>
                <h2 id="review-title">Errores y preguntas en blanco</h2>
              </div>
              <span className="review-count">{reviewItems.length}</span>
            </div>

            {reviewItems.length === 0 ? (
              <div className="perfect-card">
                <span aria-hidden="true">✓</span>
                <div>
                  <h3>Test perfecto</h3>
                  <p>No hay errores ni preguntas sin responder.</p>
                </div>
              </div>
            ) : (
              <div className="review-list">
                {reviewItems.map((item, index) => {
                  const { question, selectedOption, status } = item;
                  const correctOption = question.correctOptions[0];
                  return (
                    <article className="review-card" key={question.id}>
                      <div className="review-card-topline">
                        <span className={`status-chip ${status}`}>
                          {status === "blank" ? "En blanco" : "Error"}
                        </span>
                        <span>#{index + 1} · {question.year} · pregunta {question.sourceQuestionNumber}</span>
                      </div>
                      <h3>{question.prompt}</h3>
                      <div className="answer-comparison">
                        <div className="answer-row user-answer">
                          <span>Tu respuesta</span>
                          <p>
                            {selectedOption
                              ? <><b>{selectedOption}.</b> {question.options[selectedOption]}</>
                              : "Sin responder"}
                          </p>
                        </div>
                        <div className="answer-row correct-answer">
                          <span>Respuesta correcta</span>
                          <p><b>{correctOption}.</b> {question.options[correctOption]}</p>
                        </div>
                      </div>
                      <p className="error-explanation">
                        <strong>Explicación:</strong>{" "}
                        {status === "blank"
                          ? `No se marcó ninguna opción, por lo que no suma ni penaliza. La plantilla de ${question.year} señala la opción ${correctOption}.`
                          : `La opción elegida no coincide con la clave de la plantilla de ${question.year}, que señala la opción ${correctOption}.`}
                      </p>
                      <p className="source-line">
                        Fuente: {question.sources.questionnaire} · {question.answerKeyLabel === "provisional" ? "plantilla rotulada provisional" : "plantilla definitiva"}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="results-cta">
              <button className="button button-primary button-large" type="button" onClick={resetTest}>
                Preparar otro test
              </button>
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
        <span className="header-source">Banco histórico 2022–2025</span>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Simulador de Agentes de Hacienda</span>
            <h1>Entrena como el día del examen.</h1>
            <p className="hero-lead">
              Tests aleatorios construidos únicamente con preguntas y plantillas de convocatorias anteriores. Las preguntas anuladas están excluidas.
            </p>
            <div className="trust-row" aria-label="Características del banco">
              <span><b>{bankMetadata.totalQuestions}</b> preguntas válidas</span>
              <span><b>4</b> convocatorias</span>
              <span><b>0</b> anuladas incluidas</span>
            </div>
          </div>

          <section className="setup-card" aria-labelledby="setup-title">
            <div className="setup-card-heading">
              <span className="step-label">Configura tu test</span>
              <h2 id="setup-title">¿Cuántas preguntas quieres responder?</h2>
            </div>

            <div className="preset-grid" aria-label="Cantidades rápidas">
              {PRESETS.map((preset) => (
                <button
                  className={`preset-button ${questionCount === preset ? "is-active" : ""}`}
                  type="button"
                  key={preset}
                  onClick={() => setQuestionCount(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <label className="count-control" htmlFor="question-count">
              <span>Número personalizado</span>
              <input
                id="question-count"
                type="number"
                min="1"
                max={QUESTIONS.length}
                value={questionCount}
                onChange={(event) => {
                  const value = Number(event.target.value) || 1;
                  setQuestionCount(Math.max(1, Math.min(QUESTIONS.length, value)));
                }}
              />
            </label>
            <input
              className="count-range"
              type="range"
              min="1"
              max={QUESTIONS.length}
              value={questionCount}
              aria-label="Número de preguntas"
              onChange={(event) => setQuestionCount(Number(event.target.value))}
            />
            <div className="range-labels" aria-hidden="true"><span>1</span><span>{QUESTIONS.length}</span></div>

            <button className="button button-primary button-large start-button" type="button" onClick={startTest}>
              Comenzar test de {questionCount} preguntas
            </button>
            <p className="setup-note">Selección aleatoria, sin repetir preguntas dentro del mismo test.</p>
          </section>
        </section>

        <section className="details-section">
          <article className="detail-card scoring-card">
            <span className="detail-index">01</span>
            <div>
              <span className="eyebrow">Corrección oficial</span>
              <h2>Una fórmula clara, sin notas inventadas.</h2>
              <div className="formula-visual" aria-label="Acierto más uno, error menos cero coma veinticinco, blanco cero">
                <span className="formula-good">+1 <small>acierto</small></span>
                <span className="formula-bad">−0,25 <small>error</small></span>
                <span className="formula-neutral">0 <small>en blanco</small></span>
              </div>
              <p>La aplicación muestra la puntuación directa. No declara aprobados ni convierte el resultado a una calificación oficial sobre 10.</p>
            </div>
          </article>

          <article className="detail-card source-card">
            <span className="detail-index">02</span>
            <div>
              <span className="eyebrow">Trazabilidad</span>
              <h2>Sabes de dónde sale cada pregunta.</h2>
              <div className="year-grid">
                {yearSummary.map(([year, count]) => (
                  <div key={year}><strong>{year}</strong><span>{count} válidas</span></div>
                ))}
              </div>
              <p>La revisión final muestra convocatoria, número original y clave de la plantilla. El PDF de respuestas de 2022 está rotulado como provisional; la app conserva exactamente esa fuente local.</p>
            </div>
          </article>
        </section>
      </main>

      <footer className="landing-footer">
        <Brand />
        <p>Herramienta de práctica no oficial. Banco limitado a acceso libre, tipo A.</p>
      </footer>
    </div>
  );
}
