# Deploy na VPS (manual)

## Pré-requisitos

- Node 20+, `git` e `pm2` (`npm i -g pm2`).
- Portas `3001` (API + Socket.IO) e `5173` (painel) liberadas no firewall.
- Um **número de WhatsApp dedicado**, não o comercial principal.

## Passos

```bash
# 1. Código
git clone <repo> quanto-to-valendo-whatsapp
cd quanto-to-valendo-whatsapp

# 2. Backend
cd backend
cp .env.example .env      # ANTHROPIC_API_KEY, ADMIN_TOKEN (forte), MODELO_AGENTE, PORT=3001
npm install
cd ..

# 3. Painel (as VITE_* entram em build-time!)
cd frontend
cp .env.example .env      # VITE_API_URL / VITE_SOCKET_URL = http://<IP_OU_DOMINIO>:3001
npm install
npm run build
cd ..

# 4. Subir com pm2
pm2 start ecosystem.config.cjs
pm2 save                  # e `pm2 startup` uma vez, para sobreviver a reboot
pm2 logs
```

O `ecosystem.config.cjs` sobe dois processos:

- **`qtv-backend`**: `backend/src/server.js` com cwd `./backend` (para o `dotenv` achar o `.env`), `autorestart` e `max_restarts: 20`.
- **`qtv-frontend`**: `pm2 serve` de `frontend/dist` na porta 5173, em modo SPA.

Para gerar um `ADMIN_TOKEN` forte: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Acessos

- Painel: `http://<IP_OU_DOMINIO>:5173` (login com o `ADMIN_TOKEN`).
- Health: `http://<IP_OU_DOMINIO>:3001/health`.
- Primeiro número: Painel → **Conexões → Nova conexão → Conectar** → no celular, WhatsApp › **Aparelhos conectados** › escanear o QR.

## Validação depois do deploy

```bash
cd backend && npm run exemplo   # confirma chave + modelo (gasta API)
```

Depois, mande um PDF de currículo para o número conectado e confira as 5 mensagens com "digitando..." entre elas.

## Atualizações

```bash
git pull
(cd backend && npm install)
(cd frontend && npm install && npm run build)
pm2 restart ecosystem.config.cjs
```

## Dados e segredos

- `backend/.env`: chave da API e token. Nunca vai para o git.
- `backend/data/app.db`: conversas e configurações (SQLite).
- `backend/sessions/<connectionId>/`: sessões do WhatsApp. Apagar uma pasta força um novo QR para essa conexão.

Faça backup de `backend/data/` e `backend/sessions/` se quiser preservar o histórico e evitar escanear o QR de novo.
