export const PROGRESS_BACKUP_FORMAT = "entrena-ahp-progress-backup";
export const PROGRESS_CACHE_FORMAT = "entrena-ahp-progress-cache";
export const PROGRESS_STORAGE_VERSION = 1;

const PROFILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTEMPT_PATTERN = PROFILE_PATTERN;
const OPTION_KEYS = new Set(["A", "B", "C", "D"]);
const STATUSES = new Set(["correct", "incorrect", "blank"]);
const MODES = new Set(["standard", "review"]);
const MAX_DATE_OFFSET = 300_000;
const MIN_ATTEMPT_DATE = 1_600_000_000_000;
const MAX_APPLIED_IDS = 100_000;
const MILLISECONDS_PER_QUESTION = 67_500;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}

function isSafeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isTimestamp(value, now) {
  return Number.isSafeInteger(value) && value >= MIN_ATTEMPT_DATE && value <= now + MAX_DATE_OFFSET;
}

function closeEnough(left, right) {
  return Math.abs(left - right) < 1e-7;
}

function validateTiming(value, total, path) {
  const durationMissing = value.durationMs === undefined || value.durationMs === null;
  const limitMissing = value.timeLimitMs === undefined || value.timeLimitMs === null;
  if (durationMissing && limitMissing) return { durationMs: null, timeLimitMs: null };
  if (durationMissing || limitMissing) fail(`${path} contiene un registro de tiempo incompleto.`);
  if (!Number.isSafeInteger(value.durationMs) || value.durationMs < 0) {
    fail(`${path}.durationMs no es válido.`);
  }
  if (!Number.isSafeInteger(value.timeLimitMs) || value.timeLimitMs !== total * MILLISECONDS_PER_QUESTION) {
    fail(`${path}.timeLimitMs no coincide con la duración proporcional oficial.`);
  }
  return { durationMs: value.durationMs, timeLimitMs: value.timeLimitMs };
}

function knownAnswer(answerByQuestion, questionId) {
  if (answerByQuestion instanceof Map) return answerByQuestion.get(questionId);
  if (isRecord(answerByQuestion)) return answerByQuestion[questionId];
  return undefined;
}

function validateAttemptSummary(value, now, path) {
  if (!isRecord(value)) fail(`${path} no es un intento válido.`);
  if (typeof value.id !== "string" || !ATTEMPT_PATTERN.test(value.id)) fail(`${path}.id no es válido.`);
  if (!isTimestamp(value.completedAt, now)) fail(`${path}.completedAt no es válido.`);
  if (!MODES.has(value.mode)) fail(`${path}.mode no es válido.`);

  for (const field of ["total", "correct", "incorrect", "blank"]) {
    if (!isSafeCount(value[field])) fail(`${path}.${field} no es válido.`);
  }
  if (value.total < 1 || value.correct + value.incorrect + value.blank !== value.total) {
    fail(`${path} contiene contadores incoherentes.`);
  }
  if (!isFiniteNumber(value.directScore) || !closeEnough(value.directScore, value.correct - value.incorrect / 4)) {
    fail(`${path}.directScore no coincide con la fórmula oficial.`);
  }

  const timing = validateTiming(value, value.total, path);

  return {
    id: value.id.toLowerCase(),
    completedAt: value.completedAt,
    mode: value.mode,
    total: value.total,
    correct: value.correct,
    incorrect: value.incorrect,
    blank: value.blank,
    directScore: value.directScore,
    ...timing,
  };
}

