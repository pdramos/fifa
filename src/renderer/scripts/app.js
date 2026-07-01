'use strict';

/* FC 26 Optimizer — renderer logic. Talks to the main process only through the
   whitelisted `window.fc26` bridge exposed by preload.js. */

const api = window.fc26;

const state = {
  analyzed: false,
  list: [], // optimization metadata
  status: {}, // id -> status
  categories: {},
  selected: new Set(),
  manual: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ───────────────────────── Toasts ───────────────────────── */
function toast(title, body, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast__title"></div><div class="toast__body"></div>`;
  el.querySelector('.toast__title').textContent = title;
  el.querySelector('.toast__body').textContent = body || '';
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

/* ───────────────────────── Navigation ───────────────────────── */
$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const view = btn.dataset.view;
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
    if (view === 'backups') loadBackups();
    if (view === 'profiles') loadProfiles();
  });
});

/* ───────────────────────── Window controls ───────────────────────── */
$('#btn-min').addEventListener('click', () => api.minimize());
$('#btn-max').addEventListener('click', () => api.maximize());
$('#btn-close').addEventListener('click', () => api.close());

/* ───────────────────────── Progress ───────────────────────── */
api.onProgress((p) => {
  const wrap = $('#progress-wrap');
  if (p.phase === 'done') {
    $('#progress-fill').style.width = '100%';
    setTimeout(() => (wrap.hidden = true), 700);
    return;
  }
  wrap.hidden = false;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-count').textContent = `${p.done} / ${p.total}`;
  const verb = p.phase === 'revert' ? 'A reverter' : 'A aplicar';
  $('#progress-label').textContent = p.current ? `${verb}: ${p.current}` : `${verb}…`;
});

/* ───────────────────────── Logs ───────────────────────── */
function appendLog(entry) {
  const box = $('#logbox');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const line = document.createElement('div');
  line.className = `logline ${entry.level}`;
  const t = new Date(entry.ts).toLocaleTimeString();
  line.innerHTML = `<span class="t">[${t}]</span> <span class="l">${entry.level.toUpperCase()}</span> `;
  line.appendChild(document.createTextNode(entry.message));
  box.appendChild(line);
  if (atBottom) box.scrollTop = box.scrollHeight;
  while (box.childElementCount > 1000) box.removeChild(box.firstChild);
}
api.onLog(appendLog);
$('#btn-clear-logs').addEventListener('click', () => ($('#logbox').innerHTML = ''));
$('#btn-open-logs').addEventListener('click', () => api.openLogsFolder());

/* ───────────────────────── App info ───────────────────────── */
async function loadAppInfo() {
  const res = await api.appInfo();
  if (!res.ok) return;
  const info = res.data;
  $('#app-version').textContent = 'v' + info.version;
  $('#about-version').textContent = info.version;
  const pill = $('#admin-pill');
  if (info.platform !== 'win32') {
    pill.textContent = '⚠ Modo dev (não-Windows)';
    pill.className = 'admin-pill no-admin';
  } else if (info.isAdmin) {
    pill.textContent = '✓ Administrador';
    pill.className = 'admin-pill is-admin';
  } else {
    pill.textContent = '⚠ Sem admin (alguns ajustes)';
    pill.className = 'admin-pill no-admin';
  }
}

/* ───────────────────────── Analyze ───────────────────────── */
$('#btn-analyze').addEventListener('click', analyze);
$('#btn-quick-optimize').addEventListener('click', () => quickOptimize());
$('#btn-quick-revert').addEventListener('click', () => revertAll());

async function analyze() {
  const btn = $('#btn-analyze');
  btn.disabled = true;
  btn.textContent = '⏳ A analisar…';
  const res = await api.analyze();
  btn.disabled = false;
  btn.textContent = '🔄 Analisar novamente';
  if (!res.ok) {
    toast('Erro na análise', res.error, 'error');
    return;
  }
  const d = res.data;
  state.analyzed = true;
  state.list = d.list;
  state.categories = d.categories;
  state.manual = d.manual;
  state.status = {};
  d.status.forEach((s) => (state.status[s.id] = s));

  renderGameCard(d.game);
  renderSystemCard(d.system);
  renderOptimizations();
  renderManual();
  updateSummary();

  $('#analysis-empty').hidden = true;
  $('#analysis-detail').hidden = false;
  $('#summary-bar').hidden = false;

  if (!d.game.found) {
    toast('Jogo não detetado', 'Não foi encontrada a instalação do FC 26. As otimizações de sistema continuam disponíveis.', 'warn');
  } else {
    toast('Análise concluída', `FC 26 detetado via ${d.game.launcher || 'sistema'}.`);
  }
}

