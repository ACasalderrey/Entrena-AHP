import { getD1 } from "../../../db";
import questionData from "../../data/questions.json";
import { corsHeaders, corsPreflightResponse } from "../../lib/cors";
import { D1_ANSWER_CHUNK_SIZE } from "../../lib/progress";

type AttemptItem = {
  questionId?: unknown;
  selectedOption?: unknown;
  status?: unknown;
};

type AttemptPayload = {
  id?: unknown;
  completedAt?: unknown;
  mode?: unknown;
  total?: unknown;
  correct?: unknown;
  incorrect?: unknown;
  blank?: unknown;
  directScore?: unknown;
  items?: unknown;
};

type ValidatedItem = {
  questionId: string;
  selectedOption: string | null;
  status: "correct" | "incorrect" | "blank";
};

type ValidatedAttempt = {
  id: string;
  completedAt: number;
  mode: "standard" | "review";
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  directScore: number;
};

const PROFILE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_ID = /^aeat-(2022|2023|2024|2025)-a-\d{3}$/;
const OPTION = /^[ABCD]$/;
const STATUSES = new Set(["correct", "incorrect", "blank"]);
const QUESTION_ANSWERS = new Map(
  (questionData as Array<{ id: string; correctOptions: string[] }>).map((question) => [
    question.id,
    question.correctOptions[0],
  ]),
);

function profileKeyFrom(request: Request): string | null {
  const value = request.headers.get("x-progress-key")?.trim() ?? "";
  return PROFILE_KEY.test(value) ? value : null;
}

function responseHeaders(request: Request): Headers {
  const headers = corsHeaders(request);
  headers.set("cache-control", "no-store");
  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: responseHeaders(request) });
}

function errorResponse(request: Request, message: string, status: number) {
  return jsonResponse(request, { error: message }, status);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 372;
}

function validateAttempt(value: unknown): { attempt: ValidatedAttempt; items: ValidatedItem[] } | null {
  if (!value || typeof value !== "object") return null;
  const attempt = value as AttemptPayload;
  if (
    typeof attempt.id !== "string" ||
    !ATTEMPT_ID.test(attempt.id) ||
    typeof attempt.completedAt !== "number" ||
    !Number.isSafeInteger(attempt.completedAt) ||
    attempt.completedAt < 1_600_000_000_000 ||
    attempt.completedAt > Date.now() + 300_000 ||
    (attempt.mode !== "standard" && attempt.mode !== "review") ||
    !isCount(attempt.total) ||
    !isCount(attempt.correct) ||
    !isCount(attempt.incorrect) ||
    !isCount(attempt.blank) ||
    attempt.correct + attempt.incorrect + attempt.blank !== attempt.total ||
    typeof attempt.directScore !== "number" ||
    !Number.isFinite(attempt.directScore) ||
    !Array.isArray(attempt.items) ||
    attempt.items.length !== attempt.total ||
    attempt.items.length < 1
  ) {
    return null;
  }

  const seen = new Set<string>();
  const items: ValidatedItem[] = [];
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  for (const rawItem of attempt.items) {
    if (!rawItem || typeof rawItem !== "object") return null;
    const item = rawItem as AttemptItem;
    if (
      typeof item.questionId !== "string" ||
      !QUESTION_ID.test(item.questionId) ||
      seen.has(item.questionId) ||
      (item.selectedOption !== null && (typeof item.selectedOption !== "string" || !OPTION.test(item.selectedOption))) ||
      typeof item.status !== "string" ||
      !STATUSES.has(item.status) ||
      (item.status === "blank" && item.selectedOption !== null) ||
      (item.status !== "blank" && item.selectedOption === null)
    ) {
      return null;
    }

    const correctOption = QUESTION_ANSWERS.get(item.questionId);
    if (!correctOption) return null;
    const expectedStatus = item.selectedOption === null
      ? "blank"
      : item.selectedOption === correctOption
        ? "correct"
        : "incorrect";
    if (item.status !== expectedStatus) return null;

    seen.add(item.questionId);
    correct += expectedStatus === "correct" ? 1 : 0;
    incorrect += expectedStatus === "incorrect" ? 1 : 0;
    blank += expectedStatus === "blank" ? 1 : 0;
    items.push({
      questionId: item.questionId,
      selectedOption: item.selectedOption,
      status: expectedStatus,
    });
  }

  if (
    attempt.correct !== correct ||
    attempt.incorrect !== incorrect ||
    attempt.blank !== blank ||
    Math.abs(attempt.directScore - (correct - incorrect / 4)) > Number.EPSILON
  ) {
    return null;
  }

  return {
    attempt: {
      id: attempt.id,
      completedAt: attempt.completedAt,
      mode: attempt.mode,
      total: attempt.total,
      correct,
      incorrect,
      blank,
      directScore: attempt.directScore,
    },
    items,
  };
}

