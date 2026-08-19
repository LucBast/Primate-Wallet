# Deploy de Produção — Primate Wallet

> Documento de produto + roteiro operacional. Descreve **o que está implantado em
> produção**, **quais plataformas** são usadas e **por quê**, e **como
> deployar/redeployar**.
>
> Implantação executada em **2026-08-18** (GCP `southamerica-east1`, Supabase).
> Credenciais e URLs sensíveis ficam em `docs/secrets.txt` (fora do
> versionamento, no `.gitignore`).
>
> Este é o documento canônico de deploy. `docs/26-DEPLOY.md` continua como
> caderno de justificativas — o "por quê" longo de decisões pontuais — e não
> deve ser seguido como roteiro.

---

## 0. Contas — qual serviço está em qual e-mail

Tabela de consulta rápida: **em que conta cada serviço foi criado**. Sem isso, na
hora de mexer em produção se perde tempo descobrindo com qual login entrar.

| Serviço | Papel no produto | Conta / e-mail |
|---|---|---|
| **Google Cloud (GCP)** | Cloud Run (API), Cloud Build, Artifact Registry, Secret Manager | `primate.tech.app@gmail.com` |
| **Supabase** | Postgres da plataforma | `dev@activesystem.net.br` |
| **Resend** | E-mail transacional (confirmação de cadastro, link mágico, senha nova, convite) | *a confirmar* |
| **Sentry** | Erros 5xx da API | *a confirmar* |
| **Domínio `primatetechnology.com`** | Remetente do e-mail (`nao-responda@`) | *a confirmar* |

**Pontos de atenção:**

- O `gcloud` desta máquina usa uma **configuração nomeada** para não misturar com
  outros projetos: todo comando abaixo assume `CLOUDSDK_ACTIVE_CONFIG_NAME=primate-wallet`.
- Senhas e chaves **não** entram neste documento.
- Existe um projeto GCP antigo chamado `primate-wallet` (sem o `-10`), abandonado.
  Continua de pé; ver §10.

---

## 1. Visão geral

```
┌──────────────────────┐        ┌──────────────────────────────────────────────┐
│  App Android (APK)   │        │          Google Cloud — primate-wallet-10     │
│  WatermelonDB local  │─HTTPS─▶│  ┌────────────────────────────────────────┐  │
│  fila offline        │        │  │ Cloud Run: primatewallet-api (Fastify) │  │
└──────────┬───────────┘        │  │  • min-instances 0 (escala a zero)     │  │
           │                    │  │  • max-instances 2, 1 vCPU / 512 MiB   │  │
           │ deep link          │  │  • /health, /auth/*, /households/*     │  │
           │ familyfinance://   │  │  • /abrir/<rota> — ponte de e-mail     │  │
           │                    │  └───────────┬────────────────────────────┘  │
┌──────────┴───────────┐        │              │                                │
│ Página /abrir/…      │◀───────┤  ┌───────────┴───────────┐                    │
│ (servida pela API)   │        │  │ Secret Manager (7)    │                    │
└──────────────────────┘        │  │ Artifact Registry     │                    │
           ▲                    │  │  ↳ retém 2 imagens    │                    │
           │ link no e-mail     │  └───────────────────────┘                    │
┌──────────┴───────────┐        └──────────────────┬───────────────────────────┘
│ Resend               │                           │ TLS, CA própria
│ nao-responda@…       │            ┌──────────────▼──────────────────┐
└──────────────────────┘            │ Supabase Postgres               │
                                    │  • pooler (runtime, ff_app)     │
┌──────────────────────┐            │  • ff_auth  — autenticação      │
│ Sentry (5xx)         │◀───────────┤  • ff_migrator — migrações      │
└──────────────────────┘            │  • RLS por household_id         │
                                    └─────────────────────────────────┘
```

O app é **offline-first**: escreve no WatermelonDB local e sincroniza depois. A
API não guarda estado em memória — escala a zero sem perder nada.

---

## 2. Plataformas utilizadas

| Plataforma | Para quê | Por que esta |
|---|---|---|
| **Cloud Run** | API | Escala a zero. Piloto sem tráfego não custa. `--source` dispensa Dockerfile no CI. |
| **Cloud Build** | Build da imagem | Vem junto do `gcloud run deploy --source`. |
| **Artifact Registry** | Imagens | Idem. **Com política de retenção** (§6.6) — sem ela, acumula e passa a cobrar. |
| **Secret Manager** | 7 segredos | Segredo nunca vira variável de ambiente em texto no serviço. |
| **Supabase Postgres** | Banco | Postgres gerenciado com RLS de verdade, que é onde mora o isolamento por família. |
| **Resend** | E-mail transacional | HTTP simples, sem SDK. Sem ele o cadastro cria conta que ninguém confirma. |
| **Sentry** | Erros 5xx | O handler do Fastify consome o erro; sem `captureException` explícito nada chegaria. |

