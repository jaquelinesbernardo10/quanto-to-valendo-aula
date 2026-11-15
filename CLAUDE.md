# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado do repositório

Implementado a partir de `.llm/prd.md` (v7), que continua sendo a fonte única de verdade. Ele contém a spec completa, o dataset (Apêndice A), o schema Zod exato (Apêndice B) e o mapa de implementação por módulo (Apêndice C). A stack é fixa — não proponha alternativas. Em caso de dúvida, consulte o PRD antes de decidir.

**Idioma:** PT-BR em tudo — prompts, mensagens ao usuário, comentários, docstrings e **identificadores de código** (`analisarCurriculo`, `conversas`, `mensagens`).

## O produto em uma frase

Bot **inbound** de WhatsApp (Baileys): o usuário manda o CV (PDF ou texto ≥ 200 chars) e recebe **5 mensagens em sequência**, sempre nesta ordem — 1) Veredito (faixa salarial + senioridade), 2) Delta (R$/mês até o próximo nível), 3) Caminho/lacunas (máx. 3), 4) Plano de 90 dias, 5) resumo para LinkedIn. O PRD fala em "três atos + one more thing": Ato 1 = msg 1, Ato 2 = msg 2, Ato 3 (Caminho) = msgs 3 e 4, "one more thing" = msg 5. Entre elas: intervalo de 1,5–2,5s com "digitando...". O React é só **painel admin** (QR, histórico, toggles, prompt, modelo), não é para o usuário final.

## Comandos

O `npm test` da raiz roda só o backend (o frontend não tem testes; valide com `npm run build`). A suíte não usa rede nem API.

```bash
# raiz
npm run backend                     # backend em dev (porta 3001)
npm run frontend                    # painel Vite (porta 5173, --host)
npm test                            # Vitest do backend

# backend/
npm test                            # vitest run
npm run test:watch
npx vitest run test/tools.test.js   # um arquivo de teste
npx vitest run -t "staff"           # testes cujo nome casa com o padrão
npm run exemplo                     # smoke com análise real (gasta API; precisa de ANTHROPIC_API_KEY)

# frontend/
npm run build                       # VITE_* entram em BUILD-TIME: rebuildar sempre que o IP/domínio mudar

# deploy (VPS)
pm2 start ecosystem.config.cjs      # qtv-backend (cwd ./backend) + qtv-frontend (serve frontend/dist, SPA)
```

Versões exatas das dependências: PRD §2.1. Env vars: PRD §7 (`backend/.env`: `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`, `MODELO_AGENTE`, `PORT`; `frontend/.env`: `VITE_API_URL`, `VITE_SOCKET_URL`).

## Arquitetura

Backend ESM (`"type": "module"`) em `backend/src/`, organizado em camadas com **regra de dependência validada por teste** (`test/dependencia.test.js`):

- `core/` — o cérebro (agente, tool, schema, prompts, extração de PDF via `pdf-parse`, erros de domínio `PDFSemTextoError`/`PerfilSemMatchError`). **Não importa** `managers/`, `routes/`, `renderers/` nem `db/`. O override do system prompt chega a `getSystemPrompt(override)` **por parâmetro**, nunca importando o repositório.
- `renderers/whatsappRenderer.js` — `AnaliseCompleta` → array de 5 mensagens. Importa **só** `core/schema.js`. Usa formatação nativa do WhatsApp (`*negrito*`, `_itálico_`, `>`, `•`), nunca HTML nem `#`. Valores via `formatarReais()` → `R$ 12.500`.
- `managers/` — `connectionManager.js` (Baileys: `Map` de sockets, sessão em `backend/sessions/{connectionId}/`, eventos Socket.IO `qr_update` `{connectionId, qr}` (PNG base64 via `qrcode`) e `connection_status` `{connectionId, status: connecting|open|close|qr}`) e `messageHandler.js` (orquestra filtros → persistência → análise → envio).
- `db/` — SQLite (`better-sqlite3`) em `backend/data/app.db`, migrations no boot. Tabelas: `conexoes`, `conversas`, `mensagens`, `configuracoes`.
- `routes/` + `server.js` — Express + Socket.IO; no boot roda migrations e religa conexões salvas.

Fluxo inbound (`messageHandler`, PRD §4.3): ignorar `fromMe`/grupos/broadcast/status → persistir → checar agente ativo (global **E** por conversa) → rotear (PDF / doc não-PDF / texto < 200 / currículo) → "🔍 Analisando seu currículo..." → `analisarCurriculo` → enviar os 5 atos → persistir cada envio + `conversation_update`. Trava anti-concorrência por `(connectionId, remoteJid)`. Filtros (`deveIgnorarMensagem`, `classificarConteudo`) devem ser **funções puras**, testáveis sem rede.

