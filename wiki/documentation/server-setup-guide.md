# Guia de Configuração do Servidor: Clouding.io para Produção

## Visão Geral

Este guia leva-te desde um servidor VPS virgem no Clouding.io até uma aplicação Next.js completamente funcional em produção com PostgreSQL, HTTPS, backups automáticos, e monitoring básico. Cada passo inclui comandos exactos, explicações do que estão a fazer, e como verificar se funcionou correctamente.

O processo completo demora aproximadamente duas a três horas se seguires linearmente sem problemas. Se encontrares issues, pode demorar mais, mas este guia inclui troubleshooting para os problemas mais comuns.

## Pré-requisitos

Antes de começar, certifica-te que tens:

- Conta no Clouding.io criada e verificada
- Método de pagamento configurado na conta
- Domínio registado (ou subdomínio se vais usar domínio existente)
- Acesso SSH configurado no teu computador local
- Código da aplicação num repositório Git (GitHub, GitLab, ou similar)

## Fase 1: Criar e Configurar o Servidor VPS

### Passo 1.1: Criar o Servidor no Clouding.io

Acede ao painel de controlo do Clouding.io e clica em "Criar Servidor" ou "Create Server". Vais ver várias opções de configuração que precisas de escolher cuidadosamente.

**Escolher a Localização do Datacenter:**
Escolhe o datacenter geograficamente mais próximo dos teus utilizadores principais. Se os teus utilizadores estão principalmente em Portugal, escolhe Madrid ou outro datacenter europeu próximo. Latência de rede menor resulta em aplicação mais responsiva.

**Escolher o Sistema Operativo:**
Selecciona Ubuntu Server 24.04 LTS (Long Term Support). A versão LTS é importante porque recebe updates de segurança por cinco anos, versus versões não-LTS que têm suporte muito mais curto. Ubuntu é amplamente usado, bem documentado, e tem comunidade enorme, tornando troubleshooting mais fácil.

**Escolher as Especificações do Servidor:**
Para o MVP com dois utilizadores, recomendo começar com configuração modesta mas não a mais básica:
- **CPU:** 2 cores
- **RAM:** 4 GB
- **Storage:** 80 GB SSD
- **Bandwidth:** Ilimitado ou pelo menos 2 TB/mês

Esta configuração custa aproximadamente vinte a trinta euros mensais e é mais que suficiente para começar. Podes fazer upgrade depois se necessário, mas downgrade é mais complicado, portanto melhor começar conservador.

**Configurar Autenticação SSH:**
Na secção de autenticação, **fortemente recomendo usar chaves SSH em vez de password**. Passwords podem ser adivinhadas através de brute force attacks, enquanto chaves SSH são praticamente impossíveis de quebrar.

Se ainda não tens par de chaves SSH no teu computador local, precisas de gerar antes de continuar. No teu terminal local (Mac/Linux) ou Git Bash (Windows), executa:

```bash
# Gerar par de chaves SSH
ssh-keygen -t ed25519 -C "seu-email@exemplo.com"

# Quando perguntado onde salvar, pressiona Enter para aceitar localização default
# Quando perguntado por passphrase, podes deixar vazio ou criar uma para segurança extra

# Ver a chave pública que vais copiar para Clouding.io
cat ~/.ssh/id_ed25519.pub
```

Copia toda a saída do último comando (começa com `ssh-ed25519` e termina com teu email). No painel do Clouding.io, cola esta chave pública no campo apropriado. Isto permite que te conectes ao servidor usando tua chave privada sem necessitar de password.

**Hostname e Nome:**
Dá um nome descritivo ao servidor como `nexo-production` ou `plataforma-gestao-prod`. Este nome é apenas para tua referência no painel, não afecta funcionamento.

**Confirmar e Criar:**
Revê todas as configurações, confirma que está tudo correcto, e clica no botão final para criar o servidor. O Clouding.io vai provisionar a máquina virtual, o que normalmente demora entre dois a cinco minutos.

### Passo 1.2: Obter e Testar Acesso SSH

Quando o servidor terminar de provisionar, o Clouding.io mostra-te o endereço IP público do servidor. Anota este IP porque vais precisar dele muitas vezes. Vamos chamar-lhe `<SERVER_IP>` neste documento, mas substitui sempre com o IP real tipo `185.xxx.xxx.xxx`.

Testa a conexão SSH ao servidor:

```bash
# Conectar ao servidor pela primeira vez
ssh root@<SERVER_IP>

# Exemplo com IP real:
# ssh root@185.123.456.789
```

Na primeira conexão, vais ver aviso sobre authenticity do host que ainda não foi verificado. Isto é normal. Verifica que o fingerprint mostrado corresponde ao que aparece no painel do Clouding.io (eles mostram o fingerprint do servidor), e se sim, escreve `yes` para aceitar e continuar.

Se a conexão for bem-sucedida, vais ver o prompt do servidor que parece algo como `root@nexo-production:~#`. Isto significa que estás conectado como utilizador root no servidor. Se a conexão falhar, verifica que copiaste a chave SSH pública correctamente no painel do Clouding.io.

### Passo 1.3: Actualizar o Sistema

A primeira coisa a fazer num servidor novo é actualizar todos os packages para versões mais recentes que incluem patches de segurança. Ainda conectado como root via SSH, executa:

```bash
# Actualizar lista de packages disponíveis
apt update

# Upgrade de todos os packages instalados para versões mais recentes
apt upgrade -y

# O -y responde automaticamente "yes" a prompts de confirmação
```

Este processo pode demorar alguns minutos dependendo de quantos packages precisam de actualização. Quando terminar, vais ver mensagem de sucesso e voltar ao prompt.