---

## 3. Componentes implantados

### 3.1 API — `primatewallet-api`

- **URL**: `https://primatewallet-api-479194115127.southamerica-east1.run.app`
- **Região**: `southamerica-east1`
- **Runtime**: Node + Fastify 5, `--allow-unauthenticated`
- **Sizing**: 1 vCPU, 512 MiB, `min-instances 0`, `max-instances 2`
- **Saúde**: `GET /health` → `{"status":"ok","environment":"production","checks":{"database":"ok"}}`

`--allow-unauthenticated` é o correto: quem autentica é o JWT da própria API, não
o IAM do Google. O app não tem como carregar credencial do Google.

### 3.2 Ponte de links de e-mail — `/abrir/<rota>`

Servida pela mesma API. O e-mail aponta para
`<PUBLIC_BASE_URL>/abrir/<rota>?token=…`, e a página oferece um botão com o deep
link `familyfinance://`.

Existe porque **cliente de e-mail nenhum transforma um esquema fora de `http(s)`
em link clicável**, e colar o texto no navegador dá "endereço inválido". Sem a
ponte, o cadastro chegava ao e-mail e morria ali.

A página **não consome o token** e não toca no banco: antivírus de e-mail
corporativo abre todo link da mensagem antes de a pessoa ler, e uma página que
confirmasse sozinha queimaria o token de uso único no robô.

Rotas atendidas, de lista fechada: `verificar-email`, `entrar`, `senha-nova`,
`convite`. Qualquer outra devolve 400 — sem a lista, viraria redirecionador
aberto.

### 3.3 Segredos (Secret Manager)

| Segredo | Consumido como |
|---|---|
| `primatewallet-database-url` | `DATABASE_URL` (role `ff_app`) |
| `primatewallet-database-auth-url` | `DATABASE_AUTH_URL` (role `ff_auth`) |
| `primatewallet-database-migration-url` | `DATABASE_MIGRATION_URL` (role `ff_migrator`) |
| `primatewallet-jwt-access-secret` | `JWT_ACCESS_SECRET` |
| `primatewallet-jwt-refresh-secret` | `JWT_REFRESH_SECRET` |
| `primatewallet-sentry-dsn` | `SENTRY_DSN` |
| `primatewallet-resend-api-key` | `RESEND_API_KEY` |

---

## 4. Banco de dados (Supabase)

Três roles, com privilégio separado de propósito:

| Role | Usado por | Enxerga |
|---|---|---|
| `ff_app` | Runtime da API | Só o que as políticas de RLS permitem, por `household_id` |
| `ff_auth` | Fluxo de autenticação | Perfis, tokens, dispositivos |
| `ff_migrator` | `migrate.mjs` | Dono das tabelas |

**TLS**: o runtime conecta com `rejectUnauthorized: true`. O Supabase serve o
pooler com uma CA auto-assinada, então `DATABASE_SSL_CA` carrega o PEM em base64.
Sem isso a conexão falha em `SELF_SIGNED_CERT_IN_CHAIN` — e a saída fácil (desligar
a verificação) exporia a credencial do banco a quem estivesse no meio.

**Nenhuma tabela usa `FORCE ROW LEVEL SECURITY`** (migração 0021), e isso é
deliberado: as políticas chamam funções `SECURITY DEFINER` que precisam LER a
tabela protegida para decidir. Com `FORCE`, a dona (`ff_migrator`) também ficava
sujeita às políticas e a leitura interna voltava vazia — `can_view_account`
negava acesso a todo mundo, e criar conta dava 500. Não afrouxa nada: o runtime
usa `ff_app`, que não é dona e segue sujeito às políticas.

---

## 5. Por que esta arquitetura

- **Escala a zero**: o piloto passa a maior parte do tempo ocioso.
- **Sem worker, sem Redis**: os jobs (avisos, recorrência) são funções SQL
  disparadas por chamada, não um processo residente.
- **Offline-first no cliente**: a API pode estar fria; o app continua usável.
- **Isolamento no banco, não só no código**: RLS por `household_id`, revalidado
  na camada de serviço. Um bug de serviço não vaza dado entre famílias.