function validatePendingAttempt(value, answerByQuestion, now, path) {
  const attempt = validateAttemptSummary(value, now, path);
  if (!Array.isArray(value.items) || value.items.length !== attempt.total) {
    fail(`${path}.items no coincide con el número de preguntas.`);
  }

  const seenQuestions = new Set();
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  const items = value.items.map((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    if (!isRecord(item)) fail(`${itemPath} no es válido.`);
    if (typeof item.questionId !== "string" || !knownAnswer(answerByQuestion, item.questionId)) {
      fail(`${itemPath}.questionId no pertenece al banco actual.`);
    }
    if (seenQuestions.has(item.questionId)) fail(`${itemPath}.questionId está duplicado.`);
    if (item.selectedOption !== null && !OPTION_KEYS.has(item.selectedOption)) {
      fail(`${itemPath}.selectedOption no es válida.`);
    }
    if (!STATUSES.has(item.status)) fail(`${itemPath}.status no es válido.`);

    const expectedStatus = item.selectedOption === null
      ? "blank"
      : item.selectedOption === knownAnswer(answerByQuestion, item.questionId)
        ? "correct"
        : "incorrect";
    if (item.status !== expectedStatus) fail(`${itemPath}.status no coincide con la respuesta seleccionada.`);

    seenQuestions.add(item.questionId);
    correct += expectedStatus === "correct" ? 1 : 0;
    incorrect += expectedStatus === "incorrect" ? 1 : 0;
    blank += expectedStatus === "blank" ? 1 : 0;
    return {
      questionId: item.questionId,
      selectedOption: item.selectedOption,
      status: expectedStatus,
    };
  });

  if (attempt.correct !== correct || attempt.incorrect !== incorrect || attempt.blank !== blank) {
    fail(`${path} no coincide con el detalle de respuestas.`);
  }
  return { ...attempt, items };
}

function validateProgress(value, answerByQuestion, now) {
  if (!isRecord(value) || !Array.isArray(value.attempts) || !Array.isArray(value.questionStats) || !isRecord(value.summary)) {
    fail("La copia no contiene un historial válido.");
  }
  if (value.attempts.length > 100) fail("La copia contiene demasiados resultados recientes.");

  const attemptIds = new Set();
  const attempts = value.attempts.map((attempt, index) => {
    const validated = validateAttemptSummary(attempt, now, `progress.attempts[${index}]`);
    if (attemptIds.has(validated.id)) fail("La copia contiene intentos duplicados.");
    attemptIds.add(validated.id);
    return validated;
  });

  const summary = {};
  for (const field of ["totalTests", "totalQuestions", "correct", "incorrect", "blank"]) {
    if (!isSafeCount(value.summary[field])) fail(`progress.summary.${field} no es válido.`);
    summary[field] = value.summary[field];
  }
  if (!isFiniteNumber(value.summary.directScore)) fail("progress.summary.directScore no es válido.");
  summary.directScore = value.summary.directScore;
  if (summary.correct + summary.incorrect + summary.blank !== summary.totalQuestions) {
    fail("El resumen contiene contadores incoherentes.");
  }
  if (!closeEnough(summary.directScore, summary.correct - summary.incorrect / 4)) {
    fail("La puntuación acumulada no coincide con la fórmula oficial.");
  }
  if (attempts.length > summary.totalTests) fail("Hay más intentos visibles que tests completados.");

  const questionIds = new Set();
  let statAttempts = 0;
  let statCorrect = 0;
  let statIncorrect = 0;
  let statBlank = 0;
  const questionStats = value.questionStats.map((stat, index) => {
    const path = `progress.questionStats[${index}]`;
    if (!isRecord(stat)) fail(`${path} no es válido.`);
    if (typeof stat.questionId !== "string" || !knownAnswer(answerByQuestion, stat.questionId)) {
      fail(`${path}.questionId no pertenece al banco actual.`);
    }
    if (questionIds.has(stat.questionId)) fail("La copia contiene estadísticas duplicadas.");
    for (const field of ["attempts", "correctCount", "incorrectCount", "blankCount"]) {
      if (!isSafeCount(stat[field])) fail(`${path}.${field} no es válido.`);
    }
    if (stat.attempts !== stat.correctCount + stat.incorrectCount + stat.blankCount) {
      fail(`${path} contiene contadores incoherentes.`);
    }
    if (!isTimestamp(stat.lastSeen, now)) fail(`${path}.lastSeen no es válido.`);
    if (!STATUSES.has(stat.latestStatus)) fail(`${path}.latestStatus no es válido.`);

    questionIds.add(stat.questionId);
    statAttempts += stat.attempts;
    statCorrect += stat.correctCount;
    statIncorrect += stat.incorrectCount;
    statBlank += stat.blankCount;
    return {
      questionId: stat.questionId,
      attempts: stat.attempts,
      correctCount: stat.correctCount,
      incorrectCount: stat.incorrectCount,
      blankCount: stat.blankCount,
      lastSeen: stat.lastSeen,
      latestStatus: stat.latestStatus,
    };
  });

  if (
    statAttempts !== summary.totalQuestions ||
    statCorrect !== summary.correct ||
    statIncorrect !== summary.incorrect ||
    statBlank !== summary.blank
  ) {
    fail("Las estadísticas por pregunta no coinciden con el resumen.");
  }

  return { attempts, questionStats, summary };
}