Alguns packages podem mostrar avisos sobre serviços que precisam de ser reiniciados. Normalmente é seguro aceitar os defaults. Se perguntado sobre manter configurações existentes versus usar versões novas dos maintainers, geralmente é seguro manter as existentes a menos que tenhas razão específica para mudar.

### Passo 1.4: Configurar Firewall UFW

Ubuntu inclui UFW (Uncomplicated Firewall) que facilita gestão de firewall. Por default, firewall não está activo, o que significa que todas as portas estão abertas - perigoso em servidor de produção. Vamos configurar firewall para permitir apenas tráfego necessário.

```bash
# Permitir conexões SSH (porta 22) - CRÍTICO fazer isto antes de activar firewall
ufw allow 22/tcp

# Permitir conexões HTTP (porta 80) para o servidor web
ufw allow 80/tcp

# Permitir conexões HTTPS (porta 443) para tráfego encriptado
ufw allow 443/tcp

# Permitir porta do Wiki.js (apenas se acedido directamente, não necessário se usas Nginx)
# ufw allow 8080/tcp

# Activar o firewall
ufw enable

# Verificar status e regras activas
ufw status verbose
```

**AVISO IMPORTANTE:** Se activares o firewall sem primeiro permitir SSH (porta 22), vais perder acesso ao servidor e terás que resetá-lo através do painel do Clouding.io. Sempre permite SSH antes de activar firewall.

O output de `ufw status verbose` deve mostrar que o firewall está activo e listagem das regras que criaste. Deverás ver três regras permitindo portas 22, 80 e 443 para tráfego de entrada.

### Passo 1.5: Criar Utilizador Não-Root

Trabalhar como root é perigoso porque tens permissões ilimitadas e um erro pode destruir o sistema. Melhor prática é criar utilizador normal para trabalho diário e usar `sudo` apenas quando precisas de permissões elevadas.

```bash
# Criar novo utilizador chamado 'deploy'
# Podes escolher nome diferente se preferires
adduser deploy

# Vais ser perguntado por password - escolhe uma forte e guarda-a
# Vais ser perguntado por informação adicional como nome completo - podes deixar em branco pressionando Enter
```

Após criar o utilizador, precisas de dar-lhe capacidade de usar `sudo` para executar comandos que requerem privilégios de root:

```bash
# Adicionar utilizador ao grupo sudo
usermod -aG sudo deploy
```

Agora precisas de configurar autenticação SSH para este novo utilizador de forma que possas fazer login directamente como `deploy` sem ter que passar por root primeiro:

```bash
# Mudar para o utilizador deploy temporariamente
su - deploy

# Criar directório .ssh na home do utilizador
mkdir -p ~/.ssh

# Definir permissões correctas no directório (importante para SSH funcionar)
chmod 700 ~/.ssh

# Criar ficheiro authorized_keys onde vão as chaves públicas
touch ~/.ssh/authorized_keys

# Definir permissões correctas no ficheiro
chmod 600 ~/.ssh/authorized_keys

# Voltar para root
exit
```

Agora copia a mesma chave pública SSH que usaste para root para o novo utilizador:

```bash
# Copiar chave pública de root para deploy
cat /root/.ssh/authorized_keys > /home/deploy/.ssh/authorized_keys

# Ajustar ownership do ficheiro para o utilizador deploy
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

Testa a conexão SSH com o novo utilizador. **Importante:** Abre nova janela de terminal no teu computador local (não feches a conexão root existente ainda, por segurança). Na nova janela:

```bash
# Conectar como utilizador deploy
ssh deploy@<SERVER_IP>
```

Se conseguires conectar e vires prompt como `deploy@nexo-production:~$`, perfeito. Testa também que sudo funciona:

```bash
# Testar sudo
sudo ls /root

# Vais ser perguntado pela password do utilizador deploy
# Se funcionar, vais ver conteúdo do directório /root
```

Se tudo funciona, podes fechar a sessão root e a partir de agora trabalhar sempre como utilizador deploy.

### Passo 1.6: Desabilitar Login Root via SSH (Opcional mas Recomendado)

Para segurança adicional, podes desabilitar completamente login SSH como root. Isto força que qualquer pessoa querendo acesso administrativo tenha que primeiro login como utilizador normal e depois usar sudo, criando camada extra de segurança e auditoria.

```bash
# Editar configuração do SSH
sudo nano /etc/ssh/sshd_config

# Procura pela linha que diz:
# PermitRootLogin yes

# Muda para:
# PermitRootLogin no

# Salva (Ctrl+O, Enter) e sai (Ctrl+X)

# Reiniciar serviço SSH para aplicar mudanças
sudo systemctl restart sshd
```

**AVISO:** Só faz isto depois de confirmar que consegues login como utilizador deploy e que sudo funciona. Se desabilitares root login antes de ter utilizador alternativo funcional, perdes acesso ao servidor.

## Fase 2: Instalar Dependências de Software

Agora que o servidor base está seguro e configurado, vamos instalar todo o software necessário para correr a aplicação.

### Passo 2.1: Instalar Node.js

A tua aplicação Next.js precisa de Node.js para executar. Vamos instalar usando NodeSource, que fornece versões mais recentes que os repositórios default do Ubuntu.

```bash
# Download e execução do script de setup do NodeSource para Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js
sudo apt install -y nodejs

# Verificar instalação
node --version  # Deve mostrar v20.x.x
npm --version   # Deve mostrar 10.x.x
```

Se vires números de versão, Node.js está instalado correctamente. A versão 20 é LTS (Long Term Support) o que significa que receberá updates por vários anos.

### Passo 2.2: Instalar PostgreSQL

PostgreSQL é a base de dados que armazena todos os dados da aplicação.

```bash
# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verificar que PostgreSQL está a correr
sudo systemctl status postgresql

