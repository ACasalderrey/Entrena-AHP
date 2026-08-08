export const OFFICIAL_SCORING = Object.freeze({
  correct: 1,
  incorrect: -0.25,
  blank: 0,
});

export const OFFICIAL_TEST_TIMING = Object.freeze({
  questions: 80,
  durationMinutes: 90,
});

const MILLISECONDS_PER_MINUTE = 60_000;

export function proportionalScoreOutOfTen(directScore, total) {
  if (!Number.isFinite(directScore) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(10, (directScore / total) * 10));
}

export function timeLimitMillisecondsFor(questionCount) {
  if (!Number.isFinite(questionCount) || questionCount <= 0) return 0;
  return Math.round(
    questionCount
      * OFFICIAL_TEST_TIMING.durationMinutes
      * MILLISECONDS_PER_MINUTE
      / OFFICIAL_TEST_TIMING.questions,
  );
}

export function timeLimitSecondsFor(questionCount) {
  return timeLimitMillisecondsFor(questionCount) / 1_000;
}

export function formatDuration(seconds) {
  const rounded = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainingSeconds = rounded % 60;
  const clock = [minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
  return hours ? `${hours}:${clock}` : clock;
}

export function evaluateTest(questions, answers) {
  let correct = 0;
  let incorrect = 0;
  let blank = 0;

  const items = questions.map((question) => {
    const selectedOption = answers[question.id] ?? null;
    let status = "blank";

    if (selectedOption === null) {
      blank += 1;
    } else if (question.correctOptions.includes(selectedOption)) {
      correct += 1;
      status = "correct";
    } else {
      incorrect += 1;
      status = "incorrect";
    }

    return { question, selectedOption, status };
  });

  const directScore = correct * OFFICIAL_SCORING.correct + incorrect * OFFICIAL_SCORING.incorrect;
  return {
    total: questions.length,
    correct,
    incorrect,
    blank,
    directScore,
    scoreOutOfTen: proportionalScoreOutOfTen(directScore, questions.length),
    items,
  };
}