function renderGameCard(game) {
  const kv = $('#game-kv');
  const found = game.found;
  kv.innerHTML = '';
  addKv(kv, 'Estado', found ? 'Detetado' : 'Não encontrado', found ? 'ok' : 'bad');
  addKv(kv, 'Launcher', game.launcher || '—');
  addKv(kv, 'Pasta', game.installDir || '—');
  addKv(kv, 'Executável', game.processName || '—');
  addKv(kv, 'Config (fcsetup)', game.settingsDir || 'não encontrada', game.settingsDir ? 'ok' : '');
}

function renderSystemCard(sys) {
  const kv = $('#system-kv');
  kv.innerHTML = '';
  addKv(kv, 'Sistema', sys.windowsEdition || sys.osType || '—');
  addKv(kv, 'CPU', sys.cpuModel);
  addKv(kv, 'Núcleos', String(sys.cpuCores));
  addKv(kv, 'RAM', `${sys.totalMemGB} GB`);
  addKv(kv, 'GPU', sys.gpu || '—');
  if (sys.gpuDriver) addKv(kv, 'Driver GPU', sys.gpuDriver);
  addKv(kv, 'Plano de energia', sys.powerPlan || '—');
}

function addKv(dl, k, v, cls = '') {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  if (cls) dd.className = cls;
  dl.append(dt, dd);
}

/* ───────────────────────── Optimizations render ───────────────────────── */
function renderOptimizations() {
  const container = $('#opt-groups');
  container.innerHTML = '';
  const applicable = state.list.filter((o) => o.applicable);
  if (!applicable.length) {
    container.innerHTML = '<p class="muted center">Nenhuma otimização aplicável foi encontrada.</p>';
    return;
  }
  // Pre-select recommended defaults that aren't yet applied.
  applicable.forEach((o) => {
    const st = state.status[o.id] || {};
    if (o.default && !o.caution && !st.applied) state.selected.add(o.id);
  });

  const groups = {};
  applicable.forEach((o) => {
    (groups[o.category] = groups[o.category] || []).push(o);
  });

  Object.entries(groups).forEach(([cat, opts]) => {
    const group = document.createElement('div');
    group.className = 'opt-group';
    const label = state.categories[cat] || cat;
    group.innerHTML = `<div class="opt-group__head"><h3>${label}</h3><span class="opt-group__count">${opts.length}</span></div>`;
    opts.forEach((o) => group.appendChild(renderOptRow(o)));
    container.appendChild(group);
  });
}

function renderOptRow(o) {
  const st = state.status[o.id] || {};
  const applied = st.applied;
  const row = document.createElement('div');
  row.className = 'opt' + (applied ? ' is-applied' : '');
  row.dataset.id = o.id;

  const tags = [];
  tags.push(`<span class="tag tag--${o.impact}">${impactLabel(o.impact)}</span>`);
  if (applied) tags.push('<span class="tag tag--applied">✓ Aplicada</span>');
  if (o.caution) tags.push('<span class="tag tag--caution">Cuidado</span>');
  if (o.reboot) tags.push('<span class="tag tag--reboot">Requer reinício</span>');
  if (o.needsAdmin) tags.push('<span class="tag tag--admin">Admin</span>');

  const checked = state.selected.has(o.id) ? 'checked' : '';

  row.innerHTML = `
    <div class="opt__main">
      <div class="opt__name">${o.name} ${tags.join(' ')}</div>
      <div class="opt__desc">${o.description}</div>
    </div>
    <div class="opt__side">
      <label class="switch" title="Selecionar">
        <input type="checkbox" data-id="${o.id}" ${checked} ${o.stateless ? 'disabled' : ''} />
        <span class="switch__slider"></span>
      </label>
    </div>`;

  const cb = row.querySelector('input');
  cb.addEventListener('change', () => {
    if (cb.checked) state.selected.add(o.id);
    else state.selected.delete(o.id);
  });
  return row;
}