# Deve mostrar "active (running)" em verde
```

Após instalação, PostgreSQL cria automaticamente um utilizador de sistema chamado `postgres` que é o super-utilizador da base de dados. Vamos usá-lo para criar a base de dados e utilizador da aplicação:

```bash
# Mudar para o utilizador postgres
sudo -i -u postgres

# Entrar no shell do PostgreSQL
psql

# Agora estás no prompt do PostgreSQL (parece "postgres=#")

# Criar base de dados para a aplicação
CREATE DATABASE nexo_production;

# Criar utilizador para a aplicação com password forte
# SUBSTITUI 'strong_password_here' por password real que vais guardar
CREATE USER nexo_user WITH PASSWORD 'strong_password_here';

# Dar permissões completas ao utilizador na base de dados
GRANT ALL PRIVILEGES ON DATABASE nexo_production TO nexo_user;

# Dar permissões no schema public (necessário no PostgreSQL 15+)
\c nexo_production
GRANT ALL ON SCHEMA public TO nexo_user;

# Sair do psql
\q

# Voltar para utilizador deploy
exit
```

Anota as credenciais da base de dados porque vais precisar delas nas variáveis de ambiente:
- **Database:** nexo_production
- **User:** nexo_user
- **Password:** (a que definiste)
- **Host:** localhost
- **Port:** 5432 (default do PostgreSQL)

### Passo 2.3: Instalar Nginx

Nginx vai funcionar como reverse proxy, recebendo requests HTTP/HTTPS e encaminhando-os para a aplicação Next.js que corre numa porta interna. Também vai gerir os certificados SSL.

```bash
# Instalar Nginx
sudo apt install -y nginx

# Verificar que está a correr
sudo systemctl status nginx
```

Se visitares `http://<SERVER_IP>` no teu browser agora, deves ver a página default "Welcome to nginx". Isto confirma que Nginx está instalado e acessível.

### Passo 2.4: Instalar Certbot para SSL

Certbot é ferramenta que automatiza obtenção e renovação de certificados SSL gratuitos da Let's Encrypt.

```bash
# Instalar Certbot e plugin Nginx
sudo apt install -y certbot python3-certbot-nginx

# Verificar instalação
certbot --version
```

Vamos configurar SSL depois de fazer deploy da aplicação e configurar DNS, porque Let's Encrypt precisa de verificar que controlas o domínio.

### Passo 2.5: Instalar Git

Git permite fazer clone do repositório de código no servidor.

```bash
# Instalar Git
sudo apt install -y git

# Verificar instalação
git --version

# Configurar Git com teu nome e email (usado em commits)
git config --global user.name "Teu Nome"
git config --global user.email "teu-email@exemplo.com"
```

### Passo 2.6: Instalar PM2

PM2 é process manager que mantém a aplicação Node.js a correr, reinicia automaticamente se crashar, e facilita gestão de logs.

```bash
# Instalar PM2 globalmente via npm
sudo npm install -g pm2

# Verificar instalação
pm2 --version

# Configurar PM2 para iniciar automaticamente quando servidor reiniciar
pm2 startup systemd

# Isto mostra comando que precisas executar - copia e executa
# Será algo como: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
```

## Fase 3: Deploy da Aplicação

# Guia de Configuração do Servidor: Frontend + Backend Separados

## Visão Geral da Arquitectura

Este guia configura servidor VPS no Clouding.io com:
- **Backend:** Node.js com Fastify na porta 3001
- **Frontend:** Next.js (SSR) na porta 3000
- **Nginx:** Reverse proxy que roteia requests
- **PostgreSQL:** Base de dados para o backend
- **PM2:** Process manager para ambas as aplicações

Ambas as aplicações correm no mesmo servidor mas em processos separados, geridos independentemente pelo PM2.

## Fases 1 e 2: Igual ao Guia Anterior

As Fases 1 (Criar e Configurar Servidor) e 2 (Instalar Dependências) são exactamente iguais ao guia anterior. Segue esses passos até ter:
- Servidor criado e seguro
- Node.js, PostgreSQL, Nginx, Certbot, Git e PM2 instalados

## Fase 3: Deploy das Aplicações (CORRIGIDO)

### Passo 3.1: Preparar Estrutura de Directórios

Como tens dois repositórios, vamos organizar claramente:

```bash
# Criar directório para aplicações
mkdir -p ~/apps

# Estrutura final será:
# ~/apps/
#   ├── backend/
#   └── frontend/
```

### Passo 3.2: Deploy do Backend

#### 3.2.1: Clone do Repositório Backend

```bash
cd ~/apps

# Clone do repositório backend
git clone <URL_DO_REPOSITORIO_BACKEND> backend

cd backend
```

**Para repositório privado:**
```bash
# Opção 1: Usando Personal Access Token
git clone https://<TOKEN>@github.com/teu-usuario/backend-repo.git backend

# Opção 2: Usando SSH (recomendado)
# Primeiro gera chave SSH no servidor se ainda não fizeste:
ssh-keygen -t ed25519 -C "deploy@servidor"
cat ~/.ssh/id_ed25519.pub
# Adiciona esta chave pública no GitHub/GitLab em Settings > SSH Keys

# Depois clone com SSH:
git clone git@github.com:teu-usuario/backend-repo.git backend
```

#### 3.2.2: Configurar Variáveis de Ambiente do Backend

```bash
cd ~/apps/backend

# Criar ficheiro de ambiente
nano .env.production
```

Adiciona as variáveis necessárias para o backend:

