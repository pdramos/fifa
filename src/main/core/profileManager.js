'use strict';

/**
 * Optimization profiles — curated sets of optimization ids, plus support for
 * user-defined custom profiles saved to disk.
 *
 * Built-in profiles are intentionally conservative-to-aggressive but ALL of
 * them only include reversible, ban-safe tweaks from the catalog.
 */

const fs = require('fs');
const path = require('path');
const { catalog } = require('../optimizations/catalog');
const { paths } = require('./paths');
const logger = require('./logger');

const ALL_IDS = catalog.map((o) => o.id);
const DEFAULT_IDS = catalog.filter((o) => o.default).map((o) => o.id);
const SAFE_IDS = catalog.filter((o) => o.default && !o.caution && o.impact !== 'high').map((o) => o.id);

const BUILTIN = [
  {
    id: 'balanced',
    name: 'Equilibrado (Recomendado)',
    description:
      'O melhor equilíbrio entre desempenho e estabilidade. Apenas ajustes seguros e recomendados. Ideal para a maioria dos jogadores.',
    icon: '⚖️',
    ids: DEFAULT_IDS,
  },
  {
    id: 'safe',
    name: 'Seguro',
    description:
      'O conjunto mais conservador — ajustes de baixo impacto e reversíveis. Perfeito para um primeiro teste.',
    icon: '🛡️',
    ids: SAFE_IDS,
  },
  {
    id: 'performance',
    name: 'Desempenho Máximo',
    description:
      'Ativa todos os ajustes recomendados de desempenho, incluindo os de maior impacto. Bom para ganhar FPS e fluidez.',
    icon: '🚀',
    ids: catalog.filter((o) => o.default || o.impact === 'high').map((o) => o.id),
  },
  {
    id: 'competitive',
    name: 'Competitivo (Online)',
    description:
      'Focado em latência de input e estabilidade de rede para Ultimate Team e jogo online. Inclui ajustes de rede e prioridade.',
    icon: '🎯',
    ids: catalog
      .filter((o) => ['network', 'system'].includes(o.category) || o.default)
      .map((o) => o.id),
  },
  {
    id: 'everything',
    name: 'Tudo (Avançado)',
    description:
      'Aplica TODAS as otimizações disponíveis, incluindo as marcadas com cuidado. Recomendado apenas para utilizadores avançados. Tudo continua reversível.',
    icon: '🔧',
    ids: ALL_IDS,
  },
];

function customProfilesFile() {
  return path.join(paths.profiles(), 'custom-profiles.json');
}

function loadCustom() {
  try {
    return JSON.parse(fs.readFileSync(customProfilesFile(), 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveCustom(list) {
  fs.writeFileSync(customProfilesFile(), JSON.stringify(list, null, 2));
}

function all() {
  return [...BUILTIN, ...loadCustom().map((p) => ({ ...p, custom: true }))];
}

function get(id) {
  return all().find((p) => p.id === id) || null;
}

function saveCustomProfile({ name, description, ids }) {
  const list = loadCustom();
  const id = 'custom_' + Date.now();
  const validIds = ids.filter((i) => ALL_IDS.includes(i));
  const profile = { id, name: name || 'Perfil personalizado', description: description || '', ids: validIds, icon: '⭐' };
  list.push(profile);
  saveCustom(list);
  logger.success(`Perfil personalizado guardado: ${profile.name}`);
  return profile;
}

function deleteCustomProfile(id) {
  const list = loadCustom().filter((p) => p.id !== id);
  saveCustom(list);
  return true;
}

module.exports = { all, get, saveCustomProfile, deleteCustomProfile, BUILTIN };
