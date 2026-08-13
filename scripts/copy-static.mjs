/**
 * Copy the UI's static assets into dist/.
 *
 * tsc only emits JavaScript, so the HTML/CSS/JS the browser loads has to be
 * copied separately or the container ships an API with no front end.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'web', 'public');
const to = join(root, 'dist', 'web', 'public');

if (!existsSync(from)) {
    console.error(`copy-static: source missing: ${from}`);
    process.exit(1);
}

mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`copy-static: ${from} -> ${to}`);
