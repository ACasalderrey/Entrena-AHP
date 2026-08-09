import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "app", "data");

const areas = [
  { id: "materias-comunes", label: "Materias comunes" },
  { id: "derecho-administrativo-general", label: "Derecho Administrativo General" },
  { id: "materias-especificas", label: "Materias específicas" },
];

const topics = [
  { id: "materias-comunes-01", areaId: "materias-comunes", label: "Tema 1 · Constitución Española, derechos, Corona y Tribunal Constitucional" },
  { id: "materias-comunes-02", areaId: "materias-comunes", label: "Tema 2 · Cortes Generales, Poder Judicial y organización judicial" },
  { id: "materias-comunes-03", areaId: "materias-comunes", label: "Tema 3 · Gobierno y organización de la Administración Pública" },
  { id: "materias-comunes-04", areaId: "materias-comunes", label: "Tema 4 · Organización territorial e instituciones de la Unión Europea" },
  { id: "materias-comunes-05", areaId: "materias-comunes", label: "Tema 5 · Administración electrónica, transparencia y protección de datos" },
  { id: "materias-comunes-06", areaId: "materias-comunes", label: "Tema 6 · Igualdad, violencia de género, discapacidad y dependencia" },
  { id: "materias-comunes-07", areaId: "materias-comunes", label: "Tema 7 · Empleo público, incompatibilidades y Seguridad Social de funcionarios" },
  { id: "derecho-administrativo-general-01", areaId: "derecho-administrativo-general", label: "Tema 1 · Fuentes del Derecho Administrativo" },
  { id: "derecho-administrativo-general-02", areaId: "derecho-administrativo-general", label: "Tema 2 · Actos administrativos y revisión de oficio" },
  { id: "derecho-administrativo-general-03", areaId: "derecho-administrativo-general", label: "Tema 3 · Procedimiento común, interesados, resolución y plazos" },
  { id: "derecho-administrativo-general-04", areaId: "derecho-administrativo-general", label: "Tema 4 · Fases y ejecución del procedimiento administrativo" },
  { id: "derecho-administrativo-general-05", areaId: "derecho-administrativo-general", label: "Tema 5 · Recursos administrativos y jurisdicción contencioso-administrativa" },
  { id: "materias-especificas-01", areaId: "materias-especificas", label: "Tema 1 · Sistema fiscal y Hacienda estatal, autonómica y local" },
  { id: "materias-especificas-02", areaId: "materias-especificas", label: "Tema 2 · Agencia Estatal de Administración Tributaria" },
  { id: "materias-especificas-03", areaId: "materias-especificas", label: "Tema 3 · Derecho Tributario, tributos y obligación tributaria" },
  { id: "materias-especificas-04", areaId: "materias-especificas", label: "Tema 4 · Obligados tributarios, representación, domicilio y prescripción" },
  { id: "materias-especificas-05", areaId: "materias-especificas", label: "Tema 5 · Información, procedimientos comunes, prueba y notificaciones" },
  { id: "materias-especificas-06", areaId: "materias-especificas", label: "Tema 6 · Declaraciones, autoliquidaciones y pagos a cuenta" },
  { id: "materias-especificas-07", areaId: "materias-especificas", label: "Tema 7 · Gestión tributaria" },
  { id: "materias-especificas-08", areaId: "materias-especificas", label: "Tema 8 · Inspección tributaria" },
  { id: "materias-especificas-09", areaId: "materias-especificas", label: "Tema 9 · Pago, aplazamiento y fraccionamiento" },
  { id: "materias-especificas-10", areaId: "materias-especificas", label: "Tema 10 · Compensación, condonación e insolvencia" },
  { id: "materias-especificas-11", areaId: "materias-especificas", label: "Tema 11 · Recaudación, período ejecutivo y apremio" },
  { id: "materias-especificas-12", areaId: "materias-especificas", label: "Tema 12 · Embargo, enajenación, responsables y sucesores" },
  { id: "materias-especificas-13", areaId: "materias-especificas", label: "Tema 13 · Potestad sancionadora tributaria" },
  { id: "materias-especificas-14", areaId: "materias-especificas", label: "Tema 14 · Revisión tributaria y reclamaciones económico-administrativas" },
  { id: "materias-especificas-15", areaId: "materias-especificas", label: "Tema 15 · IRPF: sujeción y clases de rendimientos y ganancias" },
  { id: "materias-especificas-16", areaId: "materias-especificas", label: "Tema 16 · IRPF: bases, cálculo, tributación familiar y gestión" },
  { id: "materias-especificas-17", areaId: "materias-especificas", label: "Tema 17 · Impuesto sobre Sociedades" },
  { id: "materias-especificas-18", areaId: "materias-especificas", label: "Tema 18 · IVA: hecho imponible, exenciones y lugar de realización" },
  { id: "materias-especificas-19", areaId: "materias-especificas", label: "Tema 19 · IVA: sujetos pasivos, devengo, base, deducciones y devoluciones" },
  { id: "materias-especificas-20", areaId: "materias-especificas", label: "Tema 20 · Aduanas y Código Aduanero de la Unión" },
];

