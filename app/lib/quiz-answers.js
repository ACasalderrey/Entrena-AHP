/**
 * Toggles one answer without mutating the previous answer map. Selecting the
 * currently selected option removes the key, which represents a blank answer.
 *
 * @template {string} T
 * @param {Record<string, T>} answers
 * @param {string} questionId
 * @param {T} option
 * @returns {Record<string, T>}
 */
export function toggleAnswerSelection(answers, questionId, option) {
  const next = { ...answers };
  if (next[questionId] === option) delete next[questionId];
  else next[questionId] = option;
  return next;
}
