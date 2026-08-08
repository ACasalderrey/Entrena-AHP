import assert from "node:assert/strict";
import test from "node:test";
import {
  PROGRESS_BACKUP_FORMAT,
  PROGRESS_CACHE_FORMAT,
  createProgressBackup,
  createProgressCache,
  parseProgressBackup,
  parseProgressCache,
} from "../app/lib/progress-backup.js";

const PROFILE_KEY = "123e4567-e89b-42d3-a456-426614174000";
const ATTEMPT_ID = "123e4567-e89b-42d3-a456-426614174001";
const COMPLETED_AT = Date.parse("2026-08-08T10:00:00.000Z");
const NOW = Date.parse("2026-08-08T10:01:00.000Z");
const ANSWERS = new Map([
  ["aeat-2022-a-001", "A"],
  ["aeat-2022-a-002", "C"],
]);

function fixture() {
  const attempt = {
    id: ATTEMPT_ID,
    completedAt: COMPLETED_AT,
    mode: "standard",
    total: 2,
    correct: 1,
    incorrect: 1,
    blank: 0,
    directScore: 0.75,
    durationMs: 92_345,
    timeLimitMs: 135_000,
  };
  return {
    profileKey: PROFILE_KEY,
    progress: {
      attempts: [attempt],
      questionStats: [
        {
          questionId: "aeat-2022-a-001",
          attempts: 1,
          correctCount: 1,
          incorrectCount: 0,
          blankCount: 0,
          lastSeen: COMPLETED_AT,
          latestStatus: "correct",
        },
        {
          questionId: "aeat-2022-a-002",
          attempts: 1,
          correctCount: 0,
          incorrectCount: 1,
          blankCount: 0,
          lastSeen: COMPLETED_AT,
          latestStatus: "incorrect",
        },
      ],
      summary: {
        totalTests: 1,
        totalQuestions: 2,
        correct: 1,
        incorrect: 1,
        blank: 0,
        directScore: 0.75,
      },
    },
    appliedAttemptIds: [ATTEMPT_ID],
    pendingAttempts: [
      {
        ...attempt,
        items: [
          { questionId: "aeat-2022-a-001", selectedOption: "A", status: "correct" },
          { questionId: "aeat-2022-a-002", selectedOption: "B", status: "incorrect" },
        ],
      },
    ],
  };
}

test("la copia JSON conserva perfil, historial e intentos pendientes", () => {
  const source = fixture();
  const serialized = createProgressBackup({
    ...source,
    exportedAt: "2026-08-08T10:00:30.000Z",
  });
  const parsed = parseProgressBackup(serialized, ANSWERS, NOW);

  assert.equal(parsed.format, PROGRESS_BACKUP_FORMAT);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.profileKey, PROFILE_KEY);
  assert.deepEqual(parsed.progress, source.progress);
  assert.deepEqual(parsed.appliedAttemptIds, source.appliedAttemptIds);
  assert.deepEqual(parsed.pendingAttempts, source.pendingAttempts);
});

test("la caché local es versionada y un valor corrupto no provoca errores", () => {
  const source = fixture();
  const serialized = createProgressCache({
    ...source,
    savedAt: "2026-08-08T10:00:30.000Z",
  });
  const parsed = parseProgressCache(serialized, ANSWERS, NOW);

  assert.equal(parsed.format, PROGRESS_CACHE_FORMAT);
  assert.deepEqual(parsed.progress, source.progress);
  assert.equal(parseProgressCache("{no-es-json", ANSWERS, NOW), null);
});

test("los tiempos se conservan en la copia y en la caché local", () => {
  const source = fixture();
  const backup = parseProgressBackup(createProgressBackup({
    ...source,
    exportedAt: "2026-08-08T10:00:30.000Z",
  }), ANSWERS, NOW);
  const cache = parseProgressCache(createProgressCache({
    ...source,
    savedAt: "2026-08-08T10:00:30.000Z",
  }), ANSWERS, NOW);

  assert.deepEqual(
    [backup.progress.attempts[0].durationMs, backup.progress.attempts[0].timeLimitMs],
    [92_345, 135_000],
  );
  assert.deepEqual(
    [backup.pendingAttempts[0].durationMs, backup.pendingAttempts[0].timeLimitMs],
    [92_345, 135_000],
  );
  assert.deepEqual(
    [cache.progress.attempts[0].durationMs, cache.progress.attempts[0].timeLimitMs],
    [92_345, 135_000],
  );
});