```bash
# Node environment
NODE_ENV=production

# Porta onde backend vai correr
PORT=3001

# Base de dados
DATABASE_URL=postgresql://nexo_user:STRONG_PASSWORD@localhost:5432/nexo_production

# Ou separado em variáveis individuais se preferires:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexo_production
DB_USER=nexo_user
DB_PASSWORD=STRONG_PASSWORD

# JWT Secrets (gera com: openssl rand -base64 32)
JWT_SECRET=gera-string-aleatoria-muito-longa-aqui
JWT_REFRESH_SECRET=outra-string-aleatoria-diferente-aqui

# URLs
# Como backend e frontend estão no mesmo servidor,
# backend não precisa saber URL do frontend geralmente
API_URL=http://localhost:3001

# CORS - permitir requests do frontend
# Se usas subdomínios: https://app.teu-dominio.com
# Se usa mesmo domínio: https://teu-dominio.com
CORS_ORIGIN=https://teu-dominio.com

# Outras variáveis específicas do teu backend
```

Salva (Ctrl+O, Enter) e fecha (Ctrl+X).

Protege o ficheiro:
```bash
chmod 600 .env.production
```

#### 3.2.3: Instalar Dependências e Executar Migrations

```bash
# Ainda em ~/apps/backend

# Instalar apenas dependências de produção
npm ci --only=production

# Se backend precisa de build (TypeScript, etc):
npm run build

# Executar migrations da base de dados
npm run migrate

# Ou se tens scripts SQL manuais:
# PGPASSWORD=STRONG_PASSWORD psql -h localhost -U nexo_user -d nexo_production -f migrations/001_initial.sql
```

Verifica que tabelas foram criadas:
```bash
PGPASSWORD=STRONG_PASSWORD psql -h localhost -U nexo_user -d nexo_production -c "\dt"
```

Deves ver listagem das tuas tabelas (users, projects, phases, tasks, etc).

#### 3.2.4: Iniciar Backend com PM2

```bash
# Iniciar backend com PM2
# Ajusta o comando de start conforme teu package.json
pm2 start npm --name "nexo-backend" -- start

# Ou se tens script específico de produção:
# pm2 start npm --name "nexo-backend" -- run start:prod

# Ou se é ficheiro JS directo:
# pm2 start dist/server.js --name "nexo-backend"

# Verificar que está a correr
pm2 status

# Ver logs
pm2 logs nexo-backend --lines 50
```

**Verificação importante:** Confirma que backend está a escutar na porta 3001:

```bash
# Verificar que porta 3001 está em uso
sudo netstat -tlnp | grep 3001

# Ou com ss:
sudo ss -tlnp | grep 3001

# Testar endpoint do backend
curl http://localhost:3001/health
# Ou qualquer endpoint público que tenhas
```

Se o backend iniciou correctamente e responde em localhost:3001, está pronto. Se há erros:

```bash
# Ver logs de erro detalhados
pm2 logs nexo-backend --err

# Ver informação completa do processo
pm2 show nexo-backend

# Se precisas reiniciar após corrigir algo:
pm2 restart nexo-backend
```

### Passo 3.3: Deploy do Frontend

#### 3.3.1: Clone do Repositório Frontend

```bash
cd ~/apps

# Clone do repositório frontend
git clone <URL_DO_REPOSITORIO_FRONTEND> frontend

cd frontend
```

#### 3.3.2: Configurar Variáveis de Ambiente do Frontend

```bash
cd ~/apps/frontend

# Criar ficheiro de ambiente
nano .env.production
```

Adiciona as variáveis do frontend:

```bash
# Node environment
NODE_ENV=production

# Porta onde frontend vai correr (opcional, Next.js usa 3000 por default)
PORT=3000

# URL pública da aplicação (o que aparece no browser)
NEXT_PUBLIC_APP_URL=https://teu-dominio.com

# URL do backend para o SERVIDOR fazer requests
# Como estão no mesmo servidor, usa localhost
API_URL=http://localhost:3001

# URL do backend para o BROWSER fazer requests
# IMPORTANTE: Esta vai ser usada pelo JavaScript no browser
# Se usas subdomínio: https://api.teu-dominio.com
# Se usa path: https://teu-dominio.com/api
NEXT_PUBLIC_API_URL=https://teu-dominio.com/api

# Outras variáveis públicas que o frontend precisa
```

**Nota importante sobre URLs:**
- `API_URL` (sem NEXT_PUBLIC): Usado por código que corre NO SERVIDOR (getServerSideProps, API routes)
- `NEXT_PUBLIC_API_URL`: Usado por código que corre NO BROWSER (fetch do cliente, axios, etc)

Salva e protege:
```bash
chmod 600 .env.production
```

#### 3.3.3: Instalar Dependências e Build

```bash
# Ainda em ~/apps/frontend

# Instalar dependências
npm ci --only=production

# Opcional -- caso falte
npm install @next/bundle-analyzer

# Build do Next.js
npm run build
```

O build pode demorar alguns minutos. Quando terminar, verifica que criou o directório `.next`.

#### 3.3.4: Iniciar Frontend com PM2

```bash
# Iniciar frontend com PM2
pm2 start npm --name "nexo-frontend" -- start

# Verificar que está a correr
pm2 status

# Ver logs
pm2 logs nexo-frontend --lines 50
```

**Verificação:** Confirma que frontend está a escutar na porta 3000:

```bash
sudo netstat -tlnp | grep 3000

# Testar localmente
curl http://localhost:3000
```

#### 3.3.5: Salvar Configuração PM2

Ambas as aplicações Node.js estão a correr. Salva antes de continuar:

```bash
pm2 save
```

### Passo 3.4: Deploy do AI Layer (FastAPI)

#### 3.4.1: Instalar Python e Dependências do Sistema

```bash
# Python 3.11+ já vem pré-instalado no Ubuntu 24.04
python3 --version

# Instalar pip e venv
sudo apt install -y python3-pip python3-venv
```

#### 3.4.2: Clone do Repositório AI

```bash
cd ~/apps

# Clone do repositório AI
git clone <URL_DO_REPOSITORIO_AI> ai

cd ai
```

#### 3.4.3: Criar Virtual Environment e Instalar Dependências

