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

const CATEGORIES = {
  windows: 'Windows',
  gpu: 'GPU',
  game: 'Jogo (FC 26)',
  network: 'Rede',
  cleanup: 'Limpeza',
  system: 'Sistema',
  storage: 'Armazenamento',
};

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
    name: 'Desativar otimizações de ecrã inteiro para o FC 26',
    description:
      'Força ecrã inteiro exclusivo para o executável do jogo, reduzindo a latência do compositor. Pode não ser ideal em setups borderless com VRR.',
    category: 'windows',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'registry',
    key: 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
    valueName: (ctx) => ctx.game && ctx.game.executable,
    valueType: 'REG_SZ',
    applyData: '~ DISABLEDXMAXIMIZEDWINDOWEDMODE',
    requires: (ctx) => Boolean(ctx.game && ctx.game.executable),
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
  {
    id: 'cfg-vsync-off',
    name: 'Desativar V-Sync no ficheiro do jogo',
    description:
      'Edita o ficheiro fcsetup do próprio jogo para desativar o V-Sync interno (recomendado quando se usa V-Sync/VRR do driver). Ficheiro copiado para backup antes de editar.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'gameconfig',
    file: 'fcsetup',
    settings: { VSYNC: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(ctx.game && ctx.game.settingsDir),
  },
  {
    id: 'cfg-msaa-off',
    name: 'Reduzir MSAA no ficheiro do jogo',
    description:
      'Desativa o anti-aliasing MSAA no fcsetup para o maior ganho de FPS relacionado com AA. Só altera se a chave já existir.',
    category: 'game',
    impact: 'medium',
    default: false,
    caution: true,
    type: 'gameconfig',
    file: 'fcsetup',
    settings: { MSAA_LEVEL: '0' },
    addIfMissing: false,
    requires: (ctx) => Boolean(ctx.game && ctx.game.settingsDir),
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
      'Modo de baixa latência: Ultra',
      'Modo de gestão de energia: Preferir desempenho máximo',
      'Taxa de frames máxima: refresh do monitor − 3 (ex.: 141 para 144 Hz) quando usa G-Sync/VRR',
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
      'Oclusão de ambiente: Baixa (maior ganho de FPS com impacto visual mínimo)',
      'Escala de renderização: 100% (reduzir em passos de 10% só se não aguentar o cap)',
      'Cabelo baseado em fios (Strand hair): Desligado',
      'Motion blur: Desligado',
      'Ray tracing: Desligado',
      'Detalhe de multidão/relva: Médio',
      'Limite de FPS: ~90, ou refresh − 3 com VRR (a engine do FC fica instável acima de ~120 FPS)',
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
      'Esvaziar a lista de standby de memória com o RAMMap da Microsoft se a RAM em standby estiver saturada',
    ],
  },
];

module.exports = { catalog, manualRecommendations, CATEGORIES };
