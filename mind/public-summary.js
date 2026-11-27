// Shared by the browser and the deployment validator. The public file accepts no
// arbitrary metadata, local paths, identifiers, history, or precise timestamps.
const count = value => Number.isSafeInteger(value) && value >= 0;

function hasKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function readPublicSummary(data) {
  if (!hasKeys(data, ['schemaVersion', 'environment', 'savedDay', 'survival']) ||
      data.schemaVersion !== 1 || data.environment !== 'core-survival-simulator' ||
      typeof data.savedDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.savedDay) ||
      !Number.isFinite(Date.parse(data.savedDay)) ||
      new Date(data.savedDay).toISOString().slice(0, 10) !== data.savedDay ||
      !hasKeys(data.survival, ['episodes', 'policyUpdates', 'evaluation'])) {
    throw new Error('Invalid public CORE summary');
  }
  const { episodes, policyUpdates, evaluation } = data.survival;
  if (!count(episodes) || !count(policyUpdates) || (evaluation !== null &&
      (!hasKeys(evaluation, ['episodesTrained', 'runs', 'meanDays', 'timeLimitRuns']) ||
        !count(evaluation.episodesTrained) || evaluation.episodesTrained > episodes ||
        !count(evaluation.runs) || !evaluation.runs ||
        !count(evaluation.timeLimitRuns) || evaluation.timeLimitRuns > evaluation.runs ||
        !Number.isFinite(evaluation.meanDays) || evaluation.meanDays < 0))) {
    throw new Error('Invalid public survival aggregates');
  }
  return data;
}
