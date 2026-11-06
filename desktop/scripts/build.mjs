import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true }); mkdirSync(`${root}dist`, { recursive: true });
cpSync(`${root}src`, `${root}dist`, { recursive: true });
cpSync(`${root}../shared`, `${root}dist/shared`, { recursive: true });
