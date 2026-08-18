# Como compilar o FC 26 Optimizer

## Pré-requisitos

- **Windows 10 ou 11**
- **Node.js 18+** (descarregar de https://nodejs.org)
- **npm** (vem com Node.js)
- ~500 MB de espaço em disco (para node_modules + build)

## Passos

### 1. Clonar o repositório

```bash
git clone https://github.com/pdramos/fifa
cd fifa
```

### 2. Instalar dependências

```bash
npm install
```

Isto descarrega ~300 MB de dependências (electron, electron-builder, etc.).
Demora 5-10 minutos (depende da velocidade da internet).

### 3. Validar a segurança

```bash
npm run lint
```

Isto verifica que todas as otimizações são seguras e reversíveis.

### 4. Compilar o instalador

```bash
npm run dist
```

Isto gera o instalador Windows em:
```
dist/FC26-Optimizer-Setup.exe
```

Demora 3-5 minutos.

## Usar a app compilada

Duplo-clique no `FC26-Optimizer-Setup.exe` e segue o instalador.

---

## Modo desenvolvimento (sem compilar)

Se só quiseres testar a app sem gerar o instalador:

```bash
npm install
npm start
```

Isto abre a app em modo dev (com DevTools).

---

## Resolver problemas

### "npm: command not found"
Instala Node.js de https://nodejs.org — vem com npm incluído.

### "electron ERR! spawn ENOENT"
Alguma dependência não instalou corretamente. Tenta:
```bash
rm -r node_modules package-lock.json
npm install
```

### Antivírus bloqueia o .exe
O `electron-builder` assina digitalmente o instalador, mas antivírus podem ser
cautelosos. Podes:
- Adicionar a pasta do projeto à whitelist do antivírus
- Ou usar o GitHub Actions (workflow automático) que compila na cloud

---

## GitHub Actions (automático)

Se fizeres push de uma tag `v1.0.0`, o GitHub compila automaticamente:

```bash
git tag v1.0.0
git push origin v1.0.0
```

O instalador fica disponível em **Releases** → `FC26-Optimizer-Setup.exe`.