const normDefinitions = [
  ["constitucion-espanola", "Constitución Española", "CE", /Constituci[oó]n Espa[nñ]ola/i],
  ["reglamento-congreso", "Reglamento del Congreso de los Diputados", undefined, /Reglamento del Congreso/i],
  ["ley-organica-2-1979", "Ley Orgánica 2/1979, del Tribunal Constitucional", "LOTC", /Ley Org[aá]nica 2\/1979/i],
  ["ley-organica-6-1985", "Ley Orgánica 6/1985, del Poder Judicial", "LOPJ", /Ley Org[aá]nica 6\/1985/i],
  ["ley-50-1997", "Ley 50/1997, del Gobierno", undefined, /Ley 50\/1997/i],
  ["ley-40-2015", "Ley 40/2015, de Régimen Jurídico del Sector Público", "LRJSP", /Ley 40\/2015/i],
  ["ley-7-1985", "Ley 7/1985, Reguladora de las Bases del Régimen Local", "LRBRL", /Ley 7\/1985/i],
  ["tratado-union-europea", "Tratado de la Unión Europea", "TUE", /Tratado de la Uni[oó]n Europea/i],
  ["tratado-funcionamiento-ue", "Tratado de Funcionamiento de la Unión Europea", "TFUE", /Tratado de Funcionamiento de la Uni[oó]n Europea/i],
  ["protocolo-6-sedes-ue", "Protocolo n.º 6 sobre las sedes de las instituciones de la UE", undefined, /Protocolo n\.?[ºo]\s*6/i],
  ["ley-39-2015", "Ley 39/2015, del Procedimiento Administrativo Común", "LPAC", /Ley 39\/2015/i],
  ["real-decreto-203-2021", "Real Decreto 203/2021, de actuación y funcionamiento electrónico", undefined, /Real Decreto 203\/2021/i],
  ["ley-19-2013", "Ley 19/2013, de transparencia, acceso a la información y buen gobierno", undefined, /Ley 19\/2013/i],
  ["ley-29-1998", "Ley 29/1998, reguladora de la Jurisdicción Contencioso-Administrativa", "LJCA", /Ley 29\/1998/i],
  ["ley-organica-1-2004", "Ley Orgánica 1/2004, de protección integral contra la violencia de género", undefined, /Ley Org[aá]nica 1\/2004/i],
  ["ley-organica-3-2007", "Ley Orgánica 3/2007, para la igualdad efectiva de mujeres y hombres", undefined, /Ley Org[aá]nica 3\/2007/i],
  ["ley-39-2006", "Ley 39/2006, de promoción de la autonomía personal y atención a la dependencia", undefined, /Ley 39\/2006/i],
  ["real-decreto-legislativo-1-2013", "Real Decreto Legislativo 1/2013, Ley General de derechos de las personas con discapacidad", undefined, /Real Decreto Legislativo 1\/2013/i],
  ["real-decreto-legislativo-5-2015", "Real Decreto Legislativo 5/2015, Estatuto Básico del Empleado Público", "TREBEP", /Real Decreto Legislativo 5\/2015/i],
  ["ley-53-1984", "Ley 53/1984, de incompatibilidades del personal al servicio de las Administraciones Públicas", undefined, /Ley 53\/1984/i],
  ["ley-organica-2-2012", "Ley Orgánica 2/2012, de Estabilidad Presupuestaria y Sostenibilidad Financiera", undefined, /Ley Org[aá]nica 2\/2012/i],
  ["ley-5-2020", "Ley 5/2020, del Impuesto sobre las Transacciones Financieras", undefined, /Ley 5\/2020/i],
  ["ley-31-1990", "Ley 31/1990, de Presupuestos Generales del Estado para 1991", undefined, /Ley 31\/1990/i],
  ["resolucion-aeat-13-01-2021", "Resolución de 13 de enero de 2021 de la Presidencia de la AEAT", undefined, /Resoluci[oó]n de 13 de enero de 2021/i],
  ["orden-aeat-02-06-1994", "Orden de 2 de junio de 1994 sobre la estructura de la AEAT", undefined, /Orden de 2 de junio de 1994/i],
  ["orden-pre-3581-2007", "Orden PRE/3581/2007, sobre departamentos de la AEAT", undefined, /Orden PRE\/3581\/2007/i],
  ["real-decreto-1676-2009", "Real Decreto 1676/2009, por el que se regula el Consejo para la Defensa del Contribuyente", undefined, /Real Decreto 1676\/2009/i],
  ["ley-58-2003", "Ley 58/2003, General Tributaria", "LGT", /Ley 58\/2003/i],
  ["real-decreto-1065-2007", "Real Decreto 1065/2007, Reglamento General de gestión e inspección tributaria", "RGAT", /Real Decreto 1065\/2007/i],
  ["real-decreto-939-2005", "Real Decreto 939/2005, Reglamento General de Recaudación", "RGR", /Real Decreto 939\/2005/i],
  ["real-decreto-1619-2012", "Real Decreto 1619/2012, Reglamento de facturación", undefined, /Real Decreto 1619\/2012/i],
  ["orden-eha-586-2011", "Orden EHA/586/2011, modelo 111", undefined, /Orden EHA\/586\/2011/i],
  ["ley-1-2000", "Ley 1/2000, de Enjuiciamiento Civil", "LEC", /Ley 1\/2000/i],
  ["ley-hipotecaria", "Ley Hipotecaria", undefined, /Ley Hipotecaria/i],
  ["ley-35-2006", "Ley 35/2006, del Impuesto sobre la Renta de las Personas Físicas", "LIRPF", /Ley 35\/2006/i],
  ["real-decreto-439-2007", "Real Decreto 439/2007, Reglamento del IRPF", "RIRPF", /Real Decreto 439\/2007/i],
  ["ley-27-2014", "Ley 27/2014, del Impuesto sobre Sociedades", "LIS", /Ley 27\/2014/i],
  ["ley-37-1992", "Ley 37/1992, del Impuesto sobre el Valor Añadido", "LIVA", /Ley 37\/1992/i],
  ["real-decreto-1624-1992", "Real Decreto 1624/1992, Reglamento del IVA", "RIVA", /Real Decreto 1624\/1992/i],
  ["real-decreto-legislativo-5-2004", "Real Decreto Legislativo 5/2004, Ley del Impuesto sobre la Renta de no Residentes", "LIRNR", /Real Decreto Legislativo 5\/2004/i],
  ["ley-38-1992", "Ley 38/1992, de Impuestos Especiales", "LIIEE", /Ley 38\/1992/i],
  ["real-decreto-1165-1995", "Real Decreto 1165/1995, Reglamento de los Impuestos Especiales", "RIIEE", /Real Decreto 1165\/1995/i],
  ["ley-7-2022", "Ley 7/2022, de residuos y suelos contaminados para una economía circular", undefined, /Ley 7\/2022/i],
  ["ley-38-2022", "Ley 38/2022, de gravámenes temporales y solidaridad de las grandes fortunas", undefined, /Ley 38\/2022/i],
  ["ley-22-2009", "Ley 22/2009, de financiación de las Comunidades Autónomas", undefined, /Ley 22\/2009/i],
  ["real-decreto-legislativo-2-2004", "Real Decreto Legislativo 2/2004, Ley Reguladora de las Haciendas Locales", "TRLRHL", /Real Decreto Legislativo 2\/2004/i],
  ["real-decreto-ley-20-2022", "Real Decreto-ley 20/2022", undefined, /Real Decreto-ley 20\/2022/i],
  ["reglamento-ue-952-2013", "Reglamento (UE) 952/2013, Código Aduanero de la Unión", "CAU", /Reglamento \(UE\) 952\/2013/i],
].map(([id, label, shortLabel, pattern]) => ({ id, label, ...(shortLabel ? { shortLabel } : {}), pattern }));

