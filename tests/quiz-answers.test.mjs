import assert from "node:assert/strict";
import test from "node:test";
import { toggleAnswerSelection } from "../app/lib/quiz-answers.js";

test("seleccionar una opción en una pregunta en blanco guarda la respuesta", () => {
  assert.deepEqual(toggleAnswerSelection({}, "q-1", "A"), { "q-1": "A" });
});

test("pulsar de nuevo la opción seleccionada deja la pregunta en blanco", () => {
  const result = toggleAnswerSelection({ "q-1": "A" }, "q-1", "A");

  assert.deepEqual(result, {});
  assert.equal(Object.hasOwn(result, "q-1"), false);
});

test("pulsar otra opción sustituye la respuesta anterior", () => {
  assert.deepEqual(
    toggleAnswerSelection({ "q-1": "A" }, "q-1", "B"),
    { "q-1": "B" },
  );
});

test("el cambio es inmutable y conserva las respuestas de las demás preguntas", () => {
  const source = Object.freeze({ "q-1": "A", "q-2": "C" });
  const result = toggleAnswerSelection(source, "q-1", "A");

  assert.notStrictEqual(result, source);
  assert.deepEqual(source, { "q-1": "A", "q-2": "C" });
  assert.deepEqual(result, { "q-2": "C" });
});
