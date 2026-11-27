import { domains, ringFractions } from './domains.js';
import { readPublicSummary } from './public-summary.js';

const section = document.querySelector('.mind');
const element = id => document.getElementById('mind-' + id);
const localEndpoint = new URL('../.local/hina-mind.json', import.meta.url);
const publicEndpoint = new URL('./survival-summary.json', import.meta.url);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const number = new Intl.NumberFormat('ko-KR');
const days = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });
const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'medium' });
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
let previous;
let checking = false;
let selected = domains[0].id;
const evidence = new Map();
const chart = element('chart');
const orbit = chart.parentElement;

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

function svg(name, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function position(radius, angle) {
  return [160 + radius * Math.cos(angle), 160 + radius * Math.sin(angle)];
}

function drawChart() {
  const sector = 2 * Math.PI / domains.length;
  for (const [index, domain] of domains.entries()) {
    const angle = -Math.PI / 2 + index * sector;
    const gap = Math.min(0.05, sector / 5);
    const start = angle - sector / 2 + gap;
    const end = angle + sector / 2 - gap;
    const segment = svg('g', { class: 'mind-segment' });
    const fill = ringFractions(domain, evidence.get(domain.id));
    segment.classList.toggle('selected', domain.id === selected);
    for (const [metric, radius] of [['experience', 120], ['ability', 108]]) {
      const path = `M ${position(radius, start).join(' ')} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${position(radius, end).join(' ')}`;
      segment.append(svg('path', { d: path, class: 'track' }));
      if (fill[metric] > 0) {
        segment.append(svg('path', { d: path, class: metric, pathLength: 1,
          'stroke-dasharray': `${fill[metric]} 1` }));
      }
    }
    const [x, y] = position(141, angle);
    const label = svg('text', { x, y });
    label.textContent = domain.label;
    segment.append(label);
    chart.append(segment);
  }
}

function render() {
  chart.replaceChildren();
  drawChart();
  const domain = domains.find(item => item.id === selected);
  for (const button of element('domains').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.domain === selected));
    button.dataset.connected = String(evidence.has(button.dataset.domain));
  }
  const data = evidence.get(selected);
  element('domain').textContent = domain.label + ' 지능';
  element('source').textContent = data?.sourceLabel ?? '데이터 미연결';
  element('experience').textContent = data
    ? number.format(data.experience) + ' ' + domain.experienceUnit : '미연결';
  element('experience-detail').textContent = data
    ? `${data.experienceContext} · 고정 로그 눈금 · 상한 ${number.format(domain.experienceMax)} ${domain.experienceUnit}`
    : '연결된 경험 집계가 없습니다.';
  element('evaluation').textContent = data?.ability == null
    ? '미검증' : days.format(data.ability) + domain.abilityUnit;
  element('evaluation-detail').textContent = data?.ability == null
    ? '확인된 평가 기록이 없습니다.'
    : `${data.abilityContext} · 고정 눈금 0–${number.format(domain.abilityMax)}${domain.abilityScaleUnit}`;
}

for (const domain of domains) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.domain = domain.id;
  button.textContent = domain.label;
  button.addEventListener('click', () => {
    selected = domain.id;
    render();
  });
  element('domains').append(button);
}
render();

function applySummary(data, source) {
  const { episodes, policyUpdates } = data.survival;
  const evaluation = source === 'local'
    ? data.survival.evaluations.findLast(result => result.kind === 'greedy policy')
    : data.survival.evaluation;
  const saved = source === 'local' ? date.format(new Date(data.savedAt)) : data.savedDay + ' UTC';
  element('connection').textContent = `${source === 'local' ? 'CORE 로컬' : 'CORE 공개 집계'} · 저장 ${saved}`;
  const current = {
    source: source === 'local' ? data.sourceId : 'public-survival',
    sourceLabel: 'CORE 생존 시뮬레이터',
    experience: episodes,
    updates: policyUpdates,
    evaluationKey: evaluation ? JSON.stringify([
      evaluation.episodesTrained, evaluation.runs, evaluation.meanDays, evaluation.timeLimitRuns
    ]) : null,
    ability: evaluation?.meanDays ?? null,
    experienceContext: `정책 업데이트 ${number.format(policyUpdates)}회`,
    abilityContext: evaluation &&
      `탐험 없는 평가 ${number.format(evaluation.runs)}회 · ${number.format(evaluation.episodesTrained)} 에피소드 시점 · 제한 도달 ${number.format(evaluation.timeLimitRuns)}회`,
  };
  if (previous && JSON.stringify(previous) === JSON.stringify(current)) return;
  evidence.set('survival', current);
  render();

  const change = element('change');
  const sameSeries = previous?.source === current.source &&
    episodes >= previous.experience && policyUpdates >= previous.updates;
  change.hidden = true;
  if (sameSeries) {
    const changes = [];
    if (episodes > previous.experience) changes.push(`에피소드 +${number.format(episodes - previous.experience)}`);
    if (policyUpdates > previous.updates) changes.push(`정책 업데이트 +${number.format(policyUpdates - previous.updates)}`);
    if (current.evaluationKey && current.evaluationKey !== previous.evaluationKey) changes.push('평가 기록 갱신');
    if (changes.length) {
      change.textContent = '생존 새 기록 · ' + changes.join(' · ');
      change.hidden = false;
      orbit.classList.remove('has-growth');
      void orbit.offsetWidth;
      orbit.classList.add('has-growth');
    }
  }
  previous = current;
}

function request(url) {
  return fetch(url, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(5000) });
}

async function refresh() {
  if (checking || document.hidden) return;
  checking = true;
  try {
    if (local) {
      const response = await request(localEndpoint);
      if (response.ok) {
        applySummary(readSnapshot(await response.json()), 'local');
        return;
      }
      if (response.status !== 404 || (previous && previous.source !== 'public-survival')) {
        throw new Error('Local CORE snapshot unavailable');
      }
    }
    const response = await request(publicEndpoint);
    if (!response.ok) throw new Error('Public CORE summary unavailable');
    applySummary(readPublicSummary(await response.json()), 'public');
  } catch {
    element('connection').textContent = previous
      ? 'CORE 연결 끊김 · 마지막 확인 기록 표시'
      : 'CORE 미연결 · 학습 기록 없음';
  } finally {
    checking = false;
  }
}

refresh();
setInterval(refresh, local ? 5000 : 60000);
document.addEventListener('visibilitychange', refresh);