const norms = normDefinitions.map(({ pattern: _pattern, ...norm }) => norm);

// Familias de selección orientadas al estudio. Constituyen una partición de
// las normas: una norma aparece en una sola familia para que los filtros no
// produzcan resultados duplicados o rótulos de alcance ambiguo.
const normGroups = [
  {
    id: "orden-constitucional-y-organizacion-del-estado",
    label: "Orden constitucional y organización del Estado",
    normIds: [
      "constitucion-espanola",
      "reglamento-congreso",
      "ley-organica-2-1979",
      "ley-organica-6-1985",
      "ley-50-1997",
      "ley-7-1985",
    ],
  },
  {
    id: "instituciones-de-la-union-europea",
    label: "Instituciones y ordenamiento de la Unión Europea",
    normIds: [
      "tratado-union-europea",
      "tratado-funcionamiento-ue",
      "protocolo-6-sedes-ue",
    ],
  },
  {
    id: "derecho-administrativo-y-administracion-electronica",
    label: "Derecho administrativo y Administración electrónica",
    normIds: [
      "ley-39-2015",
      "ley-40-2015",
      "real-decreto-203-2021",
      "ley-19-2013",
      "ley-29-1998",
    ],
  },
  {
    id: "igualdad-discapacidad-y-dependencia",
    label: "Igualdad, discapacidad y dependencia",
    normIds: [
      "ley-organica-1-2004",
      "ley-organica-3-2007",
      "ley-39-2006",
      "real-decreto-legislativo-1-2013",
    ],
  },
  {
    id: "empleo-publico",
    label: "Empleo público e incompatibilidades",
    normIds: [
      "real-decreto-legislativo-5-2015",
      "ley-53-1984",
    ],
  },
  {
    id: "organizacion-de-la-aeat",
    label: "Organización de la AEAT y defensa del contribuyente",
    normIds: [
      "ley-31-1990",
      "resolucion-aeat-13-01-2021",
      "orden-aeat-02-06-1994",
      "orden-pre-3581-2007",
      "real-decreto-1676-2009",
    ],
  },
  {
    id: "normativa-tributaria-general-y-procedimientos",
    label: "Normativa tributaria general y procedimientos",
    normIds: [
      "ley-58-2003",
      "real-decreto-1065-2007",
      "real-decreto-939-2005",
      "real-decreto-1619-2012",
      "ley-1-2000",
      "ley-hipotecaria",
    ],
  },
  {
    id: "normativa-irpf",
    label: "Normativa del IRPF",
    normIds: [
      "ley-35-2006",
      "real-decreto-439-2007",
      "orden-eha-586-2011",
    ],
  },
  {
    id: "normativa-impuesto-sociedades",
    label: "Normativa del Impuesto sobre Sociedades",
    normIds: ["ley-27-2014"],
  },
  {
    id: "normativa-iva",
    label: "Normativa del IVA",
    normIds: [
      "ley-37-1992",
      "real-decreto-1624-1992",
      "real-decreto-ley-20-2022",
    ],
  },
  {
    id: "sistema-fiscal-y-otros-tributos",
    label: "Sistema fiscal, Haciendas territoriales y otros tributos",
    normIds: [
      "ley-organica-2-2012",
      "ley-5-2020",
      "real-decreto-legislativo-5-2004",
      "ley-38-1992",
      "real-decreto-1165-1995",
      "ley-7-2022",
      "ley-38-2022",
      "ley-22-2009",
      "real-decreto-legislativo-2-2004",
    ],
  },
  {
    id: "normativa-aduanera",
    label: "Normativa aduanera",
    normIds: ["reglamento-ue-952-2013"],
  },
];