function impactLabel(i) {
  return { high: 'Alto impacto', medium: 'Médio', low: 'Baixo' }[i] || i;
}

function renderManual() {
  const box = $('#manual-list');
  box.innerHTML = '';
  if (!state.manual.length) {
    box.innerHTML = '<p class="muted">Executa a análise para ver recomendações adaptadas ao teu hardware.</p>';
    return;
  }
  state.manual.forEach((rec) => {
    const el = document.createElement('div');
    el.className = 'manual';
    const steps = rec.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    el.innerHTML = `<h3>${escapeHtml(rec.name)}</h3><ul>${steps}</ul>`;
    box.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ───────────────────────── Summary ───────────────────────── */
function updateSummary() {
  const applicable = state.list.filter((o) => o.applicable);
  const applied = applicable.filter((o) => (state.status[o.id] || {}).applied);
  const recommended = applicable.filter((o) => o.default && !o.caution);
  $('#stat-available').textContent = applicable.length;
  $('#stat-applied').textContent = applied.length;
  $('#stat-recommended').textContent = recommended.length;
}

/* ───────────────────────── Apply / revert ───────────────────────── */
async function applyIds(ids, label) {
  if (!ids.length) {
    toast('Nada selecionado', 'Escolhe pelo menos uma otimização.', 'warn');
    return;
  }
  const res = await api.applyMany(ids, label);
  if (!res.ok) {
    toast('Erro', res.error, 'error');
    return;
  }
  const failed = (res.data.outcomes || []).filter((o) => o.error);
  if (failed.length) {
    toast('Concluído com avisos', `${ids.length - failed.length} aplicadas, ${failed.length} com erro (ver logs).`, 'warn');
  } else {
    toast('Otimizações aplicadas', `${ids.length} otimizações aplicadas com sucesso.`);
  }
  if (res.data.rebootNeeded) {
    toast('Reinício recomendado', 'Algumas otimizações só têm efeito após reiniciar o Windows.', 'warn');
  }
  await refreshStatus();
}

$('#btn-apply-selected').addEventListener('click', () => applyIds([...state.selected], 'Seleção manual'));
$('#btn-select-recommended').addEventListener('click', () => {
  state.selected = new Set(
    state.list.filter((o) => o.applicable && o.default && !o.caution).map((o) => o.id)
  );
  renderOptimizations();
});
$('#btn-select-none').addEventListener('click', () => {
  state.selected.clear();
  renderOptimizations();
});

function quickOptimize() {
  const ids = state.list
    .filter((o) => o.applicable && o.default && !o.caution && !(state.status[o.id] || {}).applied)
    .map((o) => o.id);
  applyIds(ids, 'Otimização rápida (recomendadas)');
}

async function revertAll() {
  const res = await api.revertAll();
  if (!res.ok) return toast('Erro', res.error, 'error');
  toast('Revertido', `${res.data.reverted} otimizações revertidas ao estado original.`);
  await refreshStatus();
}

async function refreshStatus() {
  const res = await api.status();
  if (!res.ok) return;
  state.status = {};
  res.data.forEach((s) => (state.status[s.id] = s));
  renderOptimizations();
  updateSummary();
}

/* ───────────────────────── Profiles ───────────────────────── */
async function loadProfiles() {
  const res = await api.listProfiles();
  if (!res.ok) return;
  const grid = $('#profile-grid');
  grid.innerHTML = '';
  res.data.profiles.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'profile';
    el.innerHTML = `
      <div class="profile__ic">${p.icon || '⚙️'}</div>
      <div class="profile__name">${escapeHtml(p.name)}</div>
      <div class="profile__desc">${escapeHtml(p.description || '')}</div>
      <div class="profile__meta">${p.ids.length} otimizações${p.custom ? ' · personalizado' : ''}</div>
      <div class="profile__actions">
        <button class="btn btn--primary" data-apply="${p.id}">Aplicar</button>
        ${p.custom ? `<button class="btn btn--danger" data-del="${p.id}">Eliminar</button>` : ''}
      </div>`;
    grid.appendChild(el);
  });

  grid.querySelectorAll('[data-apply]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!state.analyzed) {
        toast('Analisa primeiro', 'Executa a análise antes de aplicar um perfil.', 'warn');
        return;
      }
      const r = await api.applyProfile(b.dataset.apply);
      if (!r.ok) return toast('Erro', r.error, 'error');
      toast('Perfil aplicado', 'As otimizações do perfil foram aplicadas.');
      if (r.data.rebootNeeded) toast('Reinício recomendado', 'Alguns ajustes precisam de reinício.', 'warn');
      await refreshStatus();
    })
  );
  grid.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api.deleteProfile(b.dataset.del);
      loadProfiles();
    })
  );
}