Agente (`core/agente.js`): loop **manual** de tool calling com `@anthropic-ai/sdk` (`consultar_faixa_salarial`), resposta final em JSON puro (fazer strip de code fence), validação Zod contra `AnaliseCompleta`, até 2 retries reenviando o erro. O client Anthropic é **injetável** (`opcoes.client`). Depois de validar, `reconciliarComTool()` recalcula `faixa_atual`, `faixa_proximo_nivel` e `delta_mensal` pela tool — os números finais nunca vêm do texto do modelo.

## Testes e injeção de dependências

- `criarMessageHandler({ repo, emitir, analisar, renderizar, extrair, baixarMidia, atraso })` e `criarServidor({ repo, adminToken, logger, criarConnectionManagerFn })` recebem tudo por parâmetro — é assim que os testes rodam sem Baileys nem API. `server.js` só faz boot quando executado diretamente.
- `test/fixtures.js`: análises prontas (`analisePleno`, `analiseStaff`), `clientFalso` (fila de respostas da API) e helpers `respostaTool`/`respostaTexto`.
- Banco em testes: `abrirBanco(':memory:')`.
- A trava anti-concorrência é um `Set` no escopo da fábrica (não do módulo) e só é liberada por quem a reservou.

## Invariantes (PRD §3 — não violar)

1. Números salariais vêm **só** da tool `consultarFaixaSalarial(cargo, senioridade)`, que lê `dados/salarios.json` (na **raiz** do repo, não em `backend/` — o backend roda com cwd `./backend`, então resolva o caminho a partir do arquivo, não do cwd); chamada ao menos 2× por análise (nível atual + próximo). `delta_mensal` = diferença das medianas. Sem match → recorte mais próximo com `match_exato=false`; `staff` sempre cai em `Geral (todas as funções)`.
2. `dados/salarios.json` é asset estático (copiar exatamente do Apêndice A). Sem RAG.
3. Saída sempre validada por Zod (schema exato no Apêndice B).
4. Atos sempre na ordem (as 5 mensagens acima). Staff: `faixa_proximo_nivel=null`, `delta_mensal=null`, e o Ato 2 vira reconhecimento — nunca some.
5. `gap_para_proximo_nivel` tem no máximo 3 itens.
6. Isolamento por `(connection_id, remote_jid)`: **nenhuma variável de módulo com dados de CV/usuário** — só dados imutáveis (client Anthropic, dataset).
7. Modelo default `claude-haiku-4-5`; sobrescrito pela config do painel (banco) ou `MODELO_AGENTE`.
8. `ANTHROPIC_API_KEY` só no backend; nunca no frontend nem em logs.

## Outras regras não óbvias

- **Auth:** header `X-Admin-Token` == `ADMIN_TOKEN` em **todas** as rotas `/api/*` e no handshake do Socket.IO. `/health` fica aberto. CORS aceita qualquer origin.
- **Baileys é CJS:** `makeWASocket` é import **default**; `useMultiFileAuthState`, `DisconnectReason`, `Browsers`, `downloadMediaMessage` são imports **nomeados**.
- Reconexão: `loggedOut` limpa a sessão; outros motivos religam sem novo QR; desconexão manual **não** religa.
- Números para o usuário em linguagem humana: nunca "percentil"; p25–p75 = "a maioria ganha entre X e Y", mediana = "o valor típico". Sem saudação genérica.
- Erros nunca chegam crus ao usuário do WhatsApp (PDF sem texto, doc não-PDF, texto curto → orientação amigável). Textos fixos do bot ficam em `TEXTOS` no `messageHandler.js`.
- **pdf-parse:** importar `pdf-parse/lib/pdf-parse.js` (o index roda um self-test) e passar `new Uint8Array(buffer)` — o pdf.js lê `buffer.buffer` ignorando `byteOffset`, e Buffers < 4 KB do Node são fatias do pool compartilhado.
- Modelos aceitos no painel: lista `MODELOS_VALIDOS` em `routes/settings.js`. Config do painel é lida **a cada análise** (vale sem restart).
- **Fora do escopo:** disparos em massa, campanhas, agendamento, fila (BullMQ), RAG, gráficos, multi-tenant, deploy automatizado.
- Painel: tema dark (`#25D366` sobre `#0d1117`/`#161b22`), rotas `/connections`, `/conversations`, `/settings`, login por token em memória.
