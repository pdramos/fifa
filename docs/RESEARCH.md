# Investigação — FPS & Input Lag (v1.2.0)

Este documento regista **de onde veio cada otimização** adicionada na v1.2.0, a
qualidade da evidência, e o que foi **deliberadamente excluído** por não passar
no crivo de evidência ou de segurança. A pesquisa cruzou fóruns oficiais da EA,
Steam Community, Reddit, PCGamingWiki, documentação da Microsoft/NVIDIA e guias
técnicos, com ceticismo explícito: "funcionou para mim" ≠ evidência.

> **Regra inegociável mantida:** nada toca na memória do processo, injeção,
> hooks, DLLs, drivers ou anti-cheat. Tudo reversível com um clique.

---

## 1. Porquê o foco no `fcsetup.ini`

O `fcsetup.ini` (em `%LOCALAPPDATA%\EA SPORTS FC 26\`) é o ficheiro de
definições que **o próprio jogo escreve** — editá-lo é o método recomendado em
dezenas de threads do próprio fórum da EA, com **zero relatos de ban** em toda a
história FIFA/FC. Fica **fora** da pasta de instalação do jogo, portanto fora do
âmbito anti-tamper do EA Anti-Cheat. Formato: `CHAVE = VALOR`, uma por linha.

**Caveat universal (bem documentado):** o jogo reescreve este ficheiro no
arranque, e o auto-detect do FC 26 consegue repor definições pesadas durante
menus/intervalo. Por isso existe a otimização "Proteger o fcsetup.ini contra
reescrita" (atributo só-de-leitura — o truque padrão da comunidade).

### Otimizações novas no catálogo

| ID | Chave(s) | Evidência | Fontes principais |
|---|---|---|---|
| `cfg-strand-hair-off` | `STRAND_BASED_HAIR = 0` | **Forte** — apontado como "o principal FPS killer" do FC 26; o jogo reativa-o sozinho e é a causa identificada da quebra de FPS após o intervalo/packs. Vários threads independentes + mod dedicado no Nexus que faz exatamente isto | EA Forums 13049951, 13050875; Steam guide 3617993291; Nexus mod 946 |
| `cfg-fps-unlock` | `TARGET_FRAME_RATE`, `MAX_FRAME_RATE` | **Forte** — o FC 26 vem travado a 60 FPS por `TARGET_FRAME_RATE = 60`; mais FPS = menor latência de input. Limitado a 120 por relatos consistentes de comportamento errático da engine com FPS muito altos (>~120–190) | EA Forums 13164666 ("Remove the 60 FPS limiter"); Magic Game World; EA Forums 11874687 |
| `cfg-refresh-rate-fix` | `REFRESH_RATE = <Hz do monitor>` | **Forte** — bug documentado do FC 24/25/26: jogo preso a 60 Hz em monitores de alta taxa. Corrigido escrevendo a taxa real (detetada pelo diagnóstico). Só atua em ecrã inteiro exclusivo | EA Answers HQ 14058008 (FC 25), 12962455 (FC 24); DigiStatement; allthings.how |
| `cfg-motion-blur-off` | `MOTION_BLUR = 0` | **Média** — parte da correção comunitária da quebra de FPS do FC 26; ganho de nitidez/latência percecionada | EA Forums 13049951; Steam guide 3617993291 |
| `cfg-vsync-off` (corrigida) | `WAITFORVSYNC = 0` | **Forte para a chave, consenso para o conselho** — o V-Sync/limitador interno do FC tem má cadência; a receita comunitária é desligar no ficheiro e controlar tearing no driver (V-Sync driver + G-Sync/FreeSync). Opt-in porque sem VRR pode haver tearing | EA Forums 11874687; Steam 4845400578767385596 |
| `cfg-msaa-off` (corrigida) | `MSAA_LEVEL = 0` | **Média** — definição que não existe no menu do jogo; só ajustável no ficheiro | GhostArrow (FIFA 23); dumps do ficheiro |
| `cfg-lock-readonly` | atributo só-de-leitura | **Forte** — procedimento padrão em todos os guias ("edit → save → read-only"); sem ele o FC 26 reverte as definições. Opt-in porque bloqueia o menu gráfico do jogo de guardar | consenso em todas as fontes acima |

**Correções de bugs no catálogo antigo:** as entradas de V-Sync/MSAA apontavam
para o ficheiro `fcsetup` (sem extensão — o nome real é `fcsetup.ini`; o
Windows esconde a extensão) e usavam a chave `VSYNC` (a chave real é
`WAITFORVSYNC`). Ou seja, **provavelmente nunca funcionaram** — agora funcionam.

---

## 2. Input lag: o que a pesquisa concluiu

- **O FC não tem NVIDIA Reflex nativo** (não está na lista de jogos suportados
  da NVIDIA; sem opção no jogo nem chave no ficheiro). O equivalente é o **Modo
  de baixa latência: Ultra** no driver + cap de FPS a refresh − 3 — única
  medição quasi-real encontrada: relato no fórum da EA de latência de render a
  cair de 30–40 ms para 3–10 ms com esta combinação (overlay da NVIDIA).
  → Reforçado nas recomendações manuais de GPU.
- **Overlay da EA app**: bug reportado no FC 26 (EA Forums 12882861/12904871) —
  interação overlay + GameInputSvc a causar polling redundante de dispositivos,
  micro-stutter e input lag. Desligar o overlay é a correção com a evidência
  FC-específica mais forte de toda a pesquisa. → Recomendação manual reforçada.
- **Steam Input / DS4Windows**: desativar o Steam Input corrige atraso e input
  duplo do comando (threads FC 25/26); DS4Windows provoca kicks do EA Anti-Cheat
  e input duplo. → Nova recomendação manual "Comando (controlador)".
- **Comando com fios em porta USB da motherboard**: correção detalhada e
  FC 26-específica para atraso de reconhecimento/input (EA Forums 12707236).

---

## 3. Excluído deliberadamente (e porquê)

| Tweak | Motivo da exclusão |
|---|---|
| **`user.cfg` na pasta do jogo** (GameTime.MaxVariableFps, RenderDevice.RenderAheadLimit, Thread.ProcessorCount) | Só há confirmações em **Battlefield** — zero relatos de funcionar em FIFA/FC. Pior: o EAAC declara-se "anti-tamper" sobre a pasta de instalação; erros 115/117 ("configuração inválida") documentados com ficheiros alterados. **Incompatível com a garantia de 0% risco de ban.** |
| **Argumentos de launch** (`-dx11`, `-high`, `-USEALLAVAILABLECORES`, etc.) | A EA app descarta argumentos de forma não fiável; `-dx11` confirmado a falhar no FC 24 (jogo é DX12-only); `-USEALLAVAILABLECORES` é parâmetro do Unreal Engine, não do Frostbite. Inofensivos mas inúteis. |
| **`SwapEffectUpgradeEnable=1`** ("Optimizations for windowed games") | Só afeta apresentação **DX10/DX11 blt-model**; o FC 26 é DX12 (já flip-model) — mecanicamente não pode ajudar o jogo. E mexer na string partilhada arriscava apagar as preferências Auto HDR/VRR do utilizador. |
| **Timer resolution global** (`GlobalTimerResolutionRequests=1`, `bcdedit useplatformtick`) | Sem evidência FC-específica; no Windows 10 2004+/11 os jogos em foreground já obtêm a resolução que pedem — a chave só muda processos em background. O bcdedit é alteração de arranque, invasiva e com resultados mistos. |
| **Desativar MPO** (`OverlayTestMode=5`) | Evidência mista: há um thread PT do fórum da EA a recomendá-lo para o FC 25 e a NVIDIA documentou a chave como workaround de flicker — mas pode **aumentar** a latência em borderless DX12 (remove o caminho de scanout direto), deixou de funcionar de forma fiável no Windows 11 24H2, e não há medições. **Se quiseres, pode ser adicionado como opt-in "remédio anti-flicker" — pergunta-nos.** |
| **Apagar a pasta `settings` automaticamente** | Correção recorrente de stutter (herdada do FC 24/25), mas a pasta contém definições/câmaras do jogador — apagar automaticamente seria destrutivo. Ficou como passo manual com aviso de backup. |
| **Parar `GameInputSvc` automaticamente** | Workaround documentado do bug de input do FC 26, mas o serviço é necessário para outros jogos/periféricos — colateral a mais para automatizar. Ficou como passo manual "avançado". |

## 4. Correções de honestidade

- `win-fse-global` e a parte FSO de `win-fso-per-exe`: a documentação da
  Microsoft ("Demystifying Fullscreen Optimizations") confirma que o mecanismo
  legado de ecrã inteiro exclusivo **não existe em DX12** — as descrições agora
  dizem-no claramente e o impacto foi despromovido para "low".
- `win-gamebar-full-off`: em CPUs AMD X3D de duplo CCD, o parking de núcleos
  depende da deteção de jogos da Game Bar (EA Forums 12048819 documenta stutter
  no FC 24/25 nesses CPUs) — a descrição agora avisa.

## 5. Fontes principais

EA Forums: 13164666, 13049951, 13050875, 11874687, 12882861, 12904871,
12707236, 12048819, 7929278, 7892748, 7835274, 11902234 · EA Answers HQ:
14058008, 12962455 · Steam Community: guias 3617993291, 3413868662,
3334325702; discussões 4845400578767385596, 4847651553826969642 · Nexus Mods:
easportsfc26/mods/946 · PCGamingWiki: Engine:Frostbite_3, EA_Sports_FC_25/26 ·
NVIDIA: custhelp a_id/5157, lista de jogos Reflex · Microsoft: DirectX Dev
Blog (flip model, fullscreen optimizations), support.microsoft.com (windowed
games) · EA Security: eaac-deep-dive · + Magic Game World, allthings.how,
futfc.gg, hone.gg, DigiStatement, GhostArrow, Blur Busters.