```bash
cd ~/apps/ai

# Criar virtual environment
python3 -m venv venv

# Activar venv
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt
```

#### 3.4.4: Configurar Variáveis de Ambiente do AI

```bash
cd ~/apps/ai

nano .env
```

Adiciona:

```env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://nexo_user:STRONG_PASSWORD@localhost:5432/nexo_production
BACKEND_API_URL=http://localhost:3001
JWT_SECRET=MESMO_SECRET_DO_BACKEND
```

#### 3.4.5: Testar AI Layer Manualmente

```bash
cd ~/apps/ai
source venv/bin/activate

# Testar que arranca sem erros
uvicorn app.main:app --host 127.0.0.1 --port 8001

# Ctrl+C para parar após confirmar que funciona
deactivate
```

#### 3.4.6: Iniciar AI Layer com PM2

```bash
# Iniciar com PM2 usando o Python do venv
pm2 start ~/apps/ai/venv/bin/uvicorn \
  --name "nexo-ai" \
  --cwd ~/apps/ai \
  -- app.main:app --host 127.0.0.1 --port 8001

# Verificar que está a correr
pm2 status

# Ver logs
pm2 logs nexo-ai --lines 50
```

**Verificação:** Confirma que o AI layer está a responder:

```bash
# Verificar porta 8001
sudo ss -tlnp | grep 8001

# Testar health check
curl http://127.0.0.1:8001/api/ai/health
```

#### 3.4.7: Salvar Configuração PM2 Final

Agora que as três aplicações estão a correr, salva a configuração:

```bash
# Ver lista de processos
pm2 list

# Deves ver nexo-backend, nexo-frontend e nexo-ai todos "online"

# Salvar configuração para restart automático
pm2 save

# Verificar que PM2 está configurado para auto-start no boot
pm2 startup systemd
# Executa o comando que aparece se ainda não fizeste
```

### Passo 3.5: Deploy do Wiki.js

#### 3.5.1: Clone do Repositório Wiki

```bash
cd ~/apps

# Clone do repositório wiki
git clone <URL_DO_REPOSITORIO_WIKI> wiki

cd wiki
```

#### 3.5.2: Instalar Dependências

```bash
cd ~/apps/wiki/wiki

# Instalar dependências
npm ci --legacy-peer-deps
```

#### 3.5.3: Configurar Wiki.js

O Wiki.js usa dois ficheiros de configuração:
- `wiki/config.yml` — configuração da base de dados e servidor
- `.env` — secrets para a API REST customizada

Criar `config.yml` a partir do sample:

```bash
cd ~/apps/wiki/wiki
cp config.sample.yml config.yml
nano config.yml
```

Ajusta os seguintes valores:

```yaml
port: 8080

db:
  type: postgres
  host: localhost
  port: 5432
  user: nexo_user
  pass: STRONG_PASSWORD
  db: nexo_production
  ssl: false
  sslOptions:
    auto: true
  schema: wiki

logLevel: info
offline: false
dataPath: ./data
```

**Nota:** Usamos o schema `wiki` para manter as tabelas do Wiki.js separadas das tabelas do backend na mesma base de dados PostgreSQL. Precisas de criar o schema antes:

```bash
PGPASSWORD=STRONG_PASSWORD psql -h localhost -U nexo_user -d nexo_production -c "CREATE SCHEMA IF NOT EXISTS wiki;"
```

Criar ficheiro `.env` na raiz do repositório wiki:

```bash
cd ~/apps/wiki
nano .env
```

Adiciona:

```env
# Shared secret with backend for user JWT verification
JWT_SECRET=MESMO_SECRET_DO_BACKEND

# Shared secret for service-to-service calls (AI → Wiki)
SERVICE_SECRET=SECRET_PARTILHADO_ENTRE_SERVICOS
```

Proteger ficheiros com secrets:

```bash
chmod 600 ~/apps/wiki/.env
chmod 600 ~/apps/wiki/wiki/config.yml
```

#### 3.5.4: Primeiro Arranque e Setup

No primeiro arranque, o Wiki.js vai executar migrations e mostrar o wizard de setup:

```bash
cd ~/apps/wiki
./start.sh

# Abre http://<SERVER_IP>:8080 no browser
# Cria conta de administrador no wizard
# Ctrl+C para parar quando terminares o setup
```

#### 3.5.5: Iniciar Wiki.js com PM2

```bash
# Iniciar wiki com PM2
pm2 start ~/apps/wiki/wiki/server/index.js \
  --name "nexo-wiki" \
  --cwd ~/apps/wiki/wiki

# Ou usando o ecosystem.config.js incluído:
cd ~/apps/wiki
pm2 start ecosystem.config.js

# Verificar que está a correr
pm2 status

# Ver logs
pm2 logs nexo-wiki --lines 50
```

**Verificação:** Confirma que o Wiki.js está a responder:

```bash
# Verificar porta 8080
sudo ss -tlnp | grep 8080

# Testar health check
curl http://localhost:8080/healthz

# Testar API customizada
curl -H "X-Service-Secret: SECRET_PARTILHADO_ENTRE_SERVICOS" http://localhost:8080/api/pages/search
```

#### 3.5.6: Salvar Configuração PM2 Final

Agora que as quatro aplicações estão a correr, salva a configuração:

```bash
# Ver lista de processos
pm2 list

# Deves ver nexo-backend, nexo-frontend, nexo-ai e nexo-wiki todos "online"

# Salvar configuração para restart automático
pm2 save
```

## Fase 4: Configurar Nginx (CORRIGIDO)

Aqui é onde a mágica acontece. Nginx vai rotear requests inteligentemente:
- Requests para `/wiki/*` vão para o Wiki.js (porta 8080)
- Requests para `/api/ai/*` vão para o AI layer FastAPI (porta 8001)
- Requests para `/api/*` vão para o backend (porta 3001)
- Todos os outros requests vão para o frontend (porta 3000)

