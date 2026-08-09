import assert from "node:assert/strict";
import test from "node:test";
import {
  settingsPatchFrom,
  validatedContentScope,
  validatedStudyDate,
} from "../app/lib/progress-api.js";

const COMPLETED_AT = Date.parse("2026-08-09T23:30:00.000Z");

test("la fecha local admite el desfase real de zona horaria y deriva el legado", () => {
  assert.equal(validatedStudyDate(undefined, COMPLETED_AT), "2026-08-09");
  assert.equal(validatedStudyDate("2026-08-09", COMPLETED_AT), "2026-08-09");
  assert.equal(validatedStudyDate("2026-08-10", COMPLETED_AT), "2026-08-10");
  assert.equal(validatedStudyDate("2026-08-08", COMPLETED_AT), "2026-08-08");
  assert.equal(validatedStudyDate("2026-08-11", COMPLETED_AT), null);
  assert.equal(validatedStudyDate("2026-02-29", COMPLETED_AT), null);
});

test("el ámbito general conserva nulos y tema o norma exigen identificador y etiqueta", () => {
  assert.deepEqual(validatedContentScope({}), {
    contentType: "all",
    contentId: null,
    contentLabel: null,
  });
  assert.deepEqual(
    validatedContentScope({
      contentType: "topic",
      contentId: " materias-especificas-12 ",
      contentLabel: " Tema 12 · Recaudación ",
    }),
    {
      contentType: "topic",
      contentId: "materias-especificas-12",
      contentLabel: "Tema 12 · Recaudación",
    },
  );
  assert.equal(validatedContentScope({ contentType: "all", contentId: "tema-1" }), null);
  assert.equal(validatedContentScope({ contentType: "norm", contentId: "ley-58-2003" }), null);
  assert.equal(
    validatedContentScope({ contentType: "topic", contentId: "tema con espacios", contentLabel: "Tema" }),
    null,
  );
});

test("los ajustes aceptan parches parciales válidos y rechazan valores fuera de contrato", () => {
  assert.deepEqual(settingsPatchFrom({ weeklyGoal: 1 }), { weeklyGoal: 1 });
  assert.deepEqual(settingsPatchFrom({ settings: { weeklyGoal: 7, gamificationEnabled: false } }), {
    weeklyGoal: 7,
    gamificationEnabled: false,
  });
  assert.equal(settingsPatchFrom({}), null);
  assert.equal(settingsPatchFrom({ weeklyGoal: 0 }), null);
  assert.equal(settingsPatchFrom({ weeklyGoal: 4.5 }), null);
  assert.equal(settingsPatchFrom({ gamificationEnabled: 1 }), null);
});
