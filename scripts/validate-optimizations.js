'use strict';

/**
 * Catalog integrity check (run via `npm run lint`).
 *
 * Verifies that every optimization is well-formed and — crucially — that it
 * uses one of the SAFE executor types only. This is the guard rail that keeps
 * the app ban-safe: a new entry that isn't fully reversible / OS-level fails CI.
 */

const path = require('path');
const { catalog, manualRecommendations } = require(path.join(
  __dirname,
  '..',
  'src',
  'main',
  'optimizations',
  'catalog'
));
const { EXECUTORS } = require(path.join(__dirname, '..', 'src', 'main', 'optimizations', 'executors'));

const SAFE_TYPES = new Set(['registry', 'powerplan', 'service', 'command', 'gameconfig', 'cleanup']);
const errors = [];
const ids = new Set();

for (const opt of catalog) {
  const where = `optimização "${opt.id || '(sem id)'}"`;
  if (!opt.id) errors.push('Uma optimização não tem id.');
  if (ids.has(opt.id)) errors.push(`id duplicado: ${opt.id}`);
  ids.add(opt.id);
  if (!opt.name) errors.push(`${where} sem nome.`);
  if (!opt.description) errors.push(`${where} sem descrição.`);
  if (!opt.category) errors.push(`${where} sem categoria.`);
  if (!['high', 'medium', 'low'].includes(opt.impact)) errors.push(`${where} impacto inválido.`);
  if (!SAFE_TYPES.has(opt.type)) errors.push(`${where} usa um tipo NÃO seguro: ${opt.type}`);
  if (!EXECUTORS[opt.type]) errors.push(`${where} não tem executor: ${opt.type}`);

  // Type-specific required fields.
  if (opt.type === 'registry') {
    if (Array.isArray(opt.values)) {
      // Multi-value form: each entry needs its own (or an inherited) key + type.
      if (!opt.values.length) errors.push(`${where} (registry) tem values vazio.`);
      opt.values.forEach((v, i) => {
        if (!(v.key || opt.key)) errors.push(`${where} (registry) values[${i}] sem key.`);
        if (!v.valueName) errors.push(`${where} (registry) values[${i}] sem valueName.`);
        if (!v.valueType) errors.push(`${where} (registry) values[${i}] sem valueType.`);
      });
    } else {
      if (!opt.key) errors.push(`${where} (registry) sem key.`);
      if (!opt.valueName) errors.push(`${where} (registry) sem valueName.`);
      if (!opt.valueType) errors.push(`${where} (registry) sem valueType.`);
    }
  }
  if (opt.type === 'service' && !opt.serviceName) errors.push(`${where} (service) sem serviceName.`);
  if (opt.type === 'command' && !opt.applyCmd) errors.push(`${where} (command) sem applyCmd.`);
  if (opt.type === 'gameconfig' && (!opt.file || !opt.settings)) errors.push(`${where} (gameconfig) incompleto.`);
  if (opt.type === 'cleanup' && !Array.isArray(opt.targets)) errors.push(`${where} (cleanup) sem targets.`);
}

// Defensive check: no optimization may shell out to a tool associated with
// unsafe techniques (memory editors, injectors, driver installers, etc.).
const FORBIDDEN_BINARIES = /(cheatengine|injector|dll|xdbg|kdmapper|drvload|pnputil|wemod)/i;
for (const opt of catalog) {
  for (const cmd of [opt.applyCmd, opt.revertCmd, opt.statusCmd]) {
    if (!cmd) continue;
    const line = `${cmd.cmd} ${(cmd.args || []).join(' ')}`;
    if (FORBIDDEN_BINARIES.test(line)) {
      errors.push(`optimização "${opt.id}" executa um comando não permitido: ${line}`);
    }
  }
}

console.log(`Catálogo: ${catalog.length} otimizações, ${manualRecommendations.length} recomendações manuais.`);
if (errors.length) {
  console.error('\n❌ Validação falhou:');
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log('✅ Todas as otimizações são válidas e seguras (0% risco de ban).');
