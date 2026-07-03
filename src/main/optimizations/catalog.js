'use strict';

/**
 * The optimization catalog — every tweak the app can apply, declared as data.
 *
 * Each entry is executed by the matching executor in ./executors.js. Function-
 * valued fields (e.g. `valueName: ctx => ...`) are materialized against the
 * runtime context (detected game + system) before execution, so entries can
 * adapt to the user's machine without any imperative code here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAFETY CONTRACT — every entry in this file is, without exception:
 *    • an official Windows setting, a GPU-vendor setting, or the game's OWN
 *      config file (which EA intends players to edit);
 *    • fully reversible (the engine snapshots the prior value first);
 *    • ZERO interaction with the FC 26 process memory, no injection, no hooks,
 *      no DLLs, no drivers, no anti-cheat tampering, no binary patching.
 *  This is why the optimizer carries no ban risk.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `impact`: high | medium | low   — expected effect on performance/smoothness
 * `default`: true | false         — whether recommended profiles enable it
 * `caution`: true                 — off by default, shown with a warning
 * `reboot`: true                  — takes effect after a restart
 */

const fs = require('fs');
const path = require('path');

const CATEGORIES = {
  windows: 'Windows',
  gpu: 'GPU',
  game: 'Jogo (FC 26)',
  network: 'Rede',
  cleanup: 'Limpeza',
  system: 'Sistema',
  storage: 'Armazenamento',
  input: 'Comando & Input',
};

