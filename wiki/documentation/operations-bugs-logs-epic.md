# Epic 30 — Operações: Bug Reports & Visualizador de Logs

> **Status:** 📝 Refinado · **Prioridade:** P2 · **Estimativa:** 5 SP · **Sprints:** 0.5 (1 semana)
> **Pré-requisitos:** Nenhum (infraestrutura admin já existe)

---

## Problema

- Bugs são reportados por **WhatsApp / verbalmente** — sem registo, sem contexto técnico, sem tracking de resolução
- Logs estão dispersos em **stdout de 3 processos PM2** — diagnosticar um problema exige SSH + `grep` manual
- Sem visão centralizada de erros ou saúde do sistema
- Erros de consola do browser **perdem-se** — quando o utilizador descreve "deu erro", não há contexto técnico

---

## Solução

Dois módulos acessíveis a **todos os utilizadores** via menu Blimunda:

1. **Bug Reports** — Qualquer utilizador reporta bugs in-app com captura automática de contexto técnico (URL, browser, erros de consola) e anexos genéricos. Todos podem ver o estado dos seus reports; admin gere todos.
2. **Visualizador de Logs** — Consulta centralizada de logs dos 4 serviços (Next.js FE, Express BE, FastAPI AI, Wiki Engine) numa interface terminal-like sem precisar de SSH.

---

## Decisões de produto

| Decisão | Escolha | Justificação |
|---------|---------|--------------|
| **Quem reporta** | Qualquer utilizador autenticado | Reduz fricção; 2 utilizadores por agora |
| **Quem vê bugs** | Todos vêem todos os reports | Transparência total; contexto familiar de 2 users |
| **Anexos** | Upload múltiplo opcional (dropzone, max 3 ficheiros, 5 MB cada) | Screenshots, PDFs, logs exportados — não só imagens |
| **Console errors** | Auto-captura últimos 5 `console.error()` | Contexto técnico sem esforço do utilizador |
| **Acesso UI** | Dentro do menu Blimunda (`/blimunda/bugs`, `/blimunda/logs`) | Centraliza ferramentas operacionais no hub da Blimunda |
| **Logs: serviços** | 4 serviços: Frontend, Backend, AI Layer, Wiki | Cobertura completa da stack |
| **Logs backend** | Leitura de ficheiros PM2 via `fs` | Já existem em `~/.pm2/logs/` — sem setup adicional |
| **Log retention** | Últimas 500 linhas por serviço | Limita payload; PM2 gere rotação de ficheiros |
| **Real-time** | Polling 10s (toggle) | Simples; WebSocket seria overkill para 2 users |
| **Notificação admin** | Push quando bug é reportado | Admin deve saber imediatamente |

---

## Modelo de dados

```sql
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,                       -- URL onde ocorreu o bug (auto-captura)
  browser_info JSONB,                  -- { userAgent, viewport: {w,h}, platform, language }
  attachments JSONB DEFAULT '[]',       -- [{ filename, path, size, mime_type }] (max 3 ficheiros)
  console_errors JSONB,                -- últimos 5 erros: [{ message, stack, timestamp }]
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix')),
  priority VARCHAR(10) DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes TEXT,                    -- resposta/resolução do admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_bug_reports_status ON bug_reports (status) WHERE status != 'resolved';
CREATE INDEX idx_bug_reports_user ON bug_reports (reported_by, created_at DESC);
```

---

## API REST

### Bug Reports

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/bugs` | user | Criar report (multipart com anexos opcionais, max 3×5 MB) |
| `GET` | `/api/bugs` | user | Listar reports — todos os utilizadores vêem todos os reports (filtros: `?status=&from=&to=&priority=`) |
| `GET` | `/api/bugs/:id` | user | Detalhes de um report |
| `PATCH` | `/api/bugs/:id` | admin | Mudar status, prioridade, admin_notes |
| `DELETE` | `/api/bugs/:id` | admin | Soft delete |
| `GET` | `/api/bugs/count` | user | `{ open, acknowledged, in_progress }` para badge |

### Logs

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/api/admin/logs` | admin | `?service=frontend\|backend\|ai-layer\|wiki&lines=200&level=error&search=texto` |

---

## User Stories

