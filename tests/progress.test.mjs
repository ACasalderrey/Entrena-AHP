import assert from "node:assert/strict";
import test from "node:test";
import {
  ANSWER_VALUES_PER_ROW,
  D1_ANSWER_CHUNK_SIZE,
  D1_MAX_BOUND_PARAMETERS,
} from "../app/lib/progress.js";

test("cada inserción por lotes respeta el límite de parámetros de D1", () => {
  assert.equal(D1_ANSWER_CHUNK_SIZE, 16);
  assert.ok(D1_ANSWER_CHUNK_SIZE * ANSWER_VALUES_PER_ROW <= D1_MAX_BOUND_PARAMETERS);
  assert.ok((D1_ANSWER_CHUNK_SIZE + 1) * ANSWER_VALUES_PER_ROW > D1_MAX_BOUND_PARAMETERS);
});
