import { appRoot } from '../ota/location.js';
import { readMarket, routeItems } from './market-data.js';

const status = document.getElementById('wow-market-status');
const results = document.getElementById('wow-market-results');
const date = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
});
function gold(copper) {
  const units = [[10000, '골드'], [100, '실버'], [1, '코퍼']];
  return units.map(([factor, label]) => {
    const value = Math.floor(copper / factor);
    copper %= factor;
    return value ? value.toLocaleString('ko-KR') + ' ' + label : '';
  }).filter(Boolean).join(' ');
}

async function showMarket() {
  try {
    const response = await fetch(new URL('games/wow-daily.json', appRoot(import.meta.url)), {
      credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Market unavailable');
    const market = readMarket(await response.json());
    if (market.status === 'unconnected') {
      status.textContent = '한국 호드 시세 미연결 · 루트만 표시 중';
      return;
    }
    const stale = Date.now() - Date.parse(market.observedAt) > 36 * 60 * 60 * 1000;
    const offline = response.headers.get('X-Hina-Offline') === '1';
    status.textContent = `한국 호드 #${market.houseId} · 관측 ${date.format(new Date(market.observedAt))} KST` +
      (offline || stale ? ' · 이전 시세 · 구매 전 게임에서 재확인' : '');
    const quotes = new Map(market.routePrices?.map(item => [item.id, item.buy]));
    for (const route of document.querySelectorAll('[data-wow-items]')) {
      const prices = route.dataset.wowItems.split(',').map(Number)
        .filter(id => quotes.has(id))
        .map(id => routeItems[id] + ' ' + gold(quotes.get(id)));
      if (prices.length) {
        const line = route.querySelector('.wow-route-prices');
        line.textContent = '개당 등록 최저가 · ' + prices.join(' / ');
        line.hidden = false;
      }
    }
    if (!market.picks.length) {
      results.textContent = '현재 매물에서 기준을 충족한 후보가 없습니다.';
      return;
    }
    const list = document.createElement('ol');
    for (const item of market.picks) {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      const profit = document.createElement('span');
      const prices = document.createElement('small');
      name.textContent = item.name;
      profit.textContent = '+' + gold(item.estimatedProfit) + ' 예상';
      prices.textContent = `개당 최저가 ${gold(item.buy)} · 기준가 ${gold(item.reference)} · 최저가 재고 ${item.quantity}개`;
      row.append(name, profit, prices);
      list.append(row);
    }
    results.replaceChildren(list);
  } catch {
    status.textContent = '경매장 시세를 불러오지 못했어요.';
  }
}
showMarket();
