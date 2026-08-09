import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalContentScope,
  questionMatchesContentScope,
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

test("el ámbito normativo admite grupos y normas históricas con la etiqueta canónica", () => {
  const taxonomy = {
    topics: [{ id: "tema-1", label: "Tema canónico" }],
    norms: [{ id: "ley-58-2003", label: "Ley 58/2003, General Tributaria" }],
    normGroups: [{
      id: "normativa-tributaria-general-y-procedimientos",
      label: "Normativa tributaria general y procedimientos",
      normIds: ["ley-58-2003", "real-decreto-1065-2007"],
    }],
  };

  assert.deepEqual(canonicalContentScope({
    contentType: "norm",
    contentId: "normativa-tributaria-general-y-procedimientos",
    contentLabel: "Etiqueta enviada por el cliente",
  }, taxonomy), {
    contentType: "norm",
    contentId: "normativa-tributaria-general-y-procedimientos",
    contentLabel: "Normativa tributaria general y procedimientos",
  });
  assert.deepEqual(canonicalContentScope({
    contentType: "norm",
    contentId: "ley-58-2003",
    contentLabel: "LGT",
  }, taxonomy), {
    contentType: "norm",
    contentId: "ley-58-2003",
    contentLabel: "Ley 58/2003, General Tributaria",
  });
  assert.equal(canonicalContentScope({
    contentType: "norm",
    contentId: "norma-desconocida",
    contentLabel: "Desconocida",
  }, taxonomy), null);
});

test("una pregunta pertenece a un grupo normativo si coincide cualquiera de sus normas", () => {
  const normGroups = [{
    id: "normativa-tributaria-general-y-procedimientos",
    normIds: ["ley-58-2003", "real-decreto-1065-2007"],
  }];
  const groupScope = {
    contentType: "norm",
    contentId: "normativa-tributaria-general-y-procedimientos",
    contentLabel: "Normativa tributaria general y procedimientos",
  };
  const legacyNormScope = {
    contentType: "norm",
    contentId: "ley-58-2003",
    contentLabel: "Ley 58/2003, General Tributaria",
  };

  assert.equal(questionMatchesContentScope(groupScope, {
    topicId: "tema-1",
    normIds: ["otra-norma", "real-decreto-1065-2007"],
  }, normGroups), true);
  assert.equal(questionMatchesContentScope(groupScope, {
    topicId: "tema-1",
    normIds: ["otra-norma"],
  }, normGroups), false);
  assert.equal(questionMatchesContentScope(legacyNormScope, {
    topicId: "tema-1",
    normIds: ["ley-58-2003"],
  }, normGroups), true);
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