function validateAppliedIds(value) {
  if (!Array.isArray(value) || value.length > MAX_APPLIED_IDS) fail("La lista de intentos contabilizados no es válida.");
  const ids = [];
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== "string" || !ATTEMPT_PATTERN.test(id)) fail("Hay un UUID de intento no válido.");
    const normalized = id.toLowerCase();
    if (seen.has(normalized)) fail("Hay UUID de intento duplicados.");
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

function validateEnvelope(value, expectedFormat, dateField, answerByQuestion, now) {
  if (!isRecord(value) || value.format !== expectedFormat || value.version !== PROGRESS_STORAGE_VERSION) {
    fail("El archivo no es una copia compatible de Entrena AHP.");
  }
  if (typeof value[dateField] !== "string" || !Number.isFinite(Date.parse(value[dateField]))) {
    fail("La fecha de la copia no es válida.");
  }
  if (typeof value.profileKey !== "string" || !PROFILE_PATTERN.test(value.profileKey)) {
    fail("El código de progreso de la copia no es válido.");
  }

  const progress = validateProgress(value.progress, answerByQuestion, now);
  const appliedAttemptIds = validateAppliedIds(value.appliedAttemptIds);
  const applied = new Set(appliedAttemptIds);
  if (progress.attempts.some((attempt) => !applied.has(attempt.id))) {
    fail("La copia no identifica todos los intentos ya contabilizados.");
  }

  return {
    format: expectedFormat,
    version: PROGRESS_STORAGE_VERSION,
    [dateField]: new Date(value[dateField]).toISOString(),
    profileKey: value.profileKey.toLowerCase(),
    progress,
    appliedAttemptIds,
  };
}

export function createProgressCache({ profileKey, progress, appliedAttemptIds, savedAt = new Date() }) {
  return JSON.stringify({
    format: PROGRESS_CACHE_FORMAT,
    version: PROGRESS_STORAGE_VERSION,
    savedAt: new Date(savedAt).toISOString(),
    profileKey,
    progress,
    appliedAttemptIds: [...appliedAttemptIds],
  });
}

export function parseProgressCache(text, answerByQuestion, now = Date.now()) {
  try {
    const parsed = JSON.parse(text);
    return validateEnvelope(parsed, PROGRESS_CACHE_FORMAT, "savedAt", answerByQuestion, now);
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   profileKey: string,
 *   progress: any,
 *   appliedAttemptIds: Iterable<string>,
 *   pendingAttempts?: any[],
 *   exportedAt?: Date | string | number,
 * }} options
 */
export function createProgressBackup({
  profileKey,
  progress,
  appliedAttemptIds,
  pendingAttempts = [],
  exportedAt = new Date(),
}) {
  return JSON.stringify({
    format: PROGRESS_BACKUP_FORMAT,
    version: PROGRESS_STORAGE_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    profileKey,
    progress,
    appliedAttemptIds: [...appliedAttemptIds],
    pendingAttempts,
  }, null, 2);
}

export function parseProgressBackup(text, answerByQuestion, now = Date.now()) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("El archivo no contiene JSON válido.");
  }
  const envelope = validateEnvelope(parsed, PROGRESS_BACKUP_FORMAT, "exportedAt", answerByQuestion, now);
  if (!Array.isArray(parsed.pendingAttempts)) fail("La copia no contiene una cola de sincronización válida.");

  const pendingIds = new Set();
  const pendingAttempts = parsed.pendingAttempts.map((attempt, index) => {
    const validated = validatePendingAttempt(attempt, answerByQuestion, now, `pendingAttempts[${index}]`);
    if (pendingIds.has(validated.id)) fail("La copia contiene intentos pendientes duplicados.");
    if (!envelope.appliedAttemptIds.includes(validated.id)) {
      fail("Un intento pendiente no figura como contabilizado en la copia.");
    }
    pendingIds.add(validated.id);
    return validated;
  });

  return { ...envelope, pendingAttempts };
}