### OPS30.1 — Modelo `bug_reports` + API · **1 SP** · 🟦 BE

**Acceptance Criteria:**
- [ ] Migration cria tabela `bug_reports` com schema descrito
- [ ] `POST /api/bugs` aceita `title`, `description`, preenche automaticamente `page_url`, `browser_info`, `console_errors` do body
- [ ] `POST /api/bugs` aceita upload multipart de até 3 anexos (max 5 MB cada, qualquer tipo: imagens, PDFs, logs, etc.)
- [ ] Anexos guardados em `uploads/bugs/{bugId}/{filename}` com metadata em campo JSONB `attachments`
- [ ] `GET /api/bugs` retorna lista paginada de todos os reports; filtros por status/data/prioridade
- [ ] `GET /api/bugs/:id` retorna detalhes de qualquer report
- [ ] `PATCH /api/bugs/:id` actualiza status, prioridade, admin_notes, e `resolved_at` quando status → resolved
- [ ] Ao criar bug, cria notificação in-app + push para admin (reusa `createNotification` existente)
- [ ] Validação: title 5-200 chars, description 10-5000 chars

**Subtasks:**
- Criar migration `bug_reports`
- Criar repo `BugReportRepository` com métodos CRUD + `countByStatus()`
- Criar handlers REST com validação
- Criar função de upload de anexos (multipart, max 3 ficheiros × 5 MB)
- Trigger notificação push para admin ao criar report

---

### OPS30.2 — FE: Página de bug reports `/blimunda/bugs` + formulário · **1 SP** · 🟩 FE

**Acceptance Criteria:**
- [ ] Página `/blimunda/bugs` acessível a todos os utilizadores autenticados (dentro do menu Blimunda)
- [ ] Lista todos os bugs reportados (sem filtro por utilizador)
- [ ] Cada bug mostra: título, status (badge), prioridade, data, nº de anexos
- [ ] Expandir → detalhes, admin_notes (se existir), anexos inline
- [ ] Botão "Reportar Bug" abre modal `<ReportBugModal />` com campos: título (input), descrição (textarea), anexos (dropzone, max 3 ficheiros)
- [ ] Auto-captura no momento de abrir o modal: `window.location.href`, `navigator.userAgent`, viewport size
- [ ] Interceptação global de `console.error()` que guarda últimos 5 erros num buffer circular (implementar em layout raiz)
- [ ] Ao submeter, envia tudo ao `POST /api/bugs` (multipart com anexos)
- [ ] Toast "Bug reportado com sucesso ✓" após submit
- [ ] Campo de descrição tem placeholder orientador: "Descreve o que fizeste, o que esperavas, e o que aconteceu"
- [ ] Botão desabilitado durante submit (evita duplicados)
- [ ] Atalho rápido: botão 🐛 no header (junto ao `ThemeToggle`) abre modal directamente de qualquer página

**Subtasks:**
- Criar página `/blimunda/bugs/page.tsx`
- Criar componente `<ReportBugModal />` com formulário e dropzone multi-ficheiro
- Criar componente `<ReportBugButton />` (ícone 🐛, 8×8 Tailwind, no header) que abre modal
- Implementar `ConsoleErrorCapture` — wrapper global que intercepta `console.error` e guarda em `window.__bugReportErrors`
- Adicionar funções `reportBug(data)`, `fetchBugs()` em `api.ts`
- Adicionar sub-rota ao menu Blimunda

---

### OPS30.3 — Admin: gestão avançada de bugs (vista admin em `/blimunda/bugs`) · **1 SP** · 🟩 FE