export function OPTIONS(request: Request) {
  return corsPreflightResponse(request);
}

export async function GET(request: Request) {
  const profileKey = profileKeyFrom(request);
  if (!profileKey) return errorResponse(request, "Código de progreso no válido.", 400);

  try {
    const database = await getD1();
    const [attemptsResult, statsResult, summaryResult] = await Promise.all([
      database
        .prepare(
          `SELECT id, completed_at AS completedAt, mode, total, correct, incorrect, blank,
                  direct_score AS directScore
             FROM attempts
            WHERE profile_key = ?
            ORDER BY completed_at DESC
            LIMIT 100`,
        )
        .bind(profileKey)
        .all(),
      database
        .prepare(
          `SELECT answers.question_id AS questionId,
                  COUNT(*) AS attempts,
                  SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correctCount,
                  SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrectCount,
                  SUM(CASE WHEN status = 'blank' THEN 1 ELSE 0 END) AS blankCount,
                  MAX(completed_at) AS lastSeen,
                  (SELECT latest.status
                     FROM attempt_answers AS latest
                    WHERE latest.profile_key = ?
                      AND latest.question_id = answers.question_id
                    ORDER BY latest.completed_at DESC, latest.attempt_id DESC
                    LIMIT 1) AS latestStatus
             FROM attempt_answers AS answers
            WHERE answers.profile_key = ?
            GROUP BY answers.question_id
            ORDER BY incorrectCount DESC, lastSeen DESC`,
        )
        .bind(profileKey, profileKey)
        .all(),
      database
        .prepare(
          `SELECT COUNT(*) AS totalTests,
                  COALESCE(SUM(total), 0) AS totalQuestions,
                  COALESCE(SUM(correct), 0) AS correct,
                  COALESCE(SUM(incorrect), 0) AS incorrect,
                  COALESCE(SUM(blank), 0) AS blank,
                  COALESCE(SUM(direct_score), 0) AS directScore
             FROM attempts
            WHERE profile_key = ?`,
        )
        .bind(profileKey)
        .all(),
    ]);

    return jsonResponse(
      request,
      {
        attempts: attemptsResult.results,
        questionStats: statsResult.results,
        summary: summaryResult.results[0],
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    if (message.includes("no such table")) {
      return errorResponse(request, "El historial se está preparando. Inténtalo de nuevo en unos instantes.", 503);
    }
    return errorResponse(request, "No se pudo recuperar el historial.", 500);
  }
}

export async function POST(request: Request) {
  const profileKey = profileKeyFrom(request);
  if (!profileKey) return errorResponse(request, "Código de progreso no válido.", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(request, "El intento no contiene JSON válido.", 400);
  }

  const validated = validateAttempt((body as { attempt?: unknown })?.attempt);
  if (!validated) return errorResponse(request, "Los datos del intento no son válidos.", 400);

  const { attempt, items } = validated;

  try {
    const database = await getD1();
    const existing = await database.prepare("SELECT id FROM attempts WHERE id = ?").bind(attempt.id).first();
    if (existing) return jsonResponse(request, { saved: true, duplicate: true });

    const statements: D1PreparedStatement[] = [
      database
        .prepare(
          `INSERT INTO attempts
             (id, profile_key, completed_at, mode, total, correct, incorrect, blank, direct_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          attempt.id,
          profileKey,
          attempt.completedAt,
          attempt.mode,
          attempt.total,
          attempt.correct,
          attempt.incorrect,
          attempt.blank,
          attempt.directScore,
        ),
    ];

    // D1 admite como máximo 100 parámetros por consulta: 16 filas × 6 valores = 96.
    for (let start = 0; start < items.length; start += D1_ANSWER_CHUNK_SIZE) {
      const chunk = items.slice(start, start + D1_ANSWER_CHUNK_SIZE);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const bindings = chunk.flatMap((item) => [
        attempt.id,
        profileKey,
        item.questionId,
        item.selectedOption,
        item.status,
        attempt.completedAt,
      ]);
      statements.push(
        database
          .prepare(
            `INSERT INTO attempt_answers
               (attempt_id, profile_key, question_id, selected_option, status, completed_at)
             VALUES ${placeholders}`,
          )
          .bind(...bindings),
      );
    }

    await database.batch(statements);
    return jsonResponse(request, { saved: true }, 201);
  } catch {
    return errorResponse(request, "No se pudo guardar el intento.", 500);
  }
}