const plain = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const hasAny = (set, ...ids) => ids.some((id) => set.has(id));
const contains = (text, expression) => expression.test(plain(text));

function articleNumbers(reference) {
  const values = [];
  for (const match of reference.matchAll(/art(?:í|i)culos?\s+([0-9][0-9.,ºª\s\-y]*)/gi)) {
    values.push(...(match[1].match(/\d+/g) ?? []).map(Number));
  }
  return values;
}

function detectNormIds(reference) {
  const ids = normDefinitions.filter(({ pattern }) => pattern.test(reference)).map(({ id }) => id);
  return [...new Set(ids)];
}

const manualTopics = {
  // Preguntas cuya norma podría encajar en más de un tema; la asignación sigue
  // el objeto material de la pregunta y no la mera aparición de una cita.
  "aeat-2022-a-031": "materias-especificas-01",
  "aeat-2022-a-032": "materias-especificas-01",
  "aeat-2022-a-051": "materias-especificas-08",
  "aeat-2022-a-055": "materias-especificas-08",
  "aeat-2022-a-060": "materias-especificas-09",
  "aeat-2022-a-075": "materias-especificas-14",
  "aeat-2022-a-077": "materias-especificas-14",
  "aeat-2022-a-044": "materias-especificas-19",
  "aeat-2022-a-086": "materias-especificas-16",
  "aeat-2022-a-094": "materias-especificas-19",
  "aeat-2023-a-028": "materias-especificas-06",
  "aeat-2023-a-075": "materias-especificas-12",
  "aeat-2023-a-064": "materias-especificas-16",
  "aeat-2023-a-087": "materias-especificas-01",
  "aeat-2023-a-096": "materias-especificas-05",
  "aeat-2024-a-002": "materias-especificas-01",
  "aeat-2024-a-015": "materias-especificas-10",
  "aeat-2024-a-018": "materias-especificas-03",
  "aeat-2024-a-024": "materias-especificas-05",
  "aeat-2024-a-026": "materias-especificas-12",
  "aeat-2024-a-032": "materias-especificas-11",
  "aeat-2024-a-035": "materias-especificas-11",
  "aeat-2024-a-046": "materias-especificas-12",
  "aeat-2024-a-061": "materias-especificas-03",
  "aeat-2024-a-071": "materias-especificas-01",
  "aeat-2024-a-098": "materias-especificas-01",
  "aeat-2024-a-001": "materias-especificas-01",
  "aeat-2025-a-002": "materias-especificas-04",
  "aeat-2025-a-020": "materias-especificas-05",
};