test("acepta copias históricas creadas antes de registrar el tiempo", () => {
  const source = fixture();
  delete source.progress.attempts[0].durationMs;
  delete source.progress.attempts[0].timeLimitMs;
  delete source.pendingAttempts[0].durationMs;
  delete source.pendingAttempts[0].timeLimitMs;

  const parsed = parseProgressBackup(createProgressBackup({
    ...source,
    exportedAt: "2026-08-08T10:00:30.000Z",
  }), ANSWERS, NOW);

  assert.equal(parsed.progress.attempts[0].durationMs ?? null, null);
  assert.equal(parsed.progress.attempts[0].timeLimitMs ?? null, null);
  assert.equal(parsed.pendingAttempts[0].durationMs ?? null, null);
  assert.equal(parsed.pendingAttempts[0].timeLimitMs ?? null, null);
});

test("rechaza tiempos incompletos, negativos, fraccionarios o no proporcionales", () => {
  const serialized = createProgressBackup({
    ...fixture(),
    exportedAt: "2026-08-08T10:00:30.000Z",
  });
  const negativeDuration = JSON.parse(serialized);
  negativeDuration.progress.attempts[0].durationMs = -1;
  assert.throws(
    () => parseProgressBackup(JSON.stringify(negativeDuration), ANSWERS, NOW),
    /durationMs|duración|tiempo empleado/i,
  );

  const fractionalDuration = JSON.parse(serialized);
  fractionalDuration.progress.attempts[0].durationMs = 92_345.5;
  assert.throws(
    () => parseProgressBackup(JSON.stringify(fractionalDuration), ANSWERS, NOW),
    /durationMs|duración|tiempo empleado/i,
  );

  const inconsistentLimit = JSON.parse(serialized);
  inconsistentLimit.pendingAttempts[0].timeLimitMs = 134_999;
  assert.throws(
    () => parseProgressBackup(JSON.stringify(inconsistentLimit), ANSWERS, NOW),
    /timeLimitMs|tiempo máximo|proporcional/i,
  );

  const incompleteTiming = JSON.parse(serialized);
  delete incompleteTiming.progress.attempts[0].timeLimitMs;
  assert.throws(
    () => parseProgressBackup(JSON.stringify(incompleteTiming), ANSWERS, NOW),
    /durationMs|timeLimitMs|tiempo/i,
  );
});

test("se rechazan formatos o versiones que la aplicación no conoce", () => {
  const serialized = createProgressBackup({
    ...fixture(),
    exportedAt: "2026-08-08T10:00:30.000Z",
  });
  const value = JSON.parse(serialized);
  value.version = 2;

  assert.throws(
    () => parseProgressBackup(JSON.stringify(value), ANSWERS, NOW),
    /no es una copia compatible/i,
  );
});

test("se rechazan resúmenes y puntuaciones manipulados", () => {
  const serialized = createProgressBackup({
    ...fixture(),
    exportedAt: "2026-08-08T10:00:30.000Z",
  });
  const value = JSON.parse(serialized);
  value.progress.summary.incorrect = 0;

  assert.throws(
    () => parseProgressBackup(JSON.stringify(value), ANSWERS, NOW),
    /resumen contiene contadores incoherentes/i,
  );
});

test("se rechazan preguntas desconocidas y estados de respuesta falsificados", () => {
  const serialized = createProgressBackup({
    ...fixture(),
    exportedAt: "2026-08-08T10:00:30.000Z",
  });
  const unknownQuestion = JSON.parse(serialized);
  unknownQuestion.progress.questionStats[0].questionId = "aeat-2099-a-001";
  assert.throws(
    () => parseProgressBackup(JSON.stringify(unknownQuestion), ANSWERS, NOW),
    /no pertenece al banco actual/i,
  );

  const falseStatus = JSON.parse(serialized);
  falseStatus.pendingAttempts[0].items[1].status = "correct";
  assert.throws(
    () => parseProgressBackup(JSON.stringify(falseStatus), ANSWERS, NOW),
    /no coincide con la respuesta seleccionada/i,
  );
});

test("cada resultado visible debe figurar entre los UUID ya contabilizados", () => {
  const serialized = createProgressBackup({
    ...fixture(),
    appliedAttemptIds: [],
    exportedAt: "2026-08-08T10:00:30.000Z",
  });

  assert.throws(
    () => parseProgressBackup(serialized, ANSWERS, NOW),
    /no identifica todos los intentos/i,
  );
});
