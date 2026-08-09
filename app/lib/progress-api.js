const STUDY_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/i;
const MAX_CONTENT_LABEL_LENGTH = 160;
const ONE_DAY_MS = 86_400_000;

function derivedStudyDate(completedAt) {
  return new Date(completedAt).toISOString().slice(0, 10);
}

/**
 * Conserva el día civil que envía el navegador. Una diferencia de un día con
 * respecto a UTC es legítima en los extremos de zona horaria.
 *
 * @param {unknown} value
 * @param {number} completedAt
 * @returns {string | null}
 */
export function validatedStudyDate(value, completedAt) {
  if (value === undefined || value === null) return derivedStudyDate(completedAt);
  if (typeof value !== "string" || !STUDY_DATE.test(value)) return null;

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return null;

  const completedDay = Date.parse(`${derivedStudyDate(completedAt)}T00:00:00.000Z`);
  return Math.abs(parsed - completedDay) <= ONE_DAY_MS ? value : null;
}

/**
 * @param {{contentType?: unknown, contentId?: unknown, contentLabel?: unknown}} value
 * @returns {{contentType: "all" | "topic" | "norm", contentId: string | null, contentLabel: string | null} | null}
 */
export function validatedContentScope(value) {
  const contentType = value.contentType === undefined ? "all" : value.contentType;
  if (contentType !== "all" && contentType !== "topic" && contentType !== "norm") return null;

  if (contentType === "all") {
    if (
      (value.contentId !== undefined && value.contentId !== null) ||
      (value.contentLabel !== undefined && value.contentLabel !== null)
    ) {
      return null;
    }
    return { contentType, contentId: null, contentLabel: null };
  }

  if (typeof value.contentId !== "string" || typeof value.contentLabel !== "string") return null;
  const contentId = value.contentId.trim();
  const contentLabel = value.contentLabel.trim();
  if (
    !CONTENT_ID.test(contentId) ||
    contentLabel.length < 1 ||
    contentLabel.length > MAX_CONTENT_LABEL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(contentLabel)
  ) {
    return null;
  }
  return { contentType, contentId, contentLabel };
}

/**
 * Resolves a user-provided scope against the bundled taxonomy and replaces its
 * display text with the canonical label. Individual norms remain valid when
 * norm families are introduced.
 *
 * @param {{contentType?: unknown, contentId?: unknown, contentLabel?: unknown}} value
 * @param {{
 *   topics?: Array<{id: string, label: string}>,
 *   norms?: Array<{id: string, label: string}>,
 *   normGroups?: Array<{id: string, label: string, normIds: string[]}>
 * }} taxonomy
 * @returns {{contentType: "all" | "topic" | "norm", contentId: string | null, contentLabel: string | null} | null}
 */
export function canonicalContentScope(value, taxonomy) {
  const scope = validatedContentScope(value);
  if (!scope || scope.contentType === "all") return scope;

  const entries = scope.contentType === "topic"
    ? (taxonomy.topics ?? [])
    : [...(taxonomy.normGroups ?? []), ...(taxonomy.norms ?? [])];
  const canonical = entries.find((entry) => entry.id === scope.contentId);
  if (!canonical || typeof canonical.label !== "string" || canonical.label.length < 1) return null;

  return { ...scope, contentLabel: canonical.label };
}

/**
 * @param {{contentType: "all" | "topic" | "norm", contentId: string | null}} scope
 * @param {{topicId?: string, normIds?: string[]} | undefined} classification
 * @param {Array<{id: string, normIds: string[]}>} normGroups
 * @returns {boolean}
 */
export function questionMatchesContentScope(scope, classification, normGroups = []) {
  if (scope.contentType === "all") return true;
  if (!classification || !scope.contentId) return false;
  if (scope.contentType === "topic") return classification.topicId === scope.contentId;
  if (!Array.isArray(classification.normIds)) return false;

  const group = normGroups.find((entry) => entry.id === scope.contentId);
  const allowedNormIds = new Set(group?.normIds ?? [scope.contentId]);
  return classification.normIds.some((normId) => allowedNormIds.has(normId));
}

/**
 * @param {unknown} value
 * @returns {{weeklyGoal?: number, gamificationEnabled?: boolean} | null}
 */
export function settingsPatchFrom(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = /** @type {Record<string, unknown>} */ (value);
  const candidate = outer.settings === undefined ? outer : outer.settings;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const settings = /** @type {Record<string, unknown>} */ (candidate);
  const hasWeeklyGoal = Object.prototype.hasOwnProperty.call(settings, "weeklyGoal");
  const hasGamification = Object.prototype.hasOwnProperty.call(settings, "gamificationEnabled");
  if (!hasWeeklyGoal && !hasGamification) return null;
  if (
    hasWeeklyGoal &&
    (!Number.isInteger(settings.weeklyGoal) || Number(settings.weeklyGoal) < 1 || Number(settings.weeklyGoal) > 7)
  ) {
    return null;
  }
  if (hasGamification && typeof settings.gamificationEnabled !== "boolean") return null;

  return {
    ...(hasWeeklyGoal ? { weeklyGoal: Number(settings.weeklyGoal) } : {}),
    ...(hasGamification ? { gamificationEnabled: /** @type {boolean} */ (settings.gamificationEnabled) } : {}),
  };
}