function classifyTaxProcedure(text, articles) {
  if (contains(text, /sancion|infraccion|culpabilidad|responsabilidad tributaria por infraccion/)) return "materias-especificas-13";
  if (contains(text, /reclamacion economico|tribunal economico|recurso de reposicion|revision tributaria|revocacion|devolucion de ingresos indebidos|nulidad de pleno derecho/)) return "materias-especificas-14";
  if (contains(text, /embarg|enajen|subasta|adjudic|depositario|licitador|terceria|responsable|sucesor|derivacion de responsabilidad/)) return "materias-especificas-12";
  if (contains(text, /compensacion|condonacion|insolvencia|fallid|credito incobrable|baja provisional|deduccion sobre transferencias/)) return "materias-especificas-10";
  if (contains(text, /providencia de apremio|periodo ejecutivo|recargo ejecutivo|procedimiento de apremio|garantia de la deuda|derecho de prelacion|hipoteca legal tacita/)) return "materias-especificas-11";
  if (contains(text, /plazo.*tramitacion|tramitacion.*plazo/)) return "materias-especificas-05";
  if (contains(text, /aplazamiento|fraccionamiento|imputacion de pagos|consignacion|medio de pago|plazo.*pago|pago de la deuda/)) return "materias-especificas-09";
  if (contains(text, /inspeccion|inspector|acta de conformidad|acta con acuerdo|diligencia.*inspe|medida cautelar|entrada.*domicilio|personacion/)) return "materias-especificas-08";
  if (contains(text, /verificacion de datos|comprobacion limitada|comprobacion de valores|gestion tributaria|rectificacion de autoliquidacion|procedimiento de devolucion|tasacion pericial/)) return "materias-especificas-07";
  if (contains(text, /declaracion tributaria|autoliquidacion|comunicacion de datos|pago a cuenta|retencion|ingreso a cuenta|pago fraccionado|declaracion censal|modelo 111/)) return "materias-especificas-06";
  if (contains(text, /sucesion.*obligacion|capacidad de obrar|representacion|domicilio fiscal|prescripcion|obligacion formal|obligad.*informar|numero de identificacion fiscal|nif|censo|factur|anotacion registral/)) return "materias-especificas-04";
  if (contains(text, /informacion y asistencia|colaboracion social|caracter reservado|reserva.*datos|prueba|notificacion tributaria|obligacion de resolver|liquidacion provisional|liquidacion definitiva|plazo maximo.*procedimiento/)) return "materias-especificas-05";

  const article = articles[0];
  if (article >= 178 && article <= 212) return "materias-especificas-13";
  if (article >= 213) return "materias-especificas-14";
  if (article >= 169 && article <= 177) return "materias-especificas-12";
  if (article >= 160 && article <= 168) return "materias-especificas-11";
  if (article >= 71 && article <= 76) return "materias-especificas-10";
  if (article >= 59 && article <= 65) return "materias-especificas-09";
  if (article >= 141 && article <= 159) return "materias-especificas-08";
  if (article >= 123 && article <= 140) return "materias-especificas-07";
  if (article >= 119 && article <= 122) return "materias-especificas-06";
  if (article >= 77 && article <= 118) return "materias-especificas-05";
  if ((article >= 29 && article <= 48) || (article >= 66 && article <= 70)) return "materias-especificas-04";
  return "materias-especificas-03";
}

