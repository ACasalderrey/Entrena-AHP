export const OFFICIAL_SCORING = Object.freeze({
  correct: 1,
  incorrect: -0.25,
  blank: 0,
});

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
    items,
  };
}
