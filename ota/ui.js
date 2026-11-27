import { appRoot } from './location.js';

const root = appRoot(import.meta.url);
document.getElementById('hina-pwa-manifest').href = new URL('app.webmanifest', root).href;
const panel = document.getElementById('hina-ota');
const field = name => document.getElementById('ota-' + name);
const status = text => { field('status').textContent = text; };
const match = location.pathname.match(/\/__hina_release\/(stable|development)\//);
let channel = match?.[1] || 'stable';
let registration;
let busy = false;
let lastHealthy;

const home = value => new URL(value === 'development' ? '?channel=development' : './', root).href;
const short = value => value?.slice(0, 10) ?? '—';

function command(type, manual = false) {
  const target = navigator.serviceWorker.controller || registration?.active;
  if (!target) return Promise.reject(new Error('Update worker unavailable'));
  return new Promise((resolve, reject) => {
    const port = new MessageChannel();
    const timeout = setTimeout(() => finish(reject, new Error('Update check timed out')), 180000);
    function finish(callback, value) {
      clearTimeout(timeout);
      port.port1.close();
      callback(value);
    }
    port.port1.onmessage = ({ data }) => {
      if (data.status === 'downloading') {
        field('progress').hidden = false;
        field('progress').max = data.total;
        field('progress').value = data.completed;
        status(`백그라운드 준비 ${data.completed}/${data.total} · 새 다운로드 ${data.fetched}개`);
      } else if (data.status === 'ready') {
        finish(resolve, data.value);
      } else if (data.status === 'error') {
        finish(reject, new Error(data.message));
      }
    };
    target.postMessage({ type, channel, manual }, [port.port2]);
  });
}

function display(value) {
  lastHealthy = value;
  field('versions').textContent = `실행기 프로토콜 ${value.protocol} · 콘텐츠 ${short(value.active?.content)} · 기능 ${short(value.active?.modules)} · 지능 정의 ${short(value.active?.intelligence)} · 데이터 스키마 ${value.active?.dataSchema ?? '—'}`;
  field('apply').hidden = !value.pending && !(value.active && value.channel !== (match?.[1] || 'stable'));
  field('rollback').hidden = !value.canRollback;
  field('briefing').hidden = !value.pending;
  field('briefing').textContent = value.pending ? `히나 브리핑 · ${value.note}` : '';
  if (value.pending) {
    window.dispatchEvent(new CustomEvent('hina:news', { detail: {
      id: 'ota-' + value.channel + '-' + value.pending.content,
    } }));
  }
  field('history-empty').hidden = value.history.length > 0;
  field('history').replaceChildren(...value.history.map(item => {
    const row = document.createElement('li');
    const actions = { activation: '적용', rollback: '복원', recovery: '자동 복구' };
    row.textContent = `${new Date(item.at).toLocaleString('ko-KR')} · ${actions[item.kind]} · ${short(item.versions.content)}`;
    return row;
  }));
  status(value.pending ? '검증 완료 · 적용할 준비가 됐어요' :
    !value.signed ? '초기 설치본 사용 중 · OTA 서명 키 설정 대기' :
    value.retryAt ? '최근에 확인했어요 · 잠시 후 다시 확인할 수 있어요' : '현재 채널 확인 완료');
}

async function refresh(manual = false) {
  if (busy || !registration) return;
  busy = true;
  field('channel').disabled = true;
  field('check').disabled = true;
  try {
    display(await command('check', manual));
  } catch {
    status(lastHealthy?.pending ? '확인 실패 · 준비된 버전을 계속 사용할 수 있어요' :
      '업데이트 확인 실패 · 현재 버전을 유지합니다');
  } finally {
    field('progress').hidden = true;
    field('channel').disabled = false;
    field('check').disabled = false;
    busy = false;
  }
}

async function start() {
  if (!('serviceWorker' in navigator)) return status('이 브라우저에서는 PWA 업데이트를 지원하지 않습니다');
  try {
    await navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname, type: 'module' });
    registration = await navigator.serviceWorker.ready;
    field('channel').value = channel;
    navigator.serviceWorker.addEventListener('controllerchange', () => refresh());
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 30 * 60 * 1000);
  } catch {
    status('브라우저 설치 캐시를 준비하지 못했습니다');
  }
}

field('channel').addEventListener('change', event => {
  channel = event.target.value;
  lastHealthy = undefined;
  field('apply').hidden = field('rollback').hidden = field('briefing').hidden = true;
  refresh();
});
field('check').addEventListener('click', () => refresh(true));
field('apply').addEventListener('click', () => location.assign(home(channel)));
field('rollback').addEventListener('click', async () => {
  try {
    await command('rollback');
    location.assign(home(channel));
  } catch {
    status('이전 버전 복구에 실패했습니다');
  }
});
if (panel) start();
