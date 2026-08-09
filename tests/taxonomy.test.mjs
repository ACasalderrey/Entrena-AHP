import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (relativePath) => JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

const questions = await readJson("../app/data/questions.json");
const taxonomy = await readJson("../app/data/taxonomy.json");
const mapping = await readJson("../app/data/question-taxonomy.json");

test("el catálogo usa identificadores estables y relaciones válidas", () => {
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const areaIds = new Set(taxonomy.areas.map(({ id }) => id));
  const topicIds = new Set(taxonomy.topics.map(({ id }) => id));
  const normIds = new Set(taxonomy.norms.map(({ id }) => id));
  const familyIds = new Set(taxonomy.normGroups.map(({ id }) => id));

  assert.equal(areaIds.size, 3);
  assert.equal(topicIds.size, 32);
  assert.ok(normIds.size >= 20);
  assert.ok(familyIds.size >= 2);
  assert.equal(areaIds.size, taxonomy.areas.length);
  assert.equal(topicIds.size, taxonomy.topics.length);
  assert.equal(normIds.size, taxonomy.norms.length);
  assert.equal(familyIds.size, taxonomy.normGroups.length);

  for (const id of [...areaIds, ...topicIds, ...normIds, ...familyIds]) assert.match(id, kebab);
  for (const topic of taxonomy.topics) assert.ok(areaIds.has(topic.areaId), `Área inexistente en ${topic.id}`);
});

test("las familias son una partición completa y no solapada de las 48 normas", () => {
  const normIds = new Set(taxonomy.norms.map(({ id }) => id));
  const familyNormIds = taxonomy.normGroups.flatMap(({ normIds: ids }) => ids);

  assert.equal(normIds.size, 48);
  assert.ok(taxonomy.normGroups.length >= 2);
  for (const familyId of taxonomy.normGroups.map(({ id }) => id)) {
    assert.ok(!normIds.has(familyId), `El grupo ${familyId} colisiona con una norma individual`);
  }
  assert.equal(new Set(familyNormIds).size, familyNormIds.length, "Una norma aparece en varias familias");
  assert.deepEqual(new Set(familyNormIds), normIds, "Las familias no cubren exactamente el catálogo de normas");

  for (const family of taxonomy.normGroups) {
    const keys = Object.keys(family);
    for (const required of ["id", "label", "normIds"]) assert.ok(keys.includes(required), `Falta ${required} en ${family.id}`);
    for (const key of keys) assert.ok(["id", "label", "shortLabel", "normIds"].includes(key), `Campo inesperado ${key} en ${family.id}`);
    assert.ok(family.label.trim().length > 0);
    if (family.shortLabel !== undefined) assert.ok(family.shortLabel.trim().length > 0);
    assert.ok(family.normIds.length > 0, `Familia vacía: ${family.id}`);
    for (const normId of family.normIds) assert.ok(normIds.has(normId), `Norma inexistente ${normId} en ${family.id}`);
  }

  assert.deepEqual(taxonomy.normGroups.find(({ id }) => id === "normativa-irpf")?.normIds, [
    "ley-35-2006",
    "real-decreto-439-2007",
    "orden-eha-586-2011",
  ]);
  assert.deepEqual(taxonomy.normGroups.find(({ id }) => id === "normativa-tributaria-general-y-procedimientos")?.normIds.slice(0, 3), [
    "ley-58-2003",
    "real-decreto-1065-2007",
    "real-decreto-939-2005",
  ]);
});

test("cada familia recupera al menos cinco preguntas únicas", () => {
  for (const family of taxonomy.normGroups) {
    const familyNormIds = new Set(family.normIds);
    const questionIds = Object.entries(mapping)
      .filter(([, item]) => item.normIds.some((normId) => familyNormIds.has(normId)))
      .map(([questionId]) => questionId);

    assert.equal(new Set(questionIds).size, questionIds.length);
    assert.ok(questionIds.length >= 5, `${family.id} solo recupera ${questionIds.length} preguntas`);
  }
});

test("las 372 preguntas tienen exactamente un tema y al menos una norma", () => {
  const questionIds = questions.map(({ id }) => id);
  const topicIds = new Set(taxonomy.topics.map(({ id }) => id));
  const normIds = new Set(taxonomy.norms.map(({ id }) => id));

  assert.equal(questionIds.length, 372);
  assert.equal(new Set(questionIds).size, questionIds.length);
  assert.equal(Object.keys(mapping).length, questionIds.length);
  assert.deepEqual(new Set(Object.keys(mapping)), new Set(questionIds));

  for (const questionId of questionIds) {
    const item = mapping[questionId];
    assert.deepEqual(Object.keys(item).sort(), ["normIds", "topicId"]);
    assert.equal(typeof item.topicId, "string");
    assert.ok(topicIds.has(item.topicId), `Tema inexistente para ${questionId}`);
    assert.ok(Array.isArray(item.normIds) && item.normIds.length >= 1, `Sin norma para ${questionId}`);
    assert.equal(new Set(item.normIds).size, item.normIds.length, `Normas duplicadas en ${questionId}`);
    for (const normId of item.normIds) assert.ok(normIds.has(normId), `Norma inexistente ${normId} en ${questionId}`);
  }

  const usedNormIds = new Set(Object.values(mapping).flatMap(({ normIds: ids }) => ids));
  assert.deepEqual(usedNormIds, normIds, "Hay normas del catálogo sin preguntas asociadas");
});

test("todas las áreas tienen preguntas recuperables y los temas admiten recuento cero", () => {
  const topicCounts = Object.values(mapping).reduce((counts, item) => {
    counts[item.topicId] = (counts[item.topicId] ?? 0) + 1;
    return counts;
  }, {});
  const areaCounts = taxonomy.topics.reduce((counts, topic) => {
    counts[topic.areaId] = (counts[topic.areaId] ?? 0) + (topicCounts[topic.id] ?? 0);
    return counts;
  }, {});

  for (const area of taxonomy.areas) assert.ok(areaCounts[area.id] > 0, `Área vacía: ${area.id}`);
  for (const topic of taxonomy.topics) assert.ok(Number.isInteger(topicCounts[topic.id] ?? 0));
});

test("la clasificación conserva preguntas con varias fuentes sustantivas", () => {
  const multiNorm = Object.values(mapping).filter(({ normIds }) => normIds.length > 1);
  assert.ok(multiNorm.length >= 10);
  assert.deepEqual(mapping["aeat-2022-a-094"], {
    topicId: "materias-especificas-19",
    normIds: ["ley-37-1992", "real-decreto-ley-20-2022"],
  });
  assert.deepEqual(mapping["aeat-2024-a-026"], {
    topicId: "materias-especificas-12",
    normIds: ["real-decreto-939-2005", "ley-1-2000", "ley-hipotecaria"],
  });
});