---

## 6. Roteiro de deploy / redeploy

Todos os comandos assumem:

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=primate-wallet
cd <raiz do repositório>
```

### 6.0 Pré-voo

```bash
npm run verify          # format, lint, typecheck, testes (API + domínio + mobile)
node --env-file=.env.production.local apps/api/scripts/check-db.mjs
```

O `check-db.mjs` separa as três falhas que produzem mensagens quase idênticas:
host do pooler errado, roles `ff_*` não provisionados, e cadeia de CA.

### 6.1 Migrações (sempre ANTES do deploy da API)

```bash
node --env-file=.env.production.local apps/api/scripts/migrate.mjs
```

A ordem importa: código novo contra schema velho quebra; schema novo contra
código velho, nas migrações deste projeto, não — elas são aditivas.

### 6.2 Cloud Run — API

Redeploy comum (preserva o que já está configurado):

```bash
gcloud run deploy primatewallet-api --source . --region southamerica-east1
```

Para mudar UMA variável, `--update-env-vars`. **Nunca `--set-env-vars` num
redeploy**: ele SUBSTITUI o conjunto inteiro e apagaria `DATABASE_SSL_CA`.

```bash
gcloud run deploy primatewallet-api --source . --region southamerica-east1 \
  --update-env-vars "PUBLIC_BASE_URL=https://primatewallet-api-479194115127.southamerica-east1.run.app"
```

Deploy do zero (serviço novo) está em `docs/26-DEPLOY.md` §2.3, com o
`--set-env-vars` completo.

### 6.3 Conferência pós-deploy

```bash
URL=https://primatewallet-api-479194115127.southamerica-east1.run.app
curl -s "$URL/health"
# {"status":"ok","version":"0.1.0","environment":"production","checks":{"database":"ok"}}

T=$(python3 -c 'print("A"*43)')
curl -s "$URL/abrir/verificar-email?token=$T" | grep -o 'href="[^"]*"'
# href="familyfinance://verificar-email?token=AAA..."

curl -s -o /dev/null -w "%{http_code}\n" "$URL/abrir/evil?token=$T"
# 400 — se der 200, a ponte virou redirecionador aberto
```

### 6.4 E-mail (Resend)

O domínio do remetente precisa estar **verificado** no painel do Resend. A chave
de envio não lê `/domains`, então a conferência sem incomodar ninguém é mandar
para o destinatário de simulação, que não chega a caixa nenhuma:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
  -d '{"from":"Primate Wallet <nao-responda@primatetechnology.com>","to":["delivered@resend.dev"],"subject":"probe","text":"probe"}'
# 200 = chave válida e domínio verificado
# 403 "Domain not verified" = DNS pendente
```

### 6.5 Rollback

```bash
gcloud run revisions list --service primatewallet-api --region southamerica-east1
gcloud run services update-traffic primatewallet-api --region southamerica-east1 \
  --to-revisions primatewallet-api-00003-7tw=100
```

**Atenção:** com a política de retenção de 2 imagens (§6.6), só dá para voltar
**uma** revisão. Revisão cuja imagem foi apagada não sobe.

### 6.6 Artifact Registry — retenção de 2 imagens

Sem política, cada deploy deixa uma imagem de ~40 MB no repositório. Em um único
dia de trabalho o repositório passou de 0 a 121 MB com três imagens; o
armazenamento é cobrado por GB/mês depois da cota gratuita.

A política vive versionada em `infra/gcp/artifact-registry-cleanup.json`:

```bash
# 1. Simular primeiro — mostra o que SERIA apagado, sem apagar.
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=southamerica-east1 \
  --policy=infra/gcp/artifact-registry-cleanup.json --dry-run

# 2. Valer de verdade.
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=southamerica-east1 \
  --policy=infra/gcp/artifact-registry-cleanup.json --no-dry-run

# 3. Conferir (vazio = valendo; True = ainda em simulação).
gcloud artifacts repositories describe cloud-run-source-deploy \
  --location=southamerica-east1 --format="value(cleanupPolicyDryRun)"

# 4. O que existe hoje.
gcloud artifacts docker images list \
  southamerica-east1-docker.pkg.dev/primate-wallet-10/cloud-run-source-deploy \
  --include-tags
```

A regra `manter-as-2-mais-recentes` protege as duas versões mais novas; a regra
`apagar-o-resto` remove as demais. Regra de retenção vence regra de exclusão,
então a ordem no arquivo não importa.