/** Escape a value for safe interpolation inside a single-quoted PowerShell string. */
function psEscape(s) {
  return String(s || '').replace(/'/g, "''");
}

/**
 * Candidate names for the game's own settings file. FC 26 writes
 * "fcsetup.ini" in %LOCALAPPDATA%\EA SPORTS FC 26 (Windows hides the
 * extension, so guides often call it just "fcsetup").
 */
const FCSETUP_CANDIDATES = ['fcsetup.ini', 'fcsetup', 'FCSETUP.INI'];

/** Resolve the full path of fcsetup.ini for the detected install, or null. */
function fcsetupPath(ctx) {
  if (!ctx || !ctx.game || !ctx.game.settingsDir) return null;
  for (const name of FCSETUP_CANDIDATES) {
    const p = path.join(ctx.game.settingsDir, name);
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

const catalog = [
  /* ───────────────────────────── Windows OS ───────────────────────────── */
  {
    id: 'win-game-mode',
    name: 'Ativar o Modo de Jogo do Windows',
    description:
      'Faz o Windows priorizar CPU/GPU para o jogo em primeiro plano e reduz a interferência de tarefas em segundo plano.',
    category: 'windows',
    impact: 'medium',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\GameBar',
    valueName: 'AutoGameModeEnabled',
    valueType: 'REG_DWORD',
    applyData: '1',
  },
  {
    id: 'win-hags',
    name: 'Agendamento de GPU acelerado por hardware (HAGS)',
    description:
      'Permite que a GPU faça a gestão da sua própria fila de frames, aliviando o CPU e podendo reduzir a latência. Requer reinício.',
    category: 'windows',
    impact: 'medium',
    default: true,
    reboot: true,
    type: 'registry',
    key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
    valueName: 'HwSchMode',
    valueType: 'REG_DWORD',
    applyData: '2',
    needsAdmin: true,
  },
  {
    id: 'win-power-ultimate',
    name: 'Plano de energia "Desempenho Máximo"',
    description:
      'Elimina o estacionamento de núcleos e o downclock agressivo do CPU para tempos de frame mais estáveis.',
    category: 'windows',
    impact: 'high',
    default: true,
    type: 'powerplan',
    needsAdmin: true,
  },
  {
    id: 'win-visual-effects',
    name: 'Ajustar efeitos visuais para melhor desempenho',
    description: 'Desativa animações do ambiente de trabalho, libertando ciclos de CPU/GPU.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
    valueName: 'VisualFXSetting',
    valueType: 'REG_DWORD',
    applyData: '2',
  },
  {
    id: 'win-transparency',
    name: 'Desativar efeitos de transparência',
    description: 'Remove a sobrecarga de composição de transparências do DWM.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
    valueName: 'EnableTransparency',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'win-gamebar-dvr',
    name: 'Desativar Xbox Game Bar / Game DVR',
    description:
      'Remove a captura e o overlay em segundo plano que adicionam latência de input e sobrecarga.',
    category: 'windows',
    impact: 'medium',
    default: true,
    type: 'registry',
    key: 'HKCU\\System\\GameConfigStore',
    valueName: 'GameDVR_Enabled',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'win-gamedvr-appcapture',
    name: 'Desativar captura de ecrã em segundo plano',
    description: 'Impede o AppCapture de consumir recursos durante o jogo.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
    valueName: 'AppCaptureEnabled',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'win-notifications',
    name: 'Desativar notificações (toasts)',
    description: 'Evita que pop-ups roubem o foco e causem quebras de frames durante as partidas.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
    valueName: 'ToastEnabled',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'win-fso-per-exe',
    name: 'Camadas de compatibilidade do FC26.exe (DPI + FSO)',
    description:
      'Desativa o escalamento automático de DPI do Windows para o executável do jogo (evita imagem desfocada em ecrãs com escala >100%) e marca "desativar otimizações de ecrã inteiro". Nota honesta: o FC 26 é DX12, onde as "fullscreen optimizations" legadas já não se aplicam — o benefício real aqui é o DPI. Pode não ser ideal em setups borderless com VRR.',
    category: 'game',
    impact: 'low',
    default: false,
    caution: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
    valueName: (ctx) => ctx.game && ctx.game.executable,
    valueType: 'REG_SZ',
    applyData: '~ HIGHDPIAWARE DISABLEDXMAXIMIZEDWINDOWEDMODE',
    requires: (ctx) => Boolean(ctx.game && ctx.game.executable),
  },
  {
    id: 'win-gamebar-full-off',
    name: 'Desligar completamente a Xbox Game Bar',
    description:
      'Desativa o painel de arranque e o serviço Nexus da Game Bar, eliminando o overlay que consome recursos e adiciona latência de input. Atenção (CPUs AMD X3D de duplo CCD, ex.: 7950X3D): o estacionamento de núcleos depende da deteção de jogos da Game Bar — se notares stutter nesses CPUs, reverte esta otimização.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    values: [
      { key: 'HKCU\\Software\\Microsoft\\GameBar', valueName: 'ShowStartupPanel', valueType: 'REG_DWORD', applyData: '0' },
      { key: 'HKCU\\Software\\Microsoft\\GameBar', valueName: 'UseNexusForGameBarEnabled', valueType: 'REG_DWORD', applyData: '0' },
    ],
  },
  {
    id: 'win-startup-delay-off',
    name: 'Remover atraso de arranque de aplicações',
    description:
      'Elimina o atraso artificial que o Windows impõe ao iniciar aplicações no arranque, tornando o sistema utilizável mais depressa.',
    category: 'windows',
    impact: 'low',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize',
    valueName: 'StartupDelayInMSec',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'win-fse-global',
    name: 'Preferir ecrã inteiro exclusivo (global, jogos DX11)',
    description:
      'Define as flags GameDVR_FSE do Windows para respeitar o ecrã inteiro exclusivo. Nota honesta: este mecanismo legado só afeta jogos DX9/DX11 — no FC 26 (DX12) não tem efeito. Mantido para quem joga também títulos antigos. Pode não ser ideal em setups borderless com VRR/G-Sync.',
    category: 'windows',
    impact: 'low',
    default: false,
    caution: true,
    type: 'registry',
    values: [
      { key: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_FSEBehaviorMode', valueType: 'REG_DWORD', applyData: '2' },
      { key: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_HonorUserFSEBehaviorMode', valueType: 'REG_DWORD', applyData: '1' },
      { key: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_DXGIHonorFSEWindowsCompatible', valueType: 'REG_DWORD', applyData: '1' },
      { key: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_EFSEFeatureFlags', valueType: 'REG_DWORD', applyData: '0' },
    ],
  },

  /* ──────────────────────────────── System (MMCSS / scheduler) ────────── */
  {
    id: 'sys-games-scheduling',
    name: 'Prioridade multimédia para jogos (GPU Priority)',
    description:
      'Ajusta o perfil MMCSS de "Games" do Windows para dar prioridade de GPU/CPU ao jogo. Alteração oficial do agendador.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
    valueName: 'GPU Priority',
    valueType: 'REG_DWORD',
    applyData: '8',
  },
  {
    id: 'sys-games-priority',
    name: 'Prioridade de tarefa "Games" = alta',
    description: 'Complementa o perfil MMCSS de jogos com prioridade de CPU elevada.',
    category: 'system',
    impact: 'low',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
    valueName: 'Priority',
    valueType: 'REG_DWORD',
    applyData: '6',
  },
  {
    id: 'sys-network-throttling',
    name: 'Desativar Network Throttling Index',
    description:
      'Remove o limitador de rede do MMCSS que pode afetar jogos multijogador. Alteração oficial do Windows.',
    category: 'system',
    impact: 'low',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    valueName: 'NetworkThrottlingIndex',
    valueType: 'REG_DWORD',
    applyData: '4294967295',
  },
  {
    id: 'sys-system-responsiveness',
    name: 'Otimizar System Responsiveness',
    description:
      'Reduz a reserva de CPU para tarefas em segundo plano de baixa prioridade (de 20% para 10%).',
    category: 'system',
    impact: 'low',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    valueName: 'SystemResponsiveness',
    valueType: 'REG_DWORD',
    applyData: '10',
  },
  {
    id: 'sys-power-throttling-off',
    name: 'Desativar Power Throttling',
    description: 'Impede o Windows de reduzir o desempenho de processos para poupar energia.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling',
    valueName: 'PowerThrottlingOff',
    valueType: 'REG_DWORD',
    applyData: '1',
  },
  {
    id: 'sys-sysmain',
    name: 'Desativar SysMain (SuperFetch)',
    description:
      'Impede o pré-carregamento agressivo que enche a lista de standby — causa comum de stuttering. Impacto mínimo em SSD.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'service',
    serviceName: 'SysMain',
    targetStart: 'disabled',
    stopNow: true,
  },
  {
    id: 'sys-proc-priority-ifeo',
    name: 'Prioridade de CPU "Alta" para o FC 26',
    description:
      'Define a classe de prioridade de CPU do executável através da funcionalidade oficial do Windows (Image File Execution Options). É uma chamada do agendador — nunca acede à memória do jogo.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: (ctx) =>
      `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${
        (ctx.game && ctx.game.processName) || 'FC26.exe'
      }\\PerfOptions`,
    valueName: 'CpuPriorityClass',
    valueType: 'REG_DWORD',
    applyData: '3',
  },
  {
    id: 'sys-win32-priority-separation',
    name: 'Otimizar prioridade da aplicação em primeiro plano',
    description:
      'Configura o Win32PrioritySeparation para dar um impulso de CPU curto e variável à janela ativa (o jogo), melhorando a consistência dos frames. Ajuste oficial do agendador do Windows.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl',
    valueName: 'Win32PrioritySeparation',
    valueType: 'REG_DWORD',
    applyData: '38',
  },
  {
    id: 'sys-mmcss-games-category',
    name: 'Categoria de agendamento "High" para jogos (MMCSS)',
    description:
      'Eleva a categoria de agendamento e a prioridade de I/O do perfil "Games" do Windows para "High". Complementa a prioridade de GPU/CPU. Ajuste oficial do MMCSS.',
    category: 'system',
    impact: 'medium',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
    values: [
      { valueName: 'Scheduling Category', valueType: 'REG_SZ', applyData: 'High' },
      { valueName: 'SFIO Priority', valueType: 'REG_SZ', applyData: 'High' },
    ],
  },
  {
    id: 'sys-background-apps-off',
    name: 'Desativar aplicações em segundo plano (UWP)',
    description:
      'Impede que as apps da Microsoft Store corram em segundo plano a consumir CPU, RAM e rede durante o jogo.',
    category: 'system',
    impact: 'medium',
    default: true,
    type: 'registry',
    values: [
      { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', valueName: 'GlobalUserDisabled', valueType: 'REG_DWORD', applyData: '1' },
      { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', valueName: 'BackgroundAppGlobalToggle', valueType: 'REG_DWORD', applyData: '0' },
    ],
  },
  {
    id: 'sys-telemetry-min',
    name: 'Reduzir telemetria e recolha de dados',
    description:
      'Baixa a telemetria do Windows para o mínimo, reduzindo tarefas e tráfego em segundo plano. Definição oficial de política do Windows (totalmente reversível).',
    category: 'system',
    impact: 'low',
    default: true,
    needsAdmin: true,
    type: 'registry',
    key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    valueName: 'AllowTelemetry',
    valueType: 'REG_DWORD',
    applyData: '0',
  },
  {
    id: 'sys-hibernate-off',
    name: 'Desativar hibernação e Arranque Rápido',
    description:
      'Desliga a hibernação (e o "Fast Startup" associado), que pode causar estados de driver inconsistentes entre sessões e ocupa vários GB em disco. Reversível com um clique.',
    category: 'system',
    impact: 'low',
    default: false,
    caution: true,
    needsAdmin: true,
    type: 'command',
    applyCmd: { cmd: 'powercfg', args: ['/hibernate', 'off'] },
    revertCmd: { cmd: 'powercfg', args: ['/hibernate', 'on'] },
  },

  /* ──────────────────────────────── Rato & Input ──────────────────────── */
  {
    id: 'input-mouse-accel-off',
    name: 'Desativar aceleração do rato (input 1:1)',
    description:
      'Desliga a "melhoria da precisão do ponteiro" do Windows para um movimento de rato consistente e previsível nos menus e na jogabilidade. Reversível.',
    category: 'input',
    impact: 'low',
    default: false,
    caution: true,
    type: 'registry',
    key: 'HKCU\\Control Panel\\Mouse',
    values: [
      { valueName: 'MouseSpeed', valueType: 'REG_SZ', applyData: '0' },
      { valueName: 'MouseThreshold1', valueType: 'REG_SZ', applyData: '0' },
      { valueName: 'MouseThreshold2', valueType: 'REG_SZ', applyData: '0' },
    ],
  },

  /* ──────────────────────────────── Rede ──────────────────────────────── */
  {
    id: 'net-flush-dns',
    name: 'Limpar cache DNS',
    description: 'Remove entradas DNS obsoletas que podem causar erros de matchmaking/ligação.',
    category: 'network',
    impact: 'low',
    default: true,
    type: 'command',
    applyCmd: { cmd: 'ipconfig', args: ['/flushdns'] },
    // Stateless action, nothing to revert.
  },
  {
    id: 'net-tcp-autotuning',
    name: 'Repor TCP Auto-Tuning para "normal"',
    description:
      'Garante o nível de auto-tuning recomendado do TCP para ligações online estáveis.',
    category: 'network',
    impact: 'low',
    default: false,
    needsAdmin: true,
    type: 'command',
    applyCmd: { cmd: 'netsh', args: ['int', 'tcp', 'set', 'global', 'autotuninglevel=normal'] },
    revertCmd: { cmd: 'netsh', args: ['int', 'tcp', 'set', 'global', 'autotuninglevel=normal'] },
  },

  /* ──────────────────────────────── Jogo (FC 26) ──────────────────────── */
  /*
   * fcsetup.ini tweaks — the game's OWN settings file (%LOCALAPPDATA%\
   * EA SPORTS FC 26\fcsetup.ini). Editing it is the community-standard,
   * EA-forum-recommended path with zero ban reports across FIFA/FC titles:
   * the file lives OUTSIDE the game install dir and is exactly what the
   * in-game menu writes. Every edit backs up the whole file first.
   *
   * Evidence for each key is documented in docs/RESEARCH.md.
   */
  {
    id: 'cfg-strand-hair-off',
    name: 'Desativar cabelo por fios (Strand Hair)',
    description:
      'Apontado nos fóruns da EA como o MAIOR consumidor de FPS do FC 26. O auto-detect do jogo volta a ativá-lo sozinho — é a causa conhecida da quebra de FPS após o intervalo e a abertura de packs. Define STRAND_BASED_HAIR = 0 no fcsetup.ini (com backup). Para o jogo não repor, ativa também "Proteger o fcsetup.ini contra reescrita".',
    category: 'game',
    impact: 'high',
    default: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: { STRAND_BASED_HAIR: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'cfg-motion-blur-off',
    name: 'Desativar motion blur no ficheiro do jogo',
    description:
      'Desliga o desfoque de movimento (MOTION_BLUR = 0) — liberta GPU e torna a imagem mais nítida em jogadas rápidas, reduzindo o input lag percecionado. Faz parte da correção comunitária da quebra de FPS pós-intervalo do FC 26.',
    category: 'game',
    impact: 'medium',
    default: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: { MOTION_BLUR: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'cfg-fps-unlock',
    name: 'Desbloquear o limite de 60 FPS do jogo',
    description:
      'O FC 26 vem travado a 60 FPS (TARGET_FRAME_RATE = 60 no fcsetup.ini). Define TARGET_FRAME_RATE e MAX_FRAME_RATE para a taxa do teu monitor (máx. 120 — há relatos de comportamento errático da engine com FPS muito altos). Mais FPS = menos latência de input. Recomendado: mantém também um cap no driver a refresh − 3.',
    category: 'game',
    impact: 'high',
    default: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: (ctx) => {
      const hz = ctx.system && Number(ctx.system.refreshRateHz);
      const v = Math.max(60, Math.min(120, Math.round(Number.isFinite(hz) && hz > 0 ? hz : 120)));
      return { TARGET_FRAME_RATE: String(v), MAX_FRAME_RATE: String(v) };
    },
    addIfMissing: false,
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'cfg-refresh-rate-fix',
    name: 'Corrigir bloqueio de 60 Hz (REFRESH_RATE)',
    description:
      'Bug conhecido do FC 24/25/26: o jogo prende-se a 60 Hz mesmo em monitores de 120/144+ Hz — 60 Hz significa mais latência de input. Escreve a taxa real do monitor detetado na chave REFRESH_RATE do fcsetup.ini. Só tem efeito em ecrã inteiro exclusivo.',
    category: 'game',
    impact: 'high',
    default: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: (ctx) => ({ REFRESH_RATE: String(Math.round(ctx.system.refreshRateHz)) }),
    addIfMissing: false,
    requires: (ctx) =>
      Boolean(fcsetupPath(ctx)) &&
      Boolean(ctx.system && Number(ctx.system.refreshRateHz) > 60),
  },
  {
    id: 'cfg-vsync-off',
    name: 'Desativar V-Sync no ficheiro do jogo',
    description:
      'O V-Sync interno do FC tem má cadência de frames (consenso nos fóruns da EA/Steam) e adiciona latência. Define WAITFORVSYNC = 0 no fcsetup.ini e controla o tearing no driver (V-Sync do driver + G-Sync/FreeSync). Sem VRR nem cap de FPS podes notar tearing — por isso é opcional.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: { WAITFORVSYNC: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'cfg-msaa-off',
    name: 'Reduzir MSAA no ficheiro do jogo',
    description:
      'Desativa o anti-aliasing MSAA (MSAA_LEVEL = 0) — a definição não aparece no menu do jogo, só é ajustável neste ficheiro. É o maior ganho de FPS relacionado com AA; pode aumentar ligeiramente o serrilhado.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'gameconfig',
    file: FCSETUP_CANDIDATES,
    settings: { MSAA_LEVEL: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'cfg-lock-readonly',
    name: 'Proteger o fcsetup.ini contra reescrita',
    description:
      'O jogo reescreve o fcsetup.ini no arranque e o auto-detect do FC 26 repõe definições pesadas (strand hair, motion blur) durante menus e o intervalo. Marca o ficheiro como só-de-leitura — o truque padrão da comunidade — para as tuas definições ficarem. Nota: enquanto ativo, o menu gráfico do jogo não guarda alterações; reverte primeiro se quiseres mexer nas definições dentro do jogo. Reversível com um clique.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'command',
    applyCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Set-ItemProperty -LiteralPath '${psEscape(fcsetupPath(ctx))}' -Name IsReadOnly -Value $true`,
      ],
    }),
    revertCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Set-ItemProperty -LiteralPath '${psEscape(fcsetupPath(ctx))}' -Name IsReadOnly -Value $false`,
      ],
    }),
    statusCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-ItemProperty -LiteralPath '${psEscape(fcsetupPath(ctx))}').IsReadOnly`,
      ],
    }),
    statusMatch: '^True',
    requires: (ctx) => Boolean(fcsetupPath(ctx)),
  },
  {
    id: 'game-gpu-preference',
    name: 'Forçar GPU dedicada + Alto Desempenho para o FC 26',
    description:
      'Regista o FC 26 nas Definições Gráficas do Windows com preferência "Alto desempenho", garantindo que usa a GPU dedicada (essencial em portáteis com gráficos integrados + dedicados). Definição 100% oficial.',
    category: 'game',
    impact: 'high',
    default: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences',
    valueName: (ctx) => ctx.game && ctx.game.executable,
    valueType: 'REG_SZ',
    applyData: 'GpuPreference=2;',
    requires: (ctx) => Boolean(ctx.game && ctx.game.executable),
  },
  {
    id: 'game-defender-exclusion',
    name: 'Excluir a pasta do FC 26 do Windows Defender',
    description:
      'Adiciona a pasta de instalação do jogo às exclusões oficiais do Windows Defender, evitando que a verificação em tempo real cause engasgos ao carregar ficheiros grandes (troca de estádio, replays, cutscenes). Usa a funcionalidade oficial Add-MpPreference/Remove-MpPreference — 100% reversível com um clique.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    needsAdmin: true,
    type: 'command',
    applyCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', `Add-MpPreference -ExclusionPath '${psEscape(ctx.game.installDir)}'`],
    }),
    revertCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', `Remove-MpPreference -ExclusionPath '${psEscape(ctx.game.installDir)}' -ErrorAction SilentlyContinue`],
    }),
    statusCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `if ((Get-MpPreference).ExclusionPath -contains '${psEscape(ctx.game.installDir)}') { 'yes' } else { 'no' }`,
      ],
    }),
    statusMatch: 'yes',
    requires: (ctx) => Boolean(ctx.game && ctx.game.installDir),
  },
  {
    id: 'game-qos-priority',
    name: 'Prioridade de rede (QoS) dedicada ao FC26.exe',
    description:
      'Cria uma política de QoS oficial do Windows (New-NetQosPolicy) que marca o tráfego do processo do FC 26 com prioridade elevada (DSCP Expedited Forwarding), reduzindo picos de latência online causados por downloads/streaming em segundo plano. Não altera nenhum pacote do jogo — só a prioridade de saída do Windows. 100% reversível.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    needsAdmin: true,
    type: 'command',
    applyCmd: (ctx) => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `if (-not (Get-NetQosPolicy -Name 'FC26Optimizer' -ErrorAction SilentlyContinue)) { New-NetQosPolicy -Name 'FC26Optimizer' -AppPathNameMatchCondition '${psEscape(ctx.game.processName)}' -DSCPAction 46 -NetworkProfile All -Confirm:$false | Out-Null }`,
      ],
    }),
    revertCmd: () => ({
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', `Remove-NetQosPolicy -Name 'FC26Optimizer' -Confirm:$false -ErrorAction SilentlyContinue`],
    }),
    statusCmd: () => ({
      cmd: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `if (Get-NetQosPolicy -Name 'FC26Optimizer' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`,
      ],
    }),
    statusMatch: 'yes',
    requires: (ctx) => Boolean(ctx.game && ctx.game.processName),
  },

  /* ──────────────────────────────── Limpeza ───────────────────────────── */
  {
    id: 'clean-dx-shader-cache',
    name: 'Limpar cache de shaders DirectX',
    description: 'Remove shaders em cache corrompidos/conflituosos que causam hitching. Regenera-se automaticamente.',
    category: 'cleanup',
    impact: 'medium',
    default: true,
    type: 'cleanup',
    targets: ['%LOCALAPPDATA%\\D3DSCache'],
  },
  {
    id: 'clean-nv-shader-cache',
    name: 'Limpar cache de shaders NVIDIA',
    description: 'Remove a cache de shaders da NVIDIA (regenera-se automaticamente).',
    category: 'cleanup',
    impact: 'medium',
    default: true,
    requires: (ctx) => !ctx.system || ctx.system.gpuVendor !== 'amd',
    type: 'cleanup',
    targets: [
      '%LOCALAPPDATA%\\NVIDIA\\DXCache',
      '%LOCALAPPDATA%\\NVIDIA\\GLCache',
      '%LOCALAPPDATA%\\NVIDIA Corporation\\NV_Cache',
    ],
  },
  {
    id: 'clean-amd-shader-cache',
    name: 'Limpar cache de shaders AMD',
    description: 'Remove a cache de shaders da AMD (regenera-se automaticamente).',
    category: 'cleanup',
    impact: 'medium',
    default: true,
    requires: (ctx) => !ctx.system || ctx.system.gpuVendor !== 'nvidia',
    type: 'cleanup',
    targets: ['%LOCALAPPDATA%\\AMD\\DxCache', '%LOCALAPPDATA%\\AMD\\DxcCache', '%LOCALAPPDATA%\\AMD\\GLCache'],
  },
  {
    id: 'clean-temp-files',
    name: 'Limpar ficheiros temporários',
    description: 'Liberta espaço em disco e remove ficheiros temporários do utilizador.',
    category: 'cleanup',
    impact: 'low',
    default: true,
    type: 'cleanup',
    targets: ['%TEMP%'],
  },
  {
    id: 'clean-ea-app-cache',
    name: 'Limpar cache da aplicação EA',
    description:
      'Corrige lentidão/erros do launcher. Não toca no jogo nem no anti-cheat. Feche a app EA antes.',
    category: 'cleanup',
    impact: 'low',
    default: true,
    type: 'cleanup',
    targets: [
      '%LOCALAPPDATA%\\Electronic Arts\\EA Desktop\\cache',
      '%LOCALAPPDATA%\\Electronic Arts\\EA Desktop\\Logs',
    ],
  },
  {
    id: 'clean-crash-dumps',
    name: 'Limpar despejos de falhas (crash dumps)',
    description:
      'Remove ficheiros de despejo de memória de aplicações que falharam, libertando espaço. Regenerados apenas quando algo volta a falhar.',
    category: 'cleanup',
    impact: 'low',
    default: true,
    type: 'cleanup',
    targets: ['%LOCALAPPDATA%\\CrashDumps'],
  },
  {
    id: 'clean-windows-temp',
    name: 'Limpar ficheiros temporários do Windows',
    description:
      'Esvazia a pasta de temporários do sistema (C:\\Windows\\Temp). Requer administrador; ficheiros em uso são ignorados em segurança.',
    category: 'cleanup',
    impact: 'low',
    default: true,
    needsAdmin: true,
    type: 'cleanup',
    targets: ['C:\\Windows\\Temp'],
  },
  {
    id: 'clean-dx-shadercache-store',
    name: 'Limpar cache de shaders da Microsoft Store/UWP',
    description:
      'Remove a cache de compilação de shaders partilhada do Windows (GLCache/D3D) que pode acumular entradas obsoletas. Regenera-se automaticamente.',
    category: 'cleanup',
    impact: 'low',
    default: true,
    type: 'cleanup',
    targets: ['%LOCALAPPDATA%\\Microsoft\\DirectX Shader Cache'],
  },
];

/**
 * Manual recommendations — high-value optimizations that must be done by hand
 * (GPU control panel, router, DDU, moving the game to an SSD). The engine does
 * NOT automate these because doing so reliably/safely isn't possible; instead
 * the UI presents clear step-by-step instructions. Included so the app truly
 * gathers "every optimization from the forums".
 */
const manualRecommendations = [
  {
    id: 'nv-control-panel',
    category: 'gpu',
    vendor: 'nvidia',
    name: 'NVIDIA — perfil do FC26.exe (Painel de Controlo / NVIDIA App)',
    steps: [
      'Modo de baixa latência: Ultra — o FC NÃO tem NVIDIA Reflex nativo; este é o substituto que reduz a fila de frames da GPU (menos input lag). Há relatos no fórum da EA de latência de render a cair de 30–40 ms para 3–10 ms com Ultra + cap de FPS',
      'Taxa de frames máxima: refresh do monitor − 3 (ex.: 141 para 144 Hz) — o limitador interno do FC tem má cadência; limita SEMPRE no driver',
      'Modo de gestão de energia: Preferir desempenho máximo',
      'V-Sync (driver): Ligado + G-Sync ativado; V-Sync no jogo: Desligado',
      'Filtragem de texturas — Qualidade: Alto desempenho',
      'Tamanho da cache de shaders: Ilimitado (ou 10 GB)',
      'Otimização de threads: Ligado (ou Automático)',
    ],
  },
  {
    id: 'amd-adrenalin',
    category: 'gpu',
    vendor: 'amd',
    name: 'AMD — perfil do FC26.exe (Adrenalin)',
    steps: [
      'Enhanced Sync: Ligado (com FreeSync ativado)',
      'FreeSync: Ligado',
      'Radeon Chill: limite mín/máx = refresh − 3 (ex.: 141 para 144 Hz)',
      'Qualidade de filtragem de texturas: Desempenho',
      'Radeon Anti-Lag e Boost: Desligados para este jogo (reportam instabilidade)',
    ],
  },
  {
    id: 'game-ingame-settings',
    category: 'game',
    name: 'Definições gráficas dentro do jogo (recomendadas)',
    steps: [
      'Modo de ecrã: Ecrã inteiro (exclusivo) para menor latência — usa "Sem margens" (borderless) apenas se precisares de alt-tab rápido com VRR',
      'Resolução: nativa do monitor (não reduzas a resolução, reduz a "Escala de renderização")',
      'Oclusão de ambiente (SSAO): Baixa (maior ganho de FPS com impacto visual mínimo)',
      'Escala de renderização: 100% (reduz em passos de 10% só se não aguentares o cap de FPS)',
      'Cabelo baseado em fios (Strand hair): Desligado (custo de GPU alto)',
      'Motion blur: Desligado (mais nitidez e menos input lag percecionado)',
      'Ray tracing: Desligado (grande ganho de FPS no FC 26)',
      'Detalhe de multidão / qualidade da relva: Médio',
      'Qualidade de sombras/reflexos: Médio (as sombras são das definições mais pesadas)',
      'Limite de FPS: NÃO uses o limitador interno do jogo (má cadência de frames, consenso da comunidade) — limita no driver a refresh − 3; a engine fica errática acima de ~120–190 FPS',
      'Anti-aliasing: TAA (bom equilíbrio) — evita MSAA alto, que é muito pesado',
    ],
  },
  {
    id: 'input-controller-fix',
    category: 'input',
    name: 'Comando (controlador) — eliminar input delay [evidência forte p/ FC]',
    steps: [
      'EA app → Definições → Aplicação → desliga o "In-Game Overlay" — há um bug reportado no FC 26 (fórum da EA) em que o overlay + subsistema de input do Windows causam input lag e micro-stutter durante o jogo',
      'Steam: clica no FC 26 → Propriedades → Comando → "Desativar Steam Input" — corrige o atraso do comando e o bug de input duplo reportado no FC 25/26',
      'NÃO uses DS4Windows/remapeadores com o FC: o EA Anti-Cheat pode expulsar-te da sessão, e criam input duplo (comando real + virtual)',
      'Usa o comando COM FIOS numa porta USB da motherboard (não num hub) — corrige o atraso de reconhecimento reportado no FC 26',
      'Fecha overlays antes de jogar: Xbox Game Bar, Discord, GeForce/NVIDIA App',
      'Avançado (só se o resto não chegar): parar o serviço "GameInputSvc" do Windows antes de jogar e reativar depois — workaround documentado para o bug de polling do FC 26, mas outros jogos precisam dele',
    ],
  },
  {
    id: 'game-launcher-eaapp',
    category: 'game',
    name: 'EA app / launcher — reduzir sobrecarga',
    steps: [
      'Definições da EA app → Aplicação → desliga "Iniciar o EA no arranque do Windows"',
      'Desliga o overlay da EA (In-Game Overlay) — é a correção de input lag com evidência mais forte no FC 26: bug reportado no fórum da EA em que o overlay provoca polling redundante de dispositivos e stutter/atraso de input durante as partidas',
      'Fecha a EA app e o browser antes de jogar (libertam RAM e CPU)',
      'Verifica a integridade dos ficheiros do jogo pela EA app se tiveres crashes (Reparar) — é oficial e seguro',
      'No Steam/Epic: desativa igualmente o respetivo overlay para o FC 26',
    ],
  },
  {
    id: 'game-overlays-off',
    category: 'game',
    name: 'Desligar overlays em segundo plano (grande contra stuttering)',
    steps: [
      'NVIDIA App / GeForce Experience: desliga o "In-Game Overlay"',
      'Discord: Definições → Overlay de jogo → Desligado (causa comum de micro-stutter)',
      'Xbox Game Bar: Win+G → desliga (ou usa a otimização automática nesta app)',
      'Steam / Epic / EA: desliga o overlay dentro de cada launcher',
      'MSI Afterburner / RivaTuner: mantém só se precisares de monitorização; overlays de OSD podem custar frames',
    ],
  },
  {
    id: 'net-ethernet',
    category: 'network',
    name: 'Rede — mudanças de maior impacto (manuais)',
    steps: [
      'Usar cabo Ethernet em vez de Wi-Fi (elimina 10–50 ms + perda de pacotes)',
      'DNS rápido: 1.1.1.1 / 1.0.0.1 (Cloudflare) ou 8.8.8.8 / 8.8.4.4 (Google)',
      'Ativar QoS no router para priorizar o PC de jogo',
      'Desativar o algoritmo de Nagle (TcpAckFrequency=1) na tua placa de rede pode reduzir a latência online — só se souberes identificar o teu adaptador',
      'Fechar downloads/streams/atualizações (Steam, Windows Update) durante as partidas online',
    ],
  },
  {
    id: 'display-monitor',
    category: 'system',
    name: 'Monitor & ecrã — configuração para jogo',
    steps: [
      'Define a taxa de atualização máxima do monitor no Windows (Definições → Ecrã → Ecrã avançado)',
      'Ativa G-Sync (NVIDIA) ou FreeSync (AMD) no painel do driver e no OSD do monitor',
      'Usa a resolução nativa do monitor',
      'Desliga o HDR se causar cores lavadas ou stutter (a menos que o monitor tenha bom HDR)',
      'No OSD do monitor: ativa o modo de baixa latência / "Game Mode" e desliga pós-processamento pesado',
    ],
  },
  {
    id: 'background-startup',
    category: 'system',
    name: 'Processos em segundo plano & arranque',
    steps: [
      'Gestor de Tarefas → Arranque: desativa apps que não precisas no arranque (launchers, RGB, atualizadores)',
      'Fecha browsers, Discord e apps de captura antes de jogar (RAM e CPU)',
      'Desinstala "bloatware" e barras de ferramentas que corram serviços em segundo plano',
      'Mantém o Windows e os drivers da GPU atualizados (correções de desempenho e estabilidade)',
      'Faz uma limpeza de disco e mantém pelo menos 10–15% do SSD livre para desempenho ótimo',
    ],
  },
  {
    id: 'storage-ssd',
    category: 'storage',
    name: 'Armazenamento',
    steps: [
      'Garantir que o FC 26 está instalado num SSD (mover via EA app / Steam se estiver em HDD)',
      'Desativar a indexação do Windows na pasta do jogo (Propriedades → Avançadas)',
      'Confirmar que o SSD usa TRIM e não desfragmentação agendada',
    ],
  },
  {
    id: 'maintenance-advisory',
    category: 'system',
    name: 'Manutenção avançada (opcional)',
    steps: [
      'Instalação limpa do driver GPU com DDU em Modo de Segurança (resolve conflitos de perfis/shaders)',
      'Reparar o EA Anti-Cheat pelo instalador oficial em <jogo>\\__Installer\\EAAntiCheat\\ (é uma reparação oficial, não um bypass)',
      'Stutter persistente: repõe as definições locais do jogo — fecha o jogo, FAZ BACKUP e apaga a pasta "settings" em %LOCALAPPDATA%\\EA SPORTS FC 26 (perde câmaras/definições locais; o jogo regenera-as). Correção recorrente do bug de stutter herdado do FC 24/25',
      'Esvaziar a lista de standby de memória com o RAMMap da Microsoft se a RAM em standby estiver saturada',
    ],
  },
];

module.exports = { catalog, manualRecommendations, CATEGORIES };