### Passo 4.1: Criar Configuração do Nginx

```bash
sudo nano /etc/nginx/sites-available/nexo
```

Adiciona esta configuração:

```nginx
# Cache zone para assets estáticos
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=STATIC:10m inactive=7d use_temp_path=off;

# Upstream para backend
upstream nexo_backend {
    server localhost:3001;
    keepalive 64;
}

# Upstream para AI layer (FastAPI)
upstream nexo_ai {
    server 127.0.0.1:8001;
    keepalive 16;
}

# Upstream para Wiki.js
upstream nexo_wiki {
    server localhost:8080;
    keepalive 16;
}

# Upstream para frontend
upstream nexo_frontend {
    server localhost:3000;
    keepalive 64;
}

# Servidor principal
server {
    listen 80;
    listen [::]:80;
    
    server_name teu-dominio.com www.teu-dominio.com;
    
    # Logs
    access_log /var/log/nginx/nexo_access.log;
    error_log /var/log/nginx/nexo_error.log;
    
    # Tamanho máximo de upload (ajusta conforme necessário)
    client_max_body_size 10M;
    
    # ====================
    # WIKI ROUTES
    # ====================
    # Requests para /wiki/ vão para o Wiki.js (porta 8080)
    location /wiki/ {
        proxy_pass http://nexo_wiki/;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }

    # Wiki SSO login (usado pelo frontend para redirecionar utilizadores)
    location /auth/sso {
        proxy_pass http://nexo_wiki;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ====================
    # AI LAYER ROUTES
    # ====================
    # Requests para /api/ai/ vão para o serviço FastAPI (porta 8001)
    location /api/ai/ {
        proxy_pass http://nexo_ai;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout mais longo para respostas da IA
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        proxy_cache_bypass $http_upgrade;
    }

    # ====================
    # BACKEND API ROUTES
    # ====================
    # Todos os requests que começam com /api/ vão para o backend
    location /api/ {
        proxy_pass http://nexo_backend;
        proxy_http_version 1.1;
        
        # Headers importantes
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para requests longos se necessário
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_cache_bypass $http_upgrade;
    }
    
    # ====================
    # FRONTEND ROUTES
    # ====================
    # Todos os outros requests vão para o frontend Next.js
    location / {
        proxy_pass http://nexo_frontend;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }
    
    # ====================
    # CACHE DE ASSETS ESTÁTICOS
    # ====================
    # Assets do Next.js (_next/static)
    location /_next/static {
        proxy_cache STATIC;
        proxy_pass http://nexo_frontend;
        
        # Cache agressivo - estes ficheiros têm hash no nome e nunca mudam
        add_header Cache-Control "public, max-age=31536000, immutable";
        
        # Headers de proxy
        proxy_set_header Host $host;
    }
    
    # Imagens optimizadas do Next.js
    location /_next/image {
        proxy_cache STATIC;
        proxy_pass http://nexo_frontend;
        
        # Cache por 1 dia
        add_header Cache-Control "public, max-age=86400";
        
        proxy_set_header Host $host;
    }
    
    # Favicon e outros assets estáticos na raiz
    location ~* \.(ico|css|js|gif|jpeg|jpg|png|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://nexo_frontend;
        
        add_header Cache-Control "public, max-age=86400";
        
        proxy_set_header Host $host;
    }
}
```

Salva e fecha (Ctrl+O, Enter, Ctrl+X).

### Passo 4.2: Activar Site e Testar

```bash
# Criar symlink (-sf força overwrite se já existir)
sudo ln -sf /etc/nginx/sites-available/nexo /etc/nginx/sites-enabled/

# Remover site default
sudo rm -f /etc/nginx/sites-enabled/default

# Criar directório de cache
sudo mkdir -p /var/cache/nginx

# Testar configuração
sudo nginx -t
```

Se mostra "syntax is ok" e "test is successful":

```bash
# Recarregar Nginx
sudo systemctl reload nginx
```

### Passo 4.3: Configurar DNS

**Configuração Básica (Mesmo Domínio para Tudo):**

No teu registrar de domínio, cria:

```
Type: A
Name: @
Value: <SERVER_IP>
TTL: 3600

Type: A  
Name: www
Value: <SERVER_IP>
TTL: 3600
```

Com esta configuração:
- Frontend: `https://teu-dominio.com`
- Backend API: `https://teu-dominio.com/api/*`

**Configuração Alternativa (Subdomínio para API):**

Se preferires ter API em subdomínio separado, precisa de:
1. DNS adicional apontando api.teu-dominio.com para o servidor
2. Configuração separada do Nginx (mostro abaixo se quiseres)

Espera alguns minutos pela propagação DNS e testa:

```bash
# Testar resolução DNS
dig teu-dominio.com +short
# Deve mostrar o IP do servidor
```

## Fase 5: Configurar SSL/HTTPS (AJUSTADO)

### Passo 5.1: Obter Certificado SSL

```bash
# Para configuração básica (mesmo domínio):
sudo certbot --nginx -d teu-dominio.com -d www.teu-dominio.com

# Responde às perguntas:
# - Email para notificações
# - Aceitar termos (Y)
# - Redirecionar HTTP para HTTPS (escolhe 2)
```

Certbot vai modificar automaticamente a configuração do Nginx para adicionar SSL.

### Passo 5.2: Verificar Configuração Final

Após Certbot terminar, verifica a configuração:

```bash
sudo nano /etc/nginx/sites-available/nexo
```

Certbot terá adicionado:
- Bloco `server` novo para porta 443 (HTTPS)
- Certificados SSL
- Redirecionamento de HTTP (porta 80) para HTTPS (porta 443)

### Passo 5.3: Testar HTTPS

