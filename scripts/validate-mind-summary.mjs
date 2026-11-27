import { readFileSync } from 'node:fs';
import { readPublicSummary } from '../mind/public-summary.js';

const path = process.argv[2] ?? new URL('../mind/survival-summary.json', import.meta.url);
const bytes = readFileSync(path);
if (bytes.length > 4096) throw new Error('Public CORE summary exceeds 4 KiB');
readPublicSummary(JSON.parse(bytes));
console.log('PASS public HINA MIND field and range checks');