A limpeza roda de forma **assíncrona**, no ritmo do Google (não no ato do
deploy): não espere ver o espaço cair no mesmo minuto.

---

## 7. Mobile (APK)

```powershell
cd apps/mobile/android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:FF_API_URL = "https://primatewallet-api-479194115127.southamerica-east1.run.app"

# Se FF_API_URL mudou desde a última build, apague o bundle ANTES.
Remove-Item -Recurse -Force app/build/generated/assets/react/release,
  app/build/intermediates/assets/release,
  app/build/intermediates/compressed_assets/release

.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

**Por que apagar o bundle:** o Gradle decide reexecutar uma tarefa olhando
arquivos de entrada. Variável de ambiente não é arquivo, então
`createBundleReleaseJsAndAssets` fica `UP-TO-DATE` e o APK sai com a **URL
antiga** — build verde, assinatura correta, app apontando para o lugar errado. O
sinal de que funcionou é essa tarefa aparecer **sem** `UP-TO-DATE` na saída.

**Nome do arquivo**: `primatewallet-<versionName>-build<versionCode>.apk`,
gerado pelo próprio Gradle (`applicationVariants` em `app/build.gradle`) a partir
de `appVersionName` / `appVersionCode`, declarados uma vez no topo do arquivo.
**O `versionCode` tem de subir a cada APK entregue** — é o que o Android compara
para decidir se é atualização; repetir faz o instalador recusar em alguns
aparelhos com a mensagem genérica "app não instalado".

Duas conferências que valem o minuto que custam, porque as duas falham em
silêncio:

```bash
# 1. Assinado com a chave certa? Tem de sair CN=Family Finance, não Android Debug.
apksigner verify --print-certs app/build/outputs/apk/release/primatewallet-*.apk

# 2. A URL foi embutida? Sem ela o app cai no padrão api.familyfinance.app, que
#    não existe — e o sintoma no telefone é "sem conexão", igual ao de firewall.
unzip -p app/build/outputs/apk/release/primatewallet-*.apk assets/index.android.bundle \
  | grep -a -o "https://primatewallet-api[A-Za-z0-9.-]*run.app" | sort -u