function classifyQuestion(question, explanation, normIds) {
  if (manualTopics[question.id]) return manualTopics[question.id];

  // La explicación comenta por qué fallan los distractores y puede mencionar
  // materias accesorias. Para elegir el tema principal se usan el enunciado y
  // la referencia, mientras que las normas sí se extraen de toda la referencia.
  const text = `${question.prompt} ${explanation.reference}`;
  const normSet = new Set(normIds);
  const articles = articleNumbers(explanation.reference);

  if (hasAny(normSet, "reglamento-ue-952-2013")) return "materias-especificas-20";

  if (hasAny(normSet, "ley-37-1992", "real-decreto-1624-1992")) {
    if (contains(text, /sujeto pasivo|inversion del sujeto|repercusion|devengo|base imponible|deduccion|prorrata|bien de inversion|devolucion|tipo impositivo/)) return "materias-especificas-19";
    const article = articles.find((value) => value <= 200);
    return article >= 75 ? "materias-especificas-19" : "materias-especificas-18";
  }

  if (hasAny(normSet, "ley-35-2006", "real-decreto-439-2007", "orden-eha-586-2011")) {
    if (contains(text, /imput.*renta.*inmobiliaria/)) return "materias-especificas-15";
    if (contains(text, /integracion|compensacion|base liquidable|base imponible general|base imponible del ahorro|minimo personal|minimo familiar|cuota|deduccion|tributacion conjunta|obligacion de declarar|gestion del impuesto|retencion|ingreso a cuenta|pago fraccionado|modelo 111/)) return "materias-especificas-16";
    if (contains(text, /devolucion|devolver/)) return "materias-especificas-16";
    const article = articles.find((value) => value <= 150);
    return article >= 44 ? "materias-especificas-16" : "materias-especificas-15";
  }

  if (hasAny(normSet, "ley-27-2014")) return "materias-especificas-17";

  if (hasAny(normSet,
    "real-decreto-legislativo-5-2004", "ley-38-1992", "real-decreto-1165-1995",
    "ley-7-2022", "ley-38-2022", "ley-22-2009", "real-decreto-legislativo-2-2004",
    "ley-5-2020", "ley-organica-2-2012"
  )) return "materias-especificas-01";

  if (hasAny(normSet, "ley-31-1990", "resolucion-aeat-13-01-2021", "orden-aeat-02-06-1994")) return "materias-especificas-02";

  if (hasAny(normSet, "real-decreto-939-2005", "ley-1-2000", "ley-hipotecaria", "orden-pre-3581-2007")) {
    return classifyTaxProcedure(text, articles);
  }

  if (hasAny(normSet, "real-decreto-1065-2007", "real-decreto-1619-2012", "real-decreto-1676-2009", "ley-58-2003")) {
    return classifyTaxProcedure(text, articles);
  }

  if (hasAny(normSet, "ley-organica-1-2004", "ley-organica-3-2007", "ley-39-2006", "real-decreto-legislativo-1-2013")) return "materias-comunes-06";
  if (hasAny(normSet, "real-decreto-legislativo-5-2015", "ley-53-1984")) return "materias-comunes-07";
  if (hasAny(normSet, "ley-19-2013", "real-decreto-203-2021")) return "materias-comunes-05";
  if (hasAny(normSet, "ley-7-1985")) return "materias-comunes-04";
  if (hasAny(normSet, "tratado-union-europea", "tratado-funcionamiento-ue", "protocolo-6-sedes-ue")) return "materias-comunes-04";
  if (hasAny(normSet, "ley-50-1997", "ley-40-2015")) {
    return contains(text, /electron|sede|archivo|interoperab|actuacion administrativa automatizada/) ? "materias-comunes-05" : "materias-comunes-03";
  }

  if (hasAny(normSet, "reglamento-congreso", "ley-organica-6-1985")) return "materias-comunes-02";
  if (hasAny(normSet, "ley-organica-2-1979")) return "materias-comunes-01";

  if (hasAny(normSet, "ley-39-2015", "ley-29-1998")) {
    if (hasAny(normSet, "ley-29-1998") || contains(text, /recurso de alzada|recurso de reposicion|recurso extraordinario|contencioso-administrativ/)) return "derecho-administrativo-general-05";
    if (contains(question.prompt, /registro electronico|archivo electronico|carpeta ciudadana|medios electronicos|notificacion.*electron|firma electronica|sede electronica|relacionarse.*electron/)) return "materias-comunes-05";
    if (contains(question.prompt, /fuentes del derecho|jerarquia normativa|potestad reglamentaria/)) return "derecho-administrativo-general-01";
    const article = articles[0];
    if ((article >= 34 && article <= 52) || (article >= 106 && article <= 111)) return "derecho-administrativo-general-02";
    if (article <= 33 || article === 53) return "derecho-administrativo-general-03";
    if (article >= 112) return "derecho-administrativo-general-05";
    return "derecho-administrativo-general-04";
  }

  if (hasAny(normSet, "constitucion-espanola")) {
    if (contains(text, /tribut|hacienda|presupuest|estabilidad|impuesto/)) return "materias-especificas-01";
    const article = articles[0];
    if ((article >= 66 && article <= 96) || (article >= 108 && article <= 136)) return "materias-comunes-02";
    if (article >= 97 && article <= 107) return "materias-comunes-03";
    if (article >= 137 && article <= 158) return "materias-comunes-04";
    return "materias-comunes-01";
  }

  throw new Error(`No se pudo clasificar ${question.id}: ${explanation.reference}`);
}

