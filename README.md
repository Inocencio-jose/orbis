<div align="center">

<img src="logo.png" alt="Orbis Logo" width="100" style="border-radius:16px"/>

# Orbis

**Bot inteligente de gestão de grupos WhatsApp**

Desenvolvido por [Orion Technologies](https://oriontechn.netlify.app) · Liderado por **Inocêncio José**

[![Node.js](https://img.shields.io/badge/Node.js-v24+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-v7-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Groq](https://img.shields.io/badge/Groq-IA-F55036?style=flat-square)](https://groq.com)
[![License](https://img.shields.io/badge/Licença-ISC-6366f1?style=flat-square)](LICENSE)

</div>

---

## O que é o Orbis?

O Orbis é um bot autónomo de gestão de grupos WhatsApp com inteligência artificial integrada. Modera grupos automaticamente, responde a comandos, conversa com os membros e notifica admins — tudo sem intervenção manual.

---

## Funcionalidades

### Moderação Autónoma
- Detecção e remoção automática de spam, links e flood
- Sistema de strikes com escalada automática (aviso → mute → kick → ban)
- Age por comportamento, sem precisar de comandos

### Comandos de Administração
- `/warn`, `/kick`, `/ban`, `/mute`, `/unmute`
- `/promover`, `/despromover`, `/trancar`, `/abrir`
- `/banidos`, `/adicionar` — gestão de banidos
- `/sondagem`, `/anunciar`, `/agendamento`

### Inteligência Artificial (Groq)
- Responde quando mencionada (`@Orbis` ou escrevendo "orbis")
- Lê o contexto da conversa e adapta o tom
- Executa comandos por linguagem natural (admins)
- Memória persistente por grupo no Supabase
- Personalidade real — responde na mesma moeda quando provocada

### Notificações
- Notifica admins em grupo dedicado (`/setadmingroup`)
- Alertas de denúncias, avisos, bans, kicks e mutes

### Painel Web
- Dashboard completo em `dashboard.html`
- Estatísticas, gráficos, gestão de grupos, membros, logs
- Broadcast para grupos, QR Code e emparelhamento por código

---

## Pré-requisitos

- [Node.js](https://nodejs.org) v18 ou superior
- Conta no [Supabase](https://supabase.com) (gratuita)
- API Key do [Groq](https://console.groq.com) (gratuita)
- Um número de WhatsApp dedicado para o bot

---

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/orion-technologies/orbis.git
cd orbis
```

### 2. Instalar dependências

```bash
npm install
npm approve-scripts @whiskeysockets/baileys protobufjs
```

### 3. Configurar variáveis de ambiente

Cria um ficheiro `.env` na raiz do projecto:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # service_role key
OWNER_NUMBER=244912345678
OWNER_LID=148799829852351
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **OWNER_NUMBER** — o teu número de telefone (sem + e sem espaços)  
> **OWNER_LID** — o teu LID do WhatsApp (aparece no terminal na primeira execução)  
> **SUPABASE_KEY** — usa a `service_role` key, não a `anon` key

### 4. Criar as tabelas no Supabase

No painel do Supabase, vai a **SQL Editor** e executa o ficheiro [`migrations.sql`](migrations.sql):

```bash
# Ou copia e cola o conteúdo de migrations.sql no SQL Editor do Supabase
```

As tabelas criadas são:

| Tabela | Descrição |
|---|---|
| `groups` | Configurações de cada grupo |
| `warnings` | Histórico de avisos |
| `reports` | Denúncias de membros |
| `banned_users` | Utilizadores banidos |
| `logs` | Registo de acções do bot |
| `ai_memory` | Memória persistente da IA |
| `contacts` | Mapa de JID → nome/número |

### 5. Arrancar o bot

```bash
npm start
```

Na primeira execução aparece um QR Code no terminal. Abre o WhatsApp no telemóvel do bot:

```
WhatsApp → ⋮ → Dispositivos ligados → Ligar um dispositivo → Scan QR
```

Após conectar, o terminal mostra:

```
[SUCCESS] Orbis conectado ao WhatsApp ✅
[INFO] API disponível em http://localhost:3001
```

---

## Configuração inicial

### Definir o teu OWNER_LID

Na primeira vez que enviares uma mensagem num grupo, o terminal mostra o teu LID:

```
[INFO] Comando /menu por 148799829852351 (admin)
```

Copia esse número e coloca no `.env`:

```env
OWNER_LID=148799829852351
```

Reinicia o bot — agora apareces como `owner`.

### Configurar grupo de notificações (recomendado)

1. Cria um grupo no WhatsApp com os admins + o número do Orbis
2. Nesse grupo, envia:

```
/setadmingroup
```

Todas as notificações de moderação vão para esse grupo.

---

## Comandos disponíveis

### Para todos os membros

| Comando | Descrição |
|---|---|
| `/menu` | Ver todos os comandos |
| `/info` | Informações do grupo |
| `/admins` | Lista de administradores |
| `/regras` | Regras do grupo |
| `/stats` | Estatísticas do grupo |
| `/denunciar` | Denunciar uma mensagem (responde a ela) |
| `/instrucoes` | Guia detalhado de todos os comandos |

### Para administradores

| Comando | Descrição |
|---|---|
| `/warn @membro motivo` | Advertir membro |
| `/kick @membro` | Expulsar membro |
| `/ban @membro motivo` | Banir membro |
| `/mute @membro 30m` | Mutar por tempo (ex: 30m, 1h, 2d) |
| `/unmute @membro` | Desmutar |
| `/promover @membro` | Promover a admin |
| `/despromover @membro` | Despromover |
| `/trancar` | Só admins podem enviar |
| `/abrir` | Todos podem enviar |
| `/banidos` | Lista de banidos |
| `/adicionar 244912345678` | Readmitir banido |
| `/anunciar texto` | Enviar anúncio formatado |
| `/sondagem pergunta \| op1 \| op2` | Criar enquete |
| `/agendamento 30m mensagem` | Agendar mensagem |
| `/setregras texto` | Definir regras do grupo |
| `/setwelcome mensagem` | Personalizar boas-vindas |
| `/antilink on\|off` | Activar/desactivar anti-link |
| `/antispam on\|off` | Activar/desactivar anti-spam |
| `/antiflood on\|off` | Activar/desactivar anti-flood |
| `/config` | Ver configurações do grupo |
| `/setadmingroup` | Definir grupo de notificações |

---

## Painel Web

Abre `dashboard.html` directamente no browser (não precisa de servidor).

> Se o bot estiver noutro servidor, edita a linha no `dashboard.html`:
> ```js
> const API = 'https://teu-servidor.onrender.com'
> ```

---

## Deploy no Render

1. Faz push do projecto para o GitHub (sem o `.env` e sem a pasta `sessions/`)
2. Cria um novo **Web Service** no [Render](https://render.com)
3. Configura:
   - **Build Command:** `npm install && npm approve-scripts @whiskeysockets/baileys protobufjs`
   - **Start Command:** `npm start`
4. Adiciona as variáveis de ambiente no painel do Render
5. Após o deploy, acede ao URL do serviço + `/api/qr` para ver o QR Code, ou usa o painel web com a URL do Render

---

## Estrutura do projecto

```
orbis/
├── index.js                  # Entrada principal
├── dashboard.html            # Painel web
├── migrations.sql            # SQL para criar tabelas
├── .env                      # Variáveis de ambiente (não commitar)
├── config/
│   └── index.js              # Configurações globais
├── src/
│   ├── commands/
│   │   ├── general.js        # Comandos gerais
│   │   ├── moderation.js     # Comandos de moderação
│   │   ├── reports.js        # Sistema de denúncias
│   │   ├── config.js         # Configurações de grupo
│   │   └── instructions.js   # Comando /instrucoes
│   ├── core/
│   │   ├── ai.js             # Integração Groq (IA)
│   │   ├── actions.js        # Acções autónomas da IA
│   │   ├── database.js       # Cliente Supabase
│   │   └── logger.js         # Sistema de logs
│   ├── groups/
│   │   └── events.js         # Boas-vindas e eventos
│   ├── moderation/
│   │   ├── automod.js        # Auto-moderação
│   │   ├── detector.js       # Detecção de spam/links/flood
│   │   └── warnings.js       # CRUD de avisos
│   ├── permissions/
│   │   └── index.js          # Sistema de permissões
│   └── utils/
│       └── notify.js         # Notificações e resolução de nomes
├── sessions/                 # Sessão WhatsApp (não commitar)
└── logs/                     # Ficheiros de log
```

---

## Variáveis de ambiente

| Variável | Descrição | Obrigatório |
|---|---|---|
| `SUPABASE_URL` | URL do projecto Supabase | ✅ |
| `SUPABASE_KEY` | Service role key do Supabase | ✅ |
| `OWNER_NUMBER` | Teu número de telefone | ✅ |
| `OWNER_LID` | Teu LID do WhatsApp | ✅ |
| `GROQ_API_KEY` | API Key do Groq | ✅ |

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| [Baileys v7](https://github.com/WhiskeySockets/Baileys) | Conexão WhatsApp |
| [Supabase](https://supabase.com) | Base de dados PostgreSQL |
| [Groq](https://groq.com) | Inteligência Artificial |
| [Express](https://expressjs.com) | API REST interna |
| [Pino](https://getpino.io) | Sistema de logs |

---

<div align="center">

Feito com 🧠 pela **Orion Technologies**

[oriontechn.netlify.app](https://oriontechn.netlify.app)

</div>
