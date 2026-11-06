export const REPOSITORY = 'wnalstlr777/AI-Studio';
export const RUNS_API = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/sea-qa.yml/runs?per_page=30&branch=main`;
export const messages = { IDLE: '', WALK: '', REST: '', WORK: '검수 중이에요!', SUCCESS: '사장님! 검수 통과예요!', ALERT: '사장님! 문제가 생겼어요!', CONNECTION_ERROR: '상태를 확인할 수 없어요.' };
export function runKey(run) { return `${run.id}:${run.run_attempt || 1}:${run.conclusion || run.status}`; }
export function runUrl(run) {
  const url = String(run?.html_url || '');
  return /^https:\/\/github\.com\/wnalstlr777\/AI-Studio\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/.test(url) ? url : null;
}
export function classify(run) {
  if (!run) return 'IDLE';
  if (['in_progress', 'queued', 'waiting', 'pending', 'requested'].includes(run.status)) return 'WORK';
  if (run.status !== 'completed') return 'IDLE';
  if (run.conclusion === 'success') return 'SUCCESS';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return 'ALERT';
  return 'IDLE'; // cancelled, skipped, neutral are not QA failures
}
export function snapshot(runs) {
  const sorted = [...runs].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id-a.id);
  const active = sorted.find(r => classify(r) === 'WORK');
  const run = active || sorted[0] || null;
  return { state: classify(run), run, message: messages[classify(run)] };
}
// Persist keys before presenting events. First successful query establishes a quiet baseline.
// A rerun has a distinct attempt; terminal transitions during WORK are detected.
export class EventLedger {
  constructor(saved = {}) { this.ready = !!saved.ready; this.seen = new Set(saved.seen || []); this.floor = saved.floor || 0; }
  accept(runs) {
    const terminal = runs.filter(r => ['SUCCESS', 'ALERT'].includes(classify(r)));
    const events = this.ready ? terminal.filter(r => Date.parse(r.created_at) >= this.floor && !this.seen.has(runKey(r))) : [];
    if (!this.ready) this.floor = Math.min(...runs.map(r => Date.parse(r.created_at)), Date.now());
    for (const r of terminal) this.seen.add(runKey(r));
    this.ready = true;
    return events.sort((a,b) => (classify(a)==='ALERT' ? -1 : 1) - (classify(b)==='ALERT' ? -1 : 1) || b.id-a.id);
  }
  save() { return { ready: this.ready, floor: this.floor, seen: [...this.seen] }; }
}
export class QAPoller {
  constructor({ onResult, onError, fetcher = (...args) => globalThis.fetch(...args), interval = 120000 }) {
    Object.assign(this, { onResult, onError, fetcher, interval }); this.delay = interval; this.stopped = true; this.notBefore = 0;
  }
  start() { this.stopped = false; return this.poll(); }
  stop() { this.stopped = true; clearTimeout(this.timer); this.controller?.abort(); }
  async poll() {
    if (this.stopped || this.busy || Date.now() < this.notBefore) return;
    clearTimeout(this.timer); this.busy = true; this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller.abort(), 15000);
    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (this.etag) headers['If-None-Match'] = this.etag;
      const response = await this.fetcher(RUNS_API, { headers, signal: this.controller.signal });
      if (response.status === 304) { if (this.cached) await this.onResult(this.cached); }
      else {
        if (!response.ok) {
          const retry = response.headers.get('retry-after');
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          if ([403,429].includes(response.status)) this.notBefore = Math.max(Date.now()+Math.max(60000,Number(retry||0)*1000),reset||0);
          throw new Error(`GitHub HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data.workflow_runs) || data.workflow_runs.some(r => !Number.isSafeInteger(r.id) || !r.status || !Number.isFinite(Date.parse(r.created_at)) || !runUrl(r))) throw new Error('올바르지 않은 QA 응답');
        this.cached = data.workflow_runs; this.etag = response.headers.get('etag');
        await this.onResult(this.cached);
      }
      this.delay = this.interval;
    } catch (error) {
      if (!this.stopped) { this.delay = Math.min(Math.max(this.delay*2, this.interval), 1800000); this.onError(error); }
    } finally {
      clearTimeout(timeout); this.busy = false;
      if (!this.stopped) this.timer = setTimeout(() => this.poll(), Math.max(this.delay,this.notBefore-Date.now()));
    }
  }
}
