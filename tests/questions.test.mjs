import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateTest } from "../app/lib/scoring.js";


const questions = JSON.parse(
  await readFile(new URL("../app/data/questions.json", import.meta.url), "utf8"),
);

const excluded = {
  2022: [43, 82],
  2023: [20, 24, 25, 30, 42],
  2024: [73],
  2025: [],
};


test("contains exactly the validated non-annulled bank", () => {
  assert.equal(questions.length, 372);
  assert.deepEqual(
    Object.fromEntries(
      [2022, 2023, 2024, 2025].map((year) => [year, questions.filter((question) => question.year === year).length]),
    ),
    { 2022: 98, 2023: 95, 2024: 99, 2025: 80 },
  );

  for (const [year, numbers] of Object.entries(excluded)) {
    for (const number of numbers) {
      assert.equal(
        questions.some((question) => question.year === Number(year) && question.sourceQuestionNumber === number),
        false,
        `La anulada ${year}-${number} no debe estar en el banco`,
      );
    }
  }
});


test("keeps one valid A-D key and four complete options per question", () => {
  const ids = new Set();
  for (const question of questions) {
    assert.equal(ids.has(question.id), false);
    ids.add(question.id);
    assert.deepEqual(Object.keys(question.options), ["A", "B", "C", "D"]);
    assert.equal(question.correctOptions.length, 1);
    assert.ok(["A", "B", "C", "D"].includes(question.correctOptions[0]));
    assert.equal(question.isReserve, false);
  }
});


test("applies the official direct-score formula", () => {
  const sample = questions.slice(0, 4);
  const wrongFor = (question) => ["A", "B", "C", "D"].find((key) => !question.correctOptions.includes(key));
  const answers = {
    [sample[0].id]: sample[0].correctOptions[0],
    [sample[1].id]: wrongFor(sample[1]),
    [sample[3].id]: wrongFor(sample[3]),
  };
  const result = evaluateTest(sample, answers);
  assert.deepEqual(
    { correct: result.correct, incorrect: result.incorrect, blank: result.blank, directScore: result.directScore },
    { correct: 1, incorrect: 2, blank: 1, directScore: 0.5 },
  );
});
