<div align="center">

# ⚽ FC 26 Optimizer
### by **PEDRO RAMOS**

**Otimizador profissional, seguro e modular para o EA SPORTS FC 26**

[![Release](https://img.shields.io/github/v/release/pdramos/fifa?label=vers%C3%A3o&color=16d67a&style=for-the-badge)](https://github.com/pdramos/fifa/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/pdramos/fifa/total?label=downloads&color=f5c542&style=for-the-badge)](https://github.com/pdramos/fifa/releases/latest)
[![Platform](https://img.shields.io/badge/plataforma-Windows%2010%2F11-0aa85e?style=for-the-badge&logo=windows)](https://github.com/pdramos/fifa/releases/latest)
[![Ban Risk](https://img.shields.io/badge/risco%20de%20ban-0%25-16d67a?style=for-the-badge)](#-0-risco-de-ban--garantido-por-design)
[![License](https://img.shields.io/badge/licença-MIT-8896ad?style=for-the-badge)](#)

<br>

### 📥 [**DESCARREGAR FC 26 OPTIMIZER**](https://github.com/pdramos/fifa/releases/latest/download/FC26-Optimizer-Setup.exe)

*(Windows 10/11 · instalador `.exe` · basta descarregar e instalar)*

</div>

---

Foca-se em máximo desempenho, menos *stuttering*, mais fluidez, tempos de
carregamento mais curtos e menor latência de input — usando **exclusivamente**
ajustes oficiais do Windows, da GPU e das definições do próprio jogo.

> ## 🛡️ 0% RISCO DE BAN — GARANTIDO POR DESIGN
> Este software **nunca** acede à memória do jogo, **nunca** injeta código, DLLs,
> *hooks* ou *drivers*, **nunca** faz *bypass* e **nunca** interage com o EA
> Anti-Cheat (EAAC). Só faz o que qualquer utilizador poderia fazer à mão nas
> Definições do Windows, no painel da GPU ou nas opções do jogo — e **tudo é
> reversível com um clique**. É por isto que não há risco de ban.

---

## ✨ Funcionalidades

- **Análise automática** — deteta o FC 26 (EA app, Steam, Epic), localiza o
  `fcsetup.ini` e faz o diagnóstico do hardware (CPU, RAM, GPU, monitor, plano de energia).
- **Motor de otimizações modular** — 45 otimizações seguras, orientadas a dados,
  organizadas por categoria (Windows, Sistema, Rede, Jogo, Comando & Input, Limpeza).
- **Foco em FPS & input lag reais** — desbloqueio do limite de 60 FPS do FC 26,
  correção do bug de 60 Hz, strand hair off (o maior FPS-killer do jogo) e
  proteção do `fcsetup.ini` contra reescrita. Racional e fontes de cada tweak
  documentados em [docs/RESEARCH.md](docs/RESEARCH.md).
- **Perfis** — Seguro, Equilibrado, Desempenho Máximo, Competitivo (online) e
  Tudo (avançado), além de **perfis personalizados**.
- **Backups & Restauro** — cada alteração guarda o valor original; pontos de
  restauro permitem reverter **tudo com um clique**.
- **Recomendações manuais** — reúne as otimizações de alto impacto que devem ser
  feitas à mão (painel NVIDIA/AMD, DNS, SSD, router) recolhidas dos melhores guias
  e fóruns.
- **Sistema de diagnóstico**, **barra de progresso**, **logs em tempo real** e
  **atualizações automáticas** (GitHub Releases).
- **Interface moderna e personalizada** com a marca **PEDRO RAMOS**.

---

## 🚀 Como usar

### Opção 1 — Instalar (recomendado)

1. [**Descarrega o instalador**](https://github.com/pdramos/fifa/releases/latest/download/FC26-Optimizer-Setup.exe) mais recente.
2. Faz duplo-clique em `FC26-Optimizer-Setup.exe` e segue os passos.
3. Abre o **FC 26 Optimizer** — aceita o pedido de Administrador do Windows.

> A app pede privilégios de **Administrador** porque algumas otimizações escrevem
> em `HKLM` e configuram serviços do Windows. Sem admin, os ajustes de utilizador
> (`HKCU`) e a limpeza de caches continuam a funcionar.

4. Clica em **Analisar Jogo**.
5. Escolhe um **Perfil** (recomendado: *Equilibrado*) ou seleciona otimizações
   individuais no separador **Otimizações**.
6. Clica em **Otimizar Agora**. Um ponto de restauro é criado automaticamente.
7. Podes **Reverter Tudo** ou restaurar um ponto no separador **Backups** a
   qualquer momento.

### Opção 2 — Compilar a partir do código-fonte

Requer **Node.js 18+**. Ver instruções detalhadas em [BUILDING.md](BUILDING.md).

```bash
npm install      # instalar dependências
npm start        # iniciar a aplicação em modo de desenvolvimento
npm run lint     # validar a segurança do catálogo de otimizações
npm run dist     # gerar o instalador Windows (NSIS)
```

---

## 🧱 Arquitetura

Electron com separação estrita entre o processo privilegiado e a UI *sandboxed*.

```
src/
├─ main/                         # processo principal (Node, privilegiado)
│  ├─ main.js                    # janela frameless + arranque
│  ├─ preload.js                 # ponte IPC segura (contextIsolation ON)
│  ├─ ipc.js                     # handlers IPC (única superfície exposta)
│  ├─ core/
│  │  ├─ paths.js                # resolução de caminhos (userData)
│  │  ├─ logger.js               # logging estruturado + stream para a UI
│  │  ├─ winexec.js              # wrapper SEGURO de reg/powercfg/sc/PowerShell
│  │  ├─ gameDetector.js         # deteção do FC 26 (EA/Steam/Epic)
│  │  ├─ systemInfo.js           # diagnóstico de hardware/OS
│  │  ├─ stateStore.js           # estado aplicado + dados de reversão
│  │  ├─ backupManager.js        # backups de ficheiros + pontos de restauro
│  │  ├─ profileManager.js       # perfis integrados + personalizados
│  │  └─ updater.js              # auto-update (electron-updater)
│  └─ optimizations/
│     ├─ catalog.js              # TODAS as otimizações, declaradas como dados
│     ├─ executors.js            # executores genéricos apply/revert/status
│     └─ engine.js               # orquestração + progresso + backups
└─ renderer/                     # UI (HTML/CSS/JS puro, sem acesso a Node)
   ├─ index.html
   ├─ styles/app.css
   └─ scripts/app.js
```

### Como a segurança é garantida

- **Só executores seguros.** Cada otimização declara um `type` que corresponde a
  um executor: `registry`, `powerplan`, `service`, `command`, `gameconfig`,
  `cleanup`. Não existe nenhum executor capaz de aceder à memória, injetar código
  ou instalar drivers — logo, é **impossível** exprimir uma técnica perigosa.
- **Tudo reversível.** Antes de escrever, o motor lê e guarda o valor anterior
  (registo, serviço) ou copia o ficheiro original (config do jogo). Uma otimização
  que não saiba desfazer-se não pode existir.
- **Config do jogo respeitada.** A edição do `fcsetup` só altera chaves que o
  jogo já escreveu (`addIfMissing: false`) e faz sempre backup do ficheiro.
- **Validação em CI.** `npm run lint` rejeita qualquer entrada que não seja
  estruturalmente segura ou que invoque um binário proibido.

---

## 📋 Categorias de otimização (resumo)

| Categoria | Exemplos |
|---|---|
| **Windows** | Modo de Jogo, HAGS, plano *Desempenho Máximo*, efeitos visuais, Game Bar/DVR, notificações, ecrã inteiro exclusivo, atraso de arranque |
| **Sistema** | Perfil MMCSS de jogos (categoria *High*), System Responsiveness, Power Throttling, SysMain, prioridade de CPU do FC 26, `Win32PrioritySeparation`, apps em segundo plano, telemetria, hibernação/Fast Startup |
| **Rede** | Limpar DNS, TCP auto-tuning |
| **Jogo (FC 26)** | Desbloqueio do limite de 60 FPS, correção do bug de 60 Hz, *strand hair* off, motion blur off, V-Sync e MSAA no `fcsetup.ini` (sempre com backup), proteção do ficheiro contra reescrita, GPU dedicada + *Alto Desempenho* |
| **Comando & Input** | Desativar aceleração do rato (input 1:1); guia anti-input-delay do comando (overlay EA, Steam Input, DS4Windows, USB) |
| **Limpeza** | Cache de shaders DirectX/NVIDIA/AMD, cache da Store/UWP, temporários, crash dumps, cache da app EA |
| **Manuais** | Definições in-game do FC 26, EA app/overlays, monitor/VRR, processos em segundo plano, painel NVIDIA/AMD, DNS rápido, SSD, DDU, reparação do EAAC |

---

## ⚠️ Notas

- Otimizações marcadas **"Cuidado"** estão desligadas por omissão (ex.: desativar
  otimizações de ecrã inteiro pode não ajudar em *borderless* com VRR).
- Otimizações com **"Requer reinício"** só têm efeito após reiniciar o Windows.
- As **recomendações manuais** não são automatizadas de propósito — automatizar
  o painel da GPU/router de forma fiável não é seguro; a app dá os passos exatos.

---

Feito com dedicação por **PEDRO RAMOS**. Licença MIT.