const questions = JSON.parse(await readFile(path.join(dataDir, "questions.json"), "utf8"));
const explanations = JSON.parse(await readFile(path.join(dataDir, "explanations.json"), "utf8"));
const taxonomy = { areas, topics, norms, normGroups };
const questionTaxonomy = {};

for (const question of questions) {
  const explanation = explanations[question.id];
  assert(explanation, `Falta explicación para ${question.id}`);
  const normIds = detectNormIds(explanation.reference);
  assert(normIds.length > 0, `No se reconoció ninguna norma para ${question.id}: ${explanation.reference}`);
  questionTaxonomy[question.id] = {
    topicId: classifyQuestion(question, explanation, normIds),
    normIds,
  };
}

await writeFile(path.join(dataDir, "taxonomy.json"), `${JSON.stringify(taxonomy, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "question-taxonomy.json"), `${JSON.stringify(questionTaxonomy, null, 2)}\n`, "utf8");

const byTopic = Object.values(questionTaxonomy).reduce((counts, item) => {
  counts[item.topicId] = (counts[item.topicId] ?? 0) + 1;
  return counts;
}, {});

console.log(`Taxonomía generada: ${questions.length} preguntas, ${topics.length} temas y ${norms.length} normas.`);
console.log(Object.entries(byTopic).sort().map(([id, count]) => `${id}: ${count}`).join("\n"));