Abre no browser: `https://teu-dominio.com`

Deves ver:
- ✅ Cadeado verde (conexão segura)
- ✅ Frontend a funcionar
- ✅ Requests para `/api/*` a funcionar (testa login ou qualquer endpoint)

Testa também que HTTP redireciona:
- Acede `http://teu-dominio.com` (sem S)
- Deve redirecionar automaticamente para `https://teu-dominio.com`

### Passo 5.4: Verificar Renovação Automática

```bash
# Teste de renovação (dry-run, não renova de verdade)
sudo certbot renew --dry-run
```

Se passar sem erros, renovação automática está configurada.

## Configuração Alternativa: API em Subdomínio Separado

Se preferires ter `api.teu-dominio.com` em vez de `teu-dominio.com/api`:

### DNS Adicional

```
Type: A
Name: api
Value: <SERVER_IP>
TTL: 3600
```

### Nginx com Dois Server Blocks

```bash
sudo nano /etc/nginx/sites-available/nexo
```

```nginx
# ... (mantém proxy_cache_path e upstreams do início)

# ====================
# BACKEND API SERVER
# ====================
server {
    listen 80;
    listen [::]:80;
    
    server_name api.teu-dominio.com;
    
    access_log /var/log/nginx/nexo_api_access.log;
    error_log /var/log/nginx/nexo_api_error.log;
    
    client_max_body_size 10M;
    
    location / {
        proxy_pass http://nexo_backend;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }
}

# ====================
# FRONTEND SERVER
# ====================
server {
    listen 80;
    listen [::]:80;
    
    server_name teu-dominio.com www.teu-dominio.com;
    
    access_log /var/log/nginx/nexo_frontend_access.log;
    error_log /var/log/nginx/nexo_frontend_error.log;
    
    client_max_body_size 10M;
    
    location / {
        proxy_pass http://nexo_frontend;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }
    
    # Cache de assets estáticos (mesmo código de antes)
    location /_next/static {
        proxy_cache STATIC;
        proxy_pass http://nexo_frontend;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    
    location /_next/image {
        proxy_cache STATIC;
        proxy_pass http://nexo_frontend;
        add_header Cache-Control "public, max-age=86400";
    }
}
```

Depois:
```bash
sudo nginx -t
sudo systemctl reload nginx

# Certificado SSL para ambos os domínios
sudo certbot --nginx -d teu-dominio.com -d www.teu-dominio.com -d api.teu-dominio.com
```

Neste caso, actualiza `.env.production` do frontend:
```bash
NEXT_PUBLIC_API_URL=https://api.teu-dominio.com
```

## Fase 6: Backups (Igual ao Anterior)

O script de backup é igual ao guia anterior, já cobre a base de dados correctamente.

## Fase 7: Monitoring

### Passo 7.1: Monitorar Ambas as Aplicações

```bash
# Ver status de todos os processos
pm2 list

# Deves ver:
# ┌─────┬────────────────────┬─────────┬─────────┐
# │ id  │ name               │ status  │ cpu     │
# ├─────┼────────────────────┼─────────┼─────────┤
# │ 0   │ nexo-backend       │ online  │ 0%      │
# │ 1   │ nexo-frontend      │ online  │ 0%      │
# │ 2   │ nexo-ai            │ online  │ 0%      │
# │ 3   │ nexo-wiki          │ online  │ 0%      │
# └─────┴────────────────────┴─────────┴─────────┘

# Dashboard interactivo
pm2 monit

# Logs de ambos
pm2 logs

# Logs apenas do backend
pm2 logs nexo-backend

# Logs apenas do frontend
pm2 logs nexo-frontend

# Logs apenas do AI layer
pm2 logs nexo-ai

# Logs apenas do wiki
pm2 logs nexo-wiki
```

### Passo 7.2: Comandos Úteis para Gestão

```bash
# Reiniciar apenas backend (após update de código backend)
pm2 restart nexo-backend

# Reiniciar apenas frontend (após update de código frontend)
pm2 restart nexo-frontend

# Reiniciar apenas AI layer (após update de código AI)
pm2 restart nexo-ai

# Reiniciar apenas wiki (após update de código wiki)
pm2 restart nexo-wiki

# Reiniciar todos
pm2 restart all

# Parar uma aplicação temporariamente
pm2 stop nexo-backend

# Iniciar novamente
pm2 start nexo-backend

# Ver informação detalhada
pm2 show nexo-backend
pm2 show nexo-frontend
pm2 show nexo-ai
pm2 show nexo-wiki
```

## Fase 8: Workflow de Deploy de Updates

### Deploy de Updates do Backend

```bash
ssh deploy@<SERVER_IP>
cd ~/apps/backend

# Pull das mudanças
git pull origin main

# Instalar dependências se package.json mudou
npm ci --only=production

# Build se necessário (TypeScript, etc)
npm run build

# Executar novas migrations se houver
npm run migrate

# Reiniciar apenas backend
pm2 restart nexo-backend

# Verificar logs
pm2 logs nexo-backend --lines 50
```

### Deploy de Updates do Frontend

```bash
ssh deploy@<SERVER_IP>
cd ~/apps/frontend

# Pull das mudanças
git pull origin main

# Instalar dependências se package.json mudou
npm ci --only=production

# Build do Next.js
npm run build

# Reiniciar apenas frontend
pm2 restart nexo-frontend

# Verificar logs
pm2 logs nexo-frontend --lines 50
```

### Deploy de Updates do AI Layer

```bash
ssh deploy@<SERVER_IP>
cd ~/apps/ai

# Pull das mudanças
git pull origin main

# Activar venv e actualizar dependências
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Reiniciar AI layer
pm2 restart nexo-ai

# Verificar logs
pm2 logs nexo-ai --lines 50
```

### Deploy de Updates do Wiki