$('#btn-save-profile').addEventListener('click', async () => {
  const name = $('#custom-name').value.trim();
  if (!name) return toast('Nome em falta', 'Dá um nome ao perfil.', 'warn');
  if (!state.selected.size) return toast('Seleção vazia', 'Seleciona otimizações no separador Otimizações.', 'warn');
  const r = await api.saveProfile({ name, ids: [...state.selected] });
  if (!r.ok) return toast('Erro', r.error, 'error');
  $('#custom-name').value = '';
  toast('Perfil guardado', `"${name}" criado com ${state.selected.size} otimizações.`);
  loadProfiles();
});

/* ───────────────────────── Backups ───────────────────────── */
async function loadBackups() {
  const res = await api.listBackups();
  if (!res.ok) return;
  const box = $('#backups-list');
  box.innerHTML = '';
  if (!res.data.length) {
    box.innerHTML = '<p class="muted">Ainda não há pontos de restauro. São criados automaticamente antes de cada otimização.</p>';
    return;
  }
  res.data.forEach((rp) => {
    const el = document.createElement('div');
    el.className = 'backup';
    el.innerHTML = `
      <div class="backup__ic">💾</div>
      <div class="backup__main">
        <div class="backup__label">${escapeHtml(rp.label)}</div>
        <div class="backup__meta">${new Date(rp.createdAt).toLocaleString()} · ${rp.count} otimizações</div>
      </div>
      <div class="backup__actions">
        <button class="btn btn--primary" data-restore="${rp.id}">Restaurar</button>
        <button class="btn btn--danger" data-del="${rp.id}">Eliminar</button>
      </div>`;
    box.appendChild(el);
  });

  box.querySelectorAll('[data-restore]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = await api.restoreBackup(b.dataset.restore);
      if (!r.ok) return toast('Erro', r.error, 'error');
      toast('Restaurado', 'O estado foi restaurado a partir do ponto selecionado.');
      await refreshStatus();
    })
  );
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api.deleteBackup(b.dataset.del);
      loadBackups();
    })
  );
}

$('#btn-create-backup').addEventListener('click', async () => {
  const r = await api.createBackup('Ponto manual');
  if (!r.ok) return toast('Erro', r.error, 'error');
  toast('Backup criado', 'Ponto de restauro guardado.');
  loadBackups();
});

/* ───────────────────────── Updates ───────────────────────── */
$('#btn-check-update').addEventListener('click', async () => {
  $('#update-status').innerHTML = 'A procurar atualizações…';
  const r = await api.checkUpdate();
  if (r.ok && r.data.state === 'checked') {
    $('#update-status').innerHTML = 'Verificação concluída.';
  } else {
    $('#update-status').innerHTML = 'Atualizações indisponíveis de momento.';
  }
});
$('#btn-install-update').addEventListener('click', () => api.installUpdate());

api.onUpdateStatus((s) => {
  const el = $('#update-status');
  if (s.state === 'available') {
    el.innerHTML = `Nova versão <b>${s.version}</b> disponível!`;
    api.downloadUpdate();
  } else if (s.state === 'downloading') {
    el.innerHTML = `A transferir atualização… ${s.percent || 0}%`;
  } else if (s.state === 'downloaded') {
    el.innerHTML = `Atualização <b>${s.version}</b> pronta.`;
    $('#btn-install-update').hidden = false;
  } else if (s.state === 'none') {
    el.innerHTML = 'Estás na versão mais recente. ✓';
  }
});

/* ───────────────────────── Boot ───────────────────────── */
(async function boot() {
  await loadAppInfo();
  const logs = await api.recentLogs(200);
  if (logs.ok) logs.data.forEach(appendLog);
})();
