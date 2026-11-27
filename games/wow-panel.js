import { appRoot } from '../ota/location.js';
import { farmItems, readMarket } from './market-data.js';

const status = document.getElementById('wow-market-status');
const date = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
});

function gold(copper) {
  const units = [[10000, '골드'], [100, '실버'], [1, '코퍼']];
  return units.map(([factor, label]) => {
    const value = Math.floor(copper / factor);
    copper %= factor;
    return value ? value.toLocaleString('ko-KR') + ' ' + label : '';
  }).filter(Boolean).join(' ') || '0 코퍼';
}

function renderPicks(id, choices, empty) {
  const target = document.getElementById(id);
  if (!choices.length) {
    target.textContent = empty;
    return;
  }
  const list = document.createElement('ol');
  for (const [name, description] of choices.slice(0, 2)) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const details = document.createElement('small');
    title.textContent = name;
    details.textContent = description;
    item.append(title, details);
    list.append(item);
  }
  target.replaceChildren(list);
}

async function showMarket() {
  try {
    const response = await fetch(new URL('games/wow-daily.json', appRoot(import.meta.url)), {
      credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Market unavailable');
    const market = readMarket(await response.json());
    if (market.status === 'unconnected') {
      status.textContent = '한국 호드 시세 미연결 · 오늘의 추천을 계산할 수 없어요.';
      return;
    }
    const stale = Date.now() - Date.parse(market.observedAt) > 36 * 60 * 60 * 1000;
    const offline = response.headers.get('X-Hina-Offline') === '1';
    status.textContent = `한국 호드 #${market.houseId} · 관측 ${date.format(new Date(market.observedAt))} KST` +
      (offline || stale ? ' · 이전 시세 · 구매 전 게임에서 재확인' : '');
    renderPicks('wow-farm', (market.farm ?? []).map(item => [
      farmItems[item.id] + ' 모아 팔기', `개당 수령액 약 ${gold(item.net)} · 현재 최저 등록가 기준`,
    ]), '시세가 확인된 파밍 재료가 없습니다.');
    renderPicks('wow-craft', (market.craft ?? []).map(item => [
      item.name + ' 제작', `1회 ${item.quantity}개 · 재료비 ${gold(item.cost)} · 예상 차익 +${gold(item.profit)}`,
    ]), market.recipesChecked
      ? '확인한 제작법에서 차익 후보가 없습니다.' : '현재 제작법을 검증할 수 없습니다.');
    renderPicks('wow-market-results', market.picks.map(item => [
      item.name + ' 사서 되팔기',
      `개당 매입 ${gold(item.buy)} · 예상 차익 +${gold(item.estimatedProfit)} · 최저가 ${item.quantity}개`,
    ]), '재판매 기준을 충족한 매물이 없습니다.');
  } catch {
    status.textContent = '경매장 시세를 불러오지 못했어요.';
  }
}
showMarket();