```bash
ssh deploy@<SERVER_IP>
cd ~/apps/wiki

# Pull das mudanças
git pull origin main

# Instalar dependências se package.json mudou
cd wiki && npm ci --legacy-peer-deps && cd ..

# Reiniciar wiki
pm2 restart nexo-wiki

# Verificar logs
pm2 logs nexo-wiki --lines 50
```

### Deploy Automático com GitHub Actions

Podes criar workflows separados para cada repositório:

**Backend (.github/workflows/deploy-backend.yml):**
```yaml
name: Deploy Backend

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: deploy
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/apps/backend
            git pull origin main
            npm ci --only=production
            npm run build
            npm run migrate
            pm2 restart nexo-backend
```

**Frontend (.github/workflows/deploy-frontend.yml):**
```yaml
name: Deploy Frontend

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: deploy
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/apps/frontend
            git pull origin main
            npm ci --only=production
            npm run build
            pm2 restart nexo-frontend
```

## Troubleshooting Específico de Dois Repositórios

### Backend Responde mas Frontend Não Consegue Conectar

```bash
# Verificar que backend está realmente acessível
curl http://localhost:3001/health

# Ver logs do backend para requests que chegam
pm2 logs nexo-backend --lines 100

# Verificar CORS no backend
# Se vês erros de CORS no browser console, 
# ajusta configuração CORS no backend para permitir teu domínio
```

### Frontend Retorna 502 ao Chamar API

```bash
# Verificar se Nginx está a rotear correctamente
sudo tail -f /var/log/nginx/nexo_error.log

# Testar rota da API manualmente
curl https://teu-dominio.com/api/health

# Verificar configuração do Nginx
# Backend já inclui /api nos paths (ex: /api/auth, /api/projects)
```

### Uma Aplicação Funciona mas Outra Não

```bash
# Ver status de ambas
pm2 list

# Se uma está "errored":
pm2 logs <nome-da-app-com-erro> --err --lines 100

# Reiniciar a que tem problemas
pm2 restart <nome-da-app>

# Verificar variáveis de ambiente
pm2 show <nome-da-app>
```

### Updates Não Aparecem Após Deploy

```bash
# Limpar cache do Next.js (frontend)
cd ~/apps/frontend
rm -rf .next
npm run build
pm2 restart nexo-frontend

# Limpar cache do browser (Ctrl+Shift+R)

# Verificar que fez git pull correctamente
git log -1  # Ver último commit
```

## Checklist Final (Corrigido para Dois Repositórios)

- [ ] Backend clonado em `~/apps/backend` e a correr em porta 3001
- [ ] Frontend clonado em `~/apps/frontend` e a correr em porta 3000
- [ ] AI layer clonado em `~/apps/ai` e a correr em porta 8001
- [ ] Wiki.js clonado em `~/apps/wiki` e a correr em porta 8080
- [ ] Todos geridos pelo PM2 e configurados para auto-start
- [ ] Base de dados criada e migrations executadas
- [ ] Nginx configurado para rotear `/wiki/*` para wiki, `/api/ai/*` para AI, `/api/*` para backend, e resto para frontend
- [ ] DNS configurado e a resolver para IP do servidor
- [ ] SSL instalado e HTTPS funciona
- [ ] Frontend consegue fazer requests ao backend através de `/api/*`
- [ ] CORS configurado correctamente no backend
- [ ] Backups automáticos da base de dados configurados
- [ ] Logs acessíveis via PM2 para ambas aplicações

## Comandos de Referência Rápida

```bash
# Status geral
pm2 list
sudo systemctl status nginx
sudo systemctl status postgresql

# Logs
pm2 logs nexo-backend
pm2 logs nexo-frontend
pm2 logs nexo-ai
pm2 logs nexo-wiki
sudo tail -f /var/log/nginx/nexo_error.log

# Reiniciar
pm2 restart nexo-backend
pm2 restart nexo-frontend
pm2 restart nexo-ai
pm2 restart nexo-wiki
sudo systemctl reload nginx

# Deploy
cd ~/apps/backend && git pull && npm ci --only=production && npm run build && pm2 restart nexo-backend
cd ~/apps/frontend && git pull && npm ci --only=production && npm run build && pm2 restart nexo-frontend
cd ~/apps/ai && source venv/bin/activate && git pull && pip install -r requirements.txt && deactivate && pm2 restart nexo-ai
cd ~/apps/wiki && git pull && cd wiki && npm ci --legacy-peer-deps && cd .. && pm2 restart nexo-wiki

# Verificar portas em uso
sudo netstat -tlnp | grep -E '3000|3001|8001|8080'
```

## Diferenças-Chave deste Setup

1. **Quatro Repositórios Separados** em `~/apps/backend`, `~/apps/frontend`, `~/apps/ai` e `~/apps/wiki`
2. **Quatro Processos PM2** geridos independentemente
3. **Nginx roteia por path** `/wiki/*` → Wiki.js, `/api/ai/*` → AI layer, `/api/*` → backend, resto → frontend
4. **Variáveis de ambiente diferentes** para cada aplicação
5. **Deploys independentes** - podes actualizar um sem tocar nos outros
6. **Logs separados** - facilita debugging de problemas específicos
7. **Wiki.js com SSO** - utilizadores do frontend acedem ao wiki sem login adicional via `/auth/sso`
8. **API REST customizada** - AI pode criar/editar páginas do wiki via `X-Service-Secret`

Esta arquitectura dá-te:
- ✅ Separação clara de responsabilidades
- ✅ Deploys independentes (não precisa rebuild do frontend se só muda backend ou AI)
- ✅ AI layer isolado com próprio runtime Python
- ✅ Escalabilidade futura (podes mover qualquer serviço para servidor separado se necessário)
- ✅ Debugging mais simples (logs e processos separados)
