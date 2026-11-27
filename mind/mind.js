const section = document.querySelector('.mind');
const element = id => document.getElementById('mind-' + id);
const endpoint = new URL('../.local/hina-mind.json', import.meta.url);
const number = new Intl.NumberFormat('ko-KR');
const days = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });
const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'medium' });
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
let previous;
let checking = false;

function readSnapshot(data) {
  const survival = data?.survival;
  if (data?.schemaVersion !== 1 || data.environment !== 'core-survival-simulator' ||
      typeof data.sourceId !== 'string' || !/^[a-f0-9]{64}$/.test(data.sourceId) ||
      !timestamp(data.savedAt) || !count(survival?.episodes) || !count(survival.policyUpdates) ||
      !Array.isArray(survival.evaluations) || survival.evaluations.length > 20 ||
      !survival.evaluations.every(result => result &&
        ['random baseline', 'greedy policy'].includes(result.kind) &&
        count(result.episodesTrained) && result.episodesTrained <= survival.episodes &&
        count(result.runs) && result.runs > 0 && count(result.timeLimitRuns) &&
        result.timeLimitRuns <= result.runs && Number.isFinite(result.meanDays) &&
        result.meanDays >= 0 && timestamp(result.evaluatedAt))) {
    throw new Error('Invalid CORE snapshot');
  }
  return data;
}

function setRing(id, value, scale) {
  element(id).style.setProperty('--progress', (value / scale) + 'turn');
}

function render(data) {
  const { episodes, policyUpdates, evaluations } = data.survival;
  const latestEvaluation = evaluations.findLast(result => result.kind === 'greedy policy');
  const experienceScale = Math.max(100, Math.ceil(episodes / 100) * 100);
  const evaluationScale = Math.max(10, Math.ceil((latestEvaluation?.meanDays ?? 0) / 10) * 10);
  setRing('experience-ring', episodes, experienceScale);
  setRing('evaluation-ring', latestEvaluation?.meanDays ?? 0, evaluationScale);
  element('experience').textContent = number.format(episodes) + ' 에피소드';
  element('experience-detail').textContent =
    `정책 업데이트 ${number.format(policyUpdates)}회 · 한 바퀴 ${number.format(experienceScale)} 에피소드`;
  element('evaluation').textContent = latestEvaluation
    ? days.format(latestEvaluation.meanDays) + '일 평균 생존'
    : '미검증';
  element('evaluation-detail').textContent = latestEvaluation
    ? `탐험 없는 평가 ${number.format(latestEvaluation.runs)}회 · ${number.format(latestEvaluation.episodesTrained)} 에피소드 시점 · 제한 도달 ${number.format(latestEvaluation.timeLimitRuns)}회 · 한 바퀴 ${number.format(evaluationScale)}일`
    : '저장된 정책 평가가 없습니다.';
  element('connection').textContent = `CORE 연결 · 저장 ${date.format(new Date(data.savedAt))}`;

  const change = element('change');
  if (!previous || previous.sourceId !== data.sourceId || episodes < previous.survival.episodes ||
      policyUpdates < previous.survival.policyUpdates) {
    change.hidden = true;
    section.querySelector('.mind-orbit').classList.remove('has-growth');
  } else {
    const added = episodes - previous.survival.episodes;
    const updated = policyUpdates - previous.survival.policyUpdates;
    const evaluationChanged = JSON.stringify(evaluations) !== JSON.stringify(previous.survival.evaluations);
    if (added || updated || evaluationChanged) {
      const changes = [];
      if (added) changes.push(`에피소드 +${number.format(added)}`);
      if (updated) changes.push(`정책 업데이트 +${number.format(updated)}`);
      if (evaluationChanged) changes.push('평가 기록 갱신');
      change.textContent = '새 기록 · ' + changes.join(' · ');
      change.hidden = false;
      const orbit = section.querySelector('.mind-orbit');
      orbit.classList.remove('has-growth');
      void orbit.offsetWidth;
      orbit.classList.add('has-growth');
    }
  }
  previous = data;
}

async function refresh() {
  if (checking || document.hidden) return;
  checking = true;
  try {
    const response = await fetch(endpoint, {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('CORE snapshot unavailable');
    render(readSnapshot(await response.json()));
  } catch {
    element('connection').textContent = previous
      ? 'CORE 연결 끊김 · 마지막 확인 기록 표시'
      : 'CORE 미연결 · 학습 기록 없음';
  } finally {
    checking = false;
  }
}

// Public Pages contains only the UI. Local previews can read a CORE export on the same origin.
if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  refresh();
  setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', refresh);
} else {
  element('connection').textContent = 'CORE 미연결 · 로컬 데이터 연결 필요';
}