```

A chave de upload é `C:/Users/lucia/keys/familyfinance-upload.keystore`, com as
senhas em `C:/Users/lucia/.gradle/gradle.properties` — fora do repositório nos
dois casos. **Guarde cópia dos dois.** Sem eles não é possível _atualizar_ o app
instalado: o Android recusa atualização assinada por outra chave, e a saída seria
desinstalar, perdendo o banco local do aparelho.

O APK entregue fica em `dist/` (ignorado pelo git).

---

## 8. Segurança

- **Isolamento por família** no Postgres (RLS com GUC de sessão) **e** revalidado
  na camada de serviço.
- **Segredos** só via Secret Manager; nunca `--set-env-vars` com valor sensível.
- **Sentry** com `sendDefaultPii: false`, captura só 5xx e etiqueta o **padrão**
  da rota, nunca a URL concreta — que carrega ids de família e de transação.
- **Log de envio de e-mail não carrega o `link`**: ele é credencial de uso único.
  Quem tem acesso ao log não deve poder assumir a conta.
- **Cartão**: nunca se armazena número completo, CVV ou credencial bancária.

### Checklist antes de considerar um deploy concluído

- [ ] `npm run verify` verde
- [ ] Migrações aplicadas **antes** do deploy da API
- [ ] `/health` responde `"environment":"production"` e `"database":"ok"`
- [ ] `/abrir/evil?token=…` devolve 400
- [ ] Sonda do Resend devolve 200
- [ ] `versionCode` do APK subiu
- [ ] `createBundleReleaseJsAndAssets` rodou **sem** `UP-TO-DATE`
- [ ] URL correta confirmada dentro do bundle

---

## 9. Custos (piloto)

Configuração escolhida para custar quase nada em repouso:

| Item | Configuração | Efeito |
|---|---|---|
| Cloud Run | `min-instances 0`, `max 2`, 512 MiB | Ocioso não cobra |
| Artifact Registry | retenção de 2 imagens | Impede o acúmulo que passa a cobrar |
| Supabase | plano gratuito | Sujeito a pausa por inatividade |
| Resend | plano gratuito | Cota diária de envio |

Números reais de fatura não estão neste documento — consulte o billing do
projeto.

---

## 10. Pendências

- **Domínio próprio para os links de e-mail.** Hoje a URL é a do Cloud Run, que
  não é apresentável. Trocar é mudar `PUBLIC_BASE_URL`; nada no código depende.
- **Nome no launcher** ainda é "FamilyFinance", não "Primate Wallet".
- **Projeto GCP antigo `primate-wallet`** (sem `-10`) continua de pé.
- **`ff_migrator` local é superusuário**, o de produção não. Enquanto isso valer,
  a suíte **não consegue** provar comportamento de RLS — foi o que escondeu o
  defeito de criar conta. `tests/schema-invariants.test.ts` cobre só a
  reincidência do `FORCE`.
- **`trustProxy: true`** com rate limit por IP: `X-Forwarded-For` forjado
  contorna o limite de 10/min das rotas de credencial.
- **`smoke.mjs`** usa `DATABASE_MIGRATION_URL` para dar `UPDATE` em `profiles`; o
  papel certo é `ff_auth`.
- **iOS** inteiro: exige macOS com Xcode.
- **Push (FCM/APNs)** e **bucket de anexos** não configurados.

---

## 11. Histórico de mudanças em produção

### 2026-08-19 — cancelamento em série, desfazer e baixa por compensação

Migração `0022`. Contas previstas ganharam: cancelar "esta e as próximas" de uma
série (desligando a regra de recorrência), desfazer um cancelamento inteiro pelo
lote, e **abater com lançamentos já registrados** — o caso "fiz consertos que
eram do proprietário e ele mandou abater do aluguel".

A compensação reaproveita a transação existente em vez de criar outra: o
dinheiro já saiu quando o conserto foi pago, e uma segunda movimentação contaria
a mesma despesa duas vezes.

### 2026-08-19 — criar conta dava 500 em produção (incidente)

Migração `0021`. As políticas chamam funções `SECURITY DEFINER` que leem a tabela
protegida; com `FORCE ROW LEVEL SECURITY` a dona ficava sujeita às políticas e a
leitura interna voltava vazia, fazendo `can_view_account` negar acesso a todo
mundo — inclusive ao Proprietário. A linha era inserida, o `SELECT` de volta não
achava nada e a transação desfazia.

**A suíte inteira estava verde.** O `ff_migrator` do docker é o `POSTGRES_USER`
do contêiner, logo superusuário com `BYPASSRLS`; o do Supabase é papel comum. O
mesmo código se comporta ao contrário nos dois ambientes.

### 2026-08-19 — ponte de links de e-mail

Revisão `00004-fkz`. O primeiro cadastro em aparelho real chegou ao e-mail e
parou: o botão não era clicável e o link colado no Chrome deu "endereço
inválido". Junto vieram os outros três elos do mesmo beco sem saída: o token
passou a valer 24h em vez de 1h, cadastro repetido em conta não confirmada passou
a reenviar o link, e o app ganhou o roteamento de `verificar-email`/`entrar` que
faltava — sem ele o token era descartado mesmo com o deep link funcionando.

### 2026-08-18 — e-mail transacional (Resend) e Sentry

Revisões `00002-ct8` (Sentry, `APP_ENV=production`) e `00003-7tw` (Resend).
`RESEND_API_KEY` e `SENTRY_DSN` viraram obrigatórias em produção: sem a primeira,
o cadastro cria conta que ninguém confirma.

### 2026-08-18 — implantação inicial

Projeto `primate-wallet-10`, Cloud Run `primatewallet-api`, Supabase com os três
roles `ff_*`, 5 segredos iniciais.

---

## Apêndice — Inventário de recursos

| Recurso | Valor |
|---|---|
| Projeto GCP | `primate-wallet-10` |
| Região | `southamerica-east1` |
| Serviço Cloud Run | `primatewallet-api` |
| URL da API | `https://primatewallet-api-479194115127.southamerica-east1.run.app` |
| Artifact Registry | `southamerica-east1-docker.pkg.dev/primate-wallet-10/cloud-run-source-deploy` |
| Imagem | `primatewallet-api` |
| Segredos | `primatewallet-{database-url,database-auth-url,database-migration-url,jwt-access-secret,jwt-refresh-secret,sentry-dsn,resend-api-key}` |
| Remetente de e-mail | `Primate Wallet <nao-responda@primatetechnology.com>` |
| Esquema de deep link | `familyfinance://` |
| Pacote Android | `com.primatetechnology.wallet` |
| Config do gcloud | `primate-wallet` |
