#!/usr/bin/env node
/**
 * vendor/ 完整性检查（零依赖、零网络）。
 *
 * 本插件把每个 @deepseek-ai/* 依赖钉在 vendor/ 的本地 tarball 上，
 * 好处是离线也能 `npm install`；代价是 package.json 里写错文件名、
 * 或者 tgz 被误删时，报错会出现在 `npm install` 的中段且很难看懂。
 *
 * 这个脚本在装包之前就能把问题指出来：
 *   - package.json 里引用的每个 file:vendor/*.tgz 都存在且非空；
 *   - vendor/ 里没有未被引用的孤儿 tgz（提示可清理，不算失败）。
 *
 * 用法：node scripts/check-vendor.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

/** package.json 里所有 file:vendor/... 引用（deps + overrides）。 */
const referenced = new Set();
for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const spec of Object.values(pkg[section] ?? {})) {
    if (typeof spec === 'string' && spec.startsWith('file:vendor/')) referenced.add(spec.slice('file:'.length));
  }
}
for (const spec of Object.values(pkg.pnpm?.overrides ?? {})) {
  if (typeof spec === 'string' && spec.startsWith('file:vendor/')) referenced.add(spec.slice('file:'.length));
}

const problems = [];
for (const relative of [...referenced].sort()) {
  const absolute = path.join(root, relative);
  try {
    const info = statSync(absolute);
    if (!info.isFile()) problems.push(`${relative}: 不是文件`);
    else if (info.size === 0) problems.push(`${relative}: 文件为空`);
  } catch {
    problems.push(`${relative}: 不存在（package.json 引用了它）`);
  }
}

let orphans = [];
try {
  orphans = readdirSync(path.join(root, 'vendor'))
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => `vendor/${name}`)
    .filter((relative) => !referenced.has(relative));
} catch {
  if (referenced.size > 0) problems.push('vendor/ 目录不存在');
}

if (problems.length > 0) {
  console.error('vendor 检查失败：');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

console.log(`vendor 检查通过：${referenced.size} 个引用全部存在`);
if (orphans.length > 0) {
  console.log(`提示：vendor/ 里有 ${orphans.length} 个未被 package.json 引用的 tgz（可清理）：`);
  for (const orphan of orphans.slice(0, 10)) console.log('  - ' + orphan);
  if (orphans.length > 10) console.log(`  …还有 ${orphans.length - 10} 个`);
}
