// Refresh the packaged app's static files from a fresh build.
// `build:server` already writes package-build/app/server.mjs in place; this
// copies the built web bundle and seed data alongside it. node/, node_modules/,
// the launcher .bats and the icon are stable and left untouched.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgWeb = join(root, 'package-build', 'web');

rmSync(pkgWeb, { recursive: true, force: true });
cpSync(join(root, 'web', 'dist'), pkgWeb, { recursive: true });
cpSync(join(root, 'data', 'seed.json'), join(root, 'package-build', 'data', 'seed.json'));
// Ship the changelog with the app (installed as CHANGELOG.txt beside README.txt).
cpSync(join(root, 'CHANGELOG.md'), join(root, 'package-build', 'CHANGELOG.txt'));

console.log('Packaged web/, seed.json and CHANGELOG refreshed.');