**Acceptance Criteria:**
- [ ] Na mesma página `/blimunda/bugs`, admin vê colunas adicionais: browser info resumido
- [ ] Filtros avançados (admin only): período (date range)
- [ ] Expandir row (admin) → descrição completa, browser info formatado, console errors (code block), anexos (preview inline para imagens, download para outros)
- [ ] Acções inline (admin only): dropdown status (Open → Acknowledged → In Progress → Resolved / Won't Fix)
- [ ] Campo de admin notes editável ao expandir (admin only)
- [ ] Badge no menu Blimunda com contagem de bugs open + acknowledged
- [ ] Ordenação por data (mais recentes primeiro) ou por prioridade

**Subtasks:**
- Estender página `/blimunda/bugs/page.tsx` com vista admin condicional (`isAdmin`)
- Criar componente `<BugReportTable />` com expand/collapse rows e colunas condicionais
- Criar componente `<BugStatusBadge />` com cores por status
- Criar componente `<BugPriorityBadge />`
- Adicionar `fetchAllBugs()`, `updateBug()`, `fetchBugCount()` em `api.ts`
- Badge no link Blimunda (`AppShell`) quando há bugs por tratar

---

### OPS30.4 — Log aggregation endpoint · **1 SP** · 🟦 BE

**Acceptance Criteria:**
- [ ] `GET /api/admin/logs` retorna logs do serviço especificado
- [ ] Parâmetros: `service` (frontend|backend|ai-layer|wiki), `lines` (default 200, max 500), `level` (filtro mínimo: error|warn|info|debug), `search` (texto livre)
- [ ] Lê ficheiros PM2: `~/.pm2/logs/{service}-out.log` e `{service}-error.log`
- [ ] Parsing de cada linha: extrai timestamp, nível (regex para ERROR/WARN/INFO/DEBUG), mensagem
- [ ] Retorna `{ logs: [{ timestamp, level, service, message, raw }], total, truncated }`
- [ ] Se ficheiro não existir, retorna array vazio com `warning: "Log file not found"`
- [ ] Protegido: apenas admin

**Fontes de logs configuráveis:**

```typescript
const LOG_SOURCES = {
  frontend: {
    out: path.join(process.env.HOME, '.pm2/logs/frontend-out.log'),
    error: path.join(process.env.HOME, '.pm2/logs/frontend-error.log'),
  },
  backend: {
    out: path.join(process.env.HOME, '.pm2/logs/backend-out.log'),
    error: path.join(process.env.HOME, '.pm2/logs/backend-error.log'),
  },
  'ai-layer': {
    out: '/var/log/ai-layer/out.log',   // ou journalctl fallback
    error: '/var/log/ai-layer/error.log',
  },
  wiki: {
    out: path.join(process.env.HOME, '.pm2/logs/wiki-out.log'),
    error: path.join(process.env.HOME, '.pm2/logs/wiki-error.log'),
  },
};
```

**Parsing de nível (regex):**
```
/\b(ERROR|WARN|INFO|DEBUG)\b/i     → extrai nível
/^\[(.*?)\]/                         → extrai timestamp se formato [ISO]
```

**Subtasks:**
- Criar handler `GET /api/admin/logs` com guard admin
- Implementar `readLogTail(filePath, lines)` — lê últimas N linhas de ficheiro (eficiente, sem ler tudo)
- Implementar `parseLogLine(raw)` — extrai timestamp + level + message
- Implementar filtros: `level` (mostra >= nível), `search` (substring case-insensitive)
- Configurar paths via env vars como fallback (`LOG_PATH_FRONTEND`, etc.)
- Tratar ficheiros inexistentes gracefully

---

### OPS30.5 — Visualizador de logs `/blimunda/logs` · **1 SP** · 🟩 FE

**Acceptance Criteria:**
- [ ] Página `/blimunda/logs` acessível apenas para admin (guard `isAdmin`)
- [ ] 4 tabs: **Frontend** · **Backend** · **AI Layer** · **Wiki** (ou vista unificada com filtro)
- [ ] Interface terminal-like: fundo escuro, fonte monospace, cores por nível:
  - 🔴 ERROR (vermelho/red-400)
  - 🟡 WARN (amarelo/yellow-400)
  - ⚪ INFO (branco/gray-200)
  - 🔵 DEBUG (cinza/gray-500)
- [ ] Filtros: nível mínimo (dropdown: All/Debug/Info/Warn/Error), texto livre (search input)
- [ ] Últimas 200 linhas (default) com botão "Carregar mais" (+200)
- [ ] Toggle "Auto-refresh" — quando on, poll cada 10s e append novas linhas
- [ ] Botão "Copiar logs" → clipboard (todas as linhas visíveis)
- [ ] Timestamps em formato relativo ("há 2min") com tooltip para absoluto
- [ ] Scroll automático para baixo quando auto-refresh está on
- [ ] Loading skeleton enquanto logs carregam

**Subtasks:**
- Criar página `/blimunda/logs/page.tsx` (guard admin)
- Criar componente `<LogViewer />` com terminal-like styling
- Criar componente `<LogLine />` com cor por nível
- Implementar tab switching entre 4 serviços
- Implementar auto-refresh com `setInterval` + toggle
- Adicionar `fetchLogs(service, lines, level, search)` em `api.ts`
- Adicionar sub-rota `/blimunda/logs` ao menu Blimunda (visível apenas para admin)

---

## Integrações

### Com sistema de notificações (Epic 5.3)
- Novo tipo de notificação: `bug_report`
- Ao criar bug → notificação in-app + push para todos os admins
- Ao resolver bug → notificação in-app para quem reportou ("O teu bug 'X' foi resolvido")

### Com Blimunda (Epic 19)
- **Futuro (out of scope MVP):** Tool `report_bug(title, description)` — reportar bug via chat
- **Futuro:** Tool `get_system_health()` — resumo de erros recentes dos logs

---

## Out of scope

- **Error tracking (Sentry-like):** Source maps, stack traces de produção, alertas automáticos — avaliar se volume de erros justificar
- **Log streaming (WebSocket):** Polling 10s é suficiente para 2 users
- **Log rotation / archival:** PM2 já gere isto
- **Request ID correlation:** Rastrear request FE→BE→AI — tech debt futuro (mencionado no backlog)
- **Structured logging (Winston/Pino):** Melhorar logs do BE é tech debt separado, não bloqueia este epic

---

## Estimativas detalhadas

| Story | FE | BE | Total |
|-------|----|----|-------|
| OPS30.1 Modelo + API | — | 1 SP | 1 SP |
| OPS30.2 Botão + Modal | 1 SP | — | 1 SP |
| OPS30.3 Admin Bugs | 1 SP | — | 1 SP |
| OPS30.4 Log Aggregation | — | 1 SP | 1 SP |
| OPS30.5 Log Viewer | 1 SP | — | 1 SP |
| **Total** | **3 SP** | **2 SP** | **5 SP** |

---

## Componentes FE a criar

| Componente | Localização | Reutiliza |
|------------|-------------|-----------|
| `ReportBugButton` | `src/components/ReportBugButton.tsx` | Padrão `ThemeToggle` (ícone 8×8, header) |
| `ReportBugModal` | `src/components/ReportBugModal.tsx` | Padrão `CreateProjectModal`, dropzone multi-ficheiro |
| `BugReportTable` | `src/app/blimunda/bugs/page.tsx` | Vista user + vista admin condicional |
| `BugStatusBadge` | `src/components/BugStatusBadge.tsx` | — |
| `BugPriorityBadge` | `src/components/BugPriorityBadge.tsx` | — |
| `LogViewer` | `src/components/LogViewer.tsx` | — |
| `LogLine` | `src/components/LogLine.tsx` | — |

---

## Demo de aceitação

1. Como utilizador normal, clicar no botão 🐛 no header → modal abre com URL auto-preenchida.
2. Preencher título "Botão de partilhar não funciona", descrição, anexar screenshot + ficheiro de texto com passos → submeter → toast ✓.
3. Utilizador navega a `/blimunda/bugs` → vê todos os reports incluindo o seu com status "Open" e 2 anexos.
4. Admin recebe push notification "Novo bug reportado: Botão de partilhar não funciona".
6. Expandir → ver browser info (Chrome 125, macOS, 1440×900), console errors (se existirem), anexos (preview imagem inline, download para PDF).
7. Admin muda status para "Acknowledged", adiciona nota "Vou verificar amanhã" → salva.
8. Qualquer utilizador abre `/blimunda/bugs` → vê nota do admin no report.
9. Admin abre `/blimunda/logs` → 4 tabs: Frontend · Backend · AI Layer · Wiki.
10. Tab "Backend" → vê logs em tempo real com cores por nível.
11. Filtrar por "ERROR" → apenas linhas vermelhas visíveis.
12. Pesquisar "auth" → filtra linhas que contêm "auth".
13. Toggle auto-refresh on → logs actualizam a cada 10s.
14. Admin resolve bug → utilizador que reportou recebe notificação "Bug resolvido".
