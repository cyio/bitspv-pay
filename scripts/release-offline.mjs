import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = pkg.version;
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();

const srcPath = 'dist-offline/index.offline.html';
const destName = `bitspv-pay-offline-v${version}-${gitHash}.html`;
const destPath = `dist-offline/${destName}`;

const content = readFileSync(srcPath);
const hash = createHash('sha256').update(content).digest('hex');

renameSync(srcPath, destPath);
writeFileSync(`dist-offline/${destName}.sha256`, `${hash}  ${destName}\n`);

console.log(`\n✓ ${destPath}`);
console.log(`SHA256: ${hash}\n`);
console.log(`Verify: shasum -a 256 -c dist-offline/${destName}.sha256`);
