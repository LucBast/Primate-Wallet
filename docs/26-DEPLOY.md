# 26 — Deploy: Supabase, Cloud Run e o APK

> **Este arquivo deixou de ser o roteiro.** O documento canônico de deploy é
> `docs/DEPLOY_PRODUCAO.md`, no mesmo padrão usado no PlugVendas: inventário de
> contas, componentes, roteiro, checklist, custos e histórico de mudanças em
> produção.
>
> O que sobra aqui é o caderno de justificativas — o "por quê" longo de decisões
> pontuais, útil quando algo dá errado e o roteiro não explica o motivo.


Como o Family Finance sai desta máquina e vai para o ar. Três peças, nesta
ordem — cada uma depende da anterior:

| Peça | Onde | Identificador |
| --- | --- | --- |
| Banco | Supabase, região São Paulo (`sa-east-1`) | projeto `<PROJECT_REF>` |
| Backend | Google Cloud Run, `southamerica-east1` | projeto `primate-wallet-10`, serviço `primatewallet-api` |
| App | APK release, instalado por `adb` | `com.primatetechnology.wallet` |

Conta Google do deploy: **primate.tech.app@gmail.com**.

---

## 0. As decisões que este arranjo já tomou

Vale ler antes de mudar qualquer coisa: cada uma resolve um problema concreto.

**O banco é o Supabase, mas nada do Supabase é usado além do Postgres.** Sem
Supabase Auth, sem PostgREST, sem Storage. A autenticação é a do backend
(`apps/api/src/modules/auth`), e as tabelas nascem sem GRANT para `anon` ou
`authenticated` — logo a API REST pública do Supabase não enxerga nenhuma delas.
Isso é consequência de as migrações rodarem como `ff_migrator`: os padrões de
privilégio que o Supabase instala valem para objetos criados pelo `postgres`.

**A conexão é o POOLER na porta 5432 (modo sessão)**, não a conexão direta e não
o modo transação (6543). Dois motivos, os dois eliminatórios:

- a conexão direta do Supabase é só IPv6, e o Cloud Run sai por IPv4;
- o modo transação devolve a conexão a cada COMMIT, e o agendador
  (`apps/api/src/jobs/scheduler.ts`) depende de `pg_try_advisory_lock`, que é
  travado por **sessão**. No modo transação a trava seria solta cedo demais e
  duas instâncias rodariam o mesmo ciclo.

No pooler o usuário carrega o ref do projeto: `ff_app.<PROJECT_REF>`.

**Três roles de banco, nenhum deles o `postgres` do Supabase.** O `postgres`
ignora RLS; usá-lo como runtime tornaria decorativo todo o isolamento por
família. `ff_app` é `NOBYPASSRLS` de propósito — é o que faz as policies
morderem. Ver `infra/supabase/01-provision-roles.sql`.

**As migrações rodam desta máquina, não do container.** A imagem não leva
`db/migrations`. Migração é passo controlado (docs/15 §4): você olha o resultado
antes de trocar a versão que serve tráfego.

**O app fala com a URL do Cloud Run, não com um domínio próprio.** Não é
preferência: `southamerica-east1` não aceita mapeamento de domínio, e a API
responde `501 Creating domain mappings is not allowed in southamerica-east1`.
As saídas seriam sair de São Paulo (o banco está em São Paulo, e cada consulta
passaria a cruzar o continente), um balanceador de carga a ~US$ 18/mês, ou um
proxy na Cloudflare — que trocaria a dependência do Google pela dependência da
Cloudflare, com o agravante de o APK não ter como cair de volta na URL direta.
O motivo original de querer o domínio era a URL ficar presa a um projeto que
ainda podia mudar de dono; isso acabou quando o deploy passou para a conta
definitiva. Revisitar quando existir cliente web, que vai querer domínio de
qualquer forma.

**O `release` não assina com a chave de debug.** `apps/mobile/android/app/build.gradle`
recusa `assembleRelease` sem a chave de upload configurada. Um APK debug-signed
instala e abre — e o problema só aparece na hora de atualizar, quando trocar a
chave exige desinstalar o app e perder o banco local.

---

## 1. Banco — Supabase

### 1.1 Criar o projeto

No [supabase.com](https://supabase.com), **New project**:

- Região: **South America (São Paulo)** — mesma região do Cloud Run, senão cada
  consulta atravessa o continente duas vezes.
- Anote a senha do `postgres` (ela não é usada pelo app, mas é a sua chave mestra).
- O `PROJECT_REF` aparece em *Settings › General* e também no host do pooler.

### 1.2 Criar os roles

*SQL Editor* › cole o conteúdo de **`infra/supabase/01-provision-roles.local.sql`**
(a versão já preenchida com as senhas; a versionada tem só marcadores) › **Run**.

A última consulta do script confere o resultado. Os três roles têm de sair com
`rolbypassrls = false`. Se algum sair `true`, pare: a RLS não vale para ele.

### 1.3 Preencher as credenciais

Em `.env.production.local` (fora do git), troque `<PROJECT_REF>` nas três URLs e
confira o host do pooler em *Settings › Database › Connection pooling* — o
prefixo `aws-1-` muda conforme o projeto.

### 1.4 O certificado do Supabase

O pooler é servido pela **"Supabase Root 2021 CA"**, que é auto-assinada e não
está no repositório de CAs do Node. O runtime conecta com
`rejectUnauthorized: true` (`apps/api/src/db/pool.ts`), então sem tratar isso a
conexão morre em `SELF_SIGNED_CERT_IN_CHAIN` — e o `/health` reporta só
`database: "error"`, sem dizer por quê.

A saída **não** é desligar a verificação: o que trafega ali é a credencial do
banco, e sem verificar o certificado a conexão continua cifrada mas fica aberta a
quem se ponha no meio. A saída é ensinar a raiz, em `DATABASE_SSL_CA` (PEM em
base64). A raiz versionada em `infra/supabase/prod-ca-2021.crt` foi baixada por
HTTPS da Supabase e conferida contra a que o pooler apresenta no fio — as
impressões digitais SHA-256 batem.

Para regenerar o valor:

```bash
node -e "console.log(require('fs').readFileSync('infra/supabase/prod-ca-2021.crt').toString('base64'))"
```

Antes de migrar, confirme os três roles e o TLS de uma vez:

```bash
node --env-file=.env.production.local apps/api/scripts/check-db.mjs
```

A sonda distingue as três falhas que se parecem no log — host do pooler errado,
roles inexistentes e cadeia de certificado. `[estrito]: ok` nos três é o sinal
verde. Se aparecer `ECIRCUITBREAKER`, o pooler bloqueou temporariamente por
tentativas seguidas de autenticação falha: espere um minuto.

### 1.5 Migrar

```bash
# Da raiz do repositório. Lê APP_ENV e DATABASE_MIGRATION_URL do arquivo.
node --env-file=.env.production.local apps/api/scripts/migrate.mjs up
```

Saem as 20 migrações, de `0001_foundation` a `0020_notification_plural`.
Conferência: no *Table Editor* do Supabase têm de existir `households`,
`accounts`, `transactions` e o schema `app`.

---

## 2. Backend — Cloud Run

### 2.1 Uma vez por projeto

`gcloud config set` escreve na configuração ATIVA, que nesta máquina é a de
outro projeto (`primate-medicine`). Rodar os comandos abaixo sem isolamento
sequestra a conta e o projeto padrão do outro trabalho — e o estrago só aparece
no próximo deploy de lá. Por isso uma configuração nomeada, escolhida por
variável de ambiente e não por comando global:

```bash
gcloud config configurations create primate-wallet   # só na primeira vez

export CLOUDSDK_ACTIVE_CONFIG_NAME=primate-wallet    # em TODO shell de deploy
gcloud config set account primate.tech.app@gmail.com
gcloud config set project primate-wallet-10

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
```

Com a variável exportada, os `config set` acima gravam só nessa configuração; a
`default` continua apontando para onde apontava. Confira antes de cada deploy:

```bash
gcloud config list account project    # primate.tech.app@gmail.com / primate-wallet-10
```

Para um comando avulso, sem exportar nada, servem os flags
`--account=primate.tech.app@gmail.com --project=primate-wallet-10`.

### 2.2 Segredos no cofre, não na configuração do serviço

docs/02 §Regras pede segredo vindo do cofre do ambiente. Variável de ambiente do
Cloud Run aparece em texto claro para quem abrir o console; o Secret Manager
registra cada leitura e permite rotação sem redeploy.

```bash
# Cria os cinco segredos a partir do .env.production.local.
for K in DATABASE_URL DATABASE_AUTH_URL DATABASE_MIGRATION_URL \
         JWT_ACCESS_SECRET JWT_REFRESH_SECRET SENTRY_DSN; do
  NAME="primatewallet-$(echo $K | tr 'A-Z_' 'a-z-')"
  grep "^$K=" .env.production.local | cut -d= -f2- | tr -d '\r\n' \
    | gcloud secrets create "$NAME" --data-file=- --replication-policy=automatic
done

# A conta de serviço padrão do Cloud Run precisa poder LER cada um.
PN=$(gcloud projects describe primate-wallet-10 --format='value(projectNumber)')
for NAME in primatewallet-database-url primatewallet-database-auth-url primatewallet-database-migration-url \
            primatewallet-jwt-access-secret primatewallet-jwt-refresh-secret primatewallet-sentry-dsn \
            primatewallet-resend-api-key; do
  gcloud secrets add-iam-policy-binding "$NAME" \
    --member="serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

`DATABASE_MIGRATION_URL` entra mesmo sem ser usada em runtime: `config/env.ts`
a exige no startup. É deliberado — a configuração valida que a credencial de
migração existe, e o processo não a expõe a nenhuma consulta.

### 2.3 Deploy

A CA do Supabase vai como variável comum, não como segredo: é um certificado
público. Ela é longa, então entra por substituição — e base64 não contém vírgula,
que é o separador que o `--set-env-vars` usa.

```bash
CA=$(grep '^DATABASE_SSL_CA=' .env.production.local | cut -d= -f2-)

gcloud run deploy primatewallet-api \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 2 \
  --set-env-vars "^;^APP_ENV=production;NODE_ENV=production;LOG_LEVEL=info;API_CORS_ORIGINS=https://wallet.primatetechnology.com;DATABASE_POOL_MAX=5;DATABASE_SSL=true;DATABASE_SSL_CA=${CA};JWT_ACCESS_TTL=900;JWT_REFRESH_TTL=2592000;JWT_ISSUER=family-finance;SENTRY_TRACES_SAMPLE_RATE=0.1;EMAIL_FROM=Primate Wallet <nao-responda@primatetechnology.com>;PUBLIC_BASE_URL=https://primatewallet-api-479194115127.southamerica-east1.run.app" \
  --set-secrets "DATABASE_URL=primatewallet-database-url:latest,DATABASE_AUTH_URL=primatewallet-database-auth-url:latest,DATABASE_MIGRATION_URL=primatewallet-database-migration-url:latest,JWT_ACCESS_SECRET=primatewallet-jwt-access-secret:latest,JWT_REFRESH_SECRET=primatewallet-jwt-refresh-secret:latest,SENTRY_DSN=primatewallet-sentry-dsn:latest,RESEND_API_KEY=primatewallet-resend-api-key:latest"
```

O `^;^` no começo do `--set-env-vars` troca o separador de vírgula para `;`:
`API_CORS_ORIGINS` é uma lista separada por vírgula, e sem essa troca uma
segunda origem quebraria o argumento em dois.

`--allow-unauthenticated` é o correto aqui: quem autentica é o JWT da própria
API, não o IAM do Google. O app não tem como carregar credencial do Google.

Conferência:

```bash
URL=$(gcloud run services describe primatewallet-api --region southamerica-east1 --format='value(status.url)')
curl -s "$URL/health"     # {"status":"ok",...,"checks":{"database":"ok"}}
```

`database: "ok"` é o que prova que o pooler, o SSL e o role `ff_app` estão todos
de pé. `"error"` ali é quase sempre credencial ou host do pooler.

### 2.4 O preço do `--min-instances 0`, e quando trocar

Com zero instâncias mínimas o container congela quando ninguém usa, e o
agendador de 15 em 15 minutos congela junto. Na prática o ciclo roda **no
arranque a frio** (`startScheduler` dispara `tick()` de imediato), ou seja:
sempre que alguém abre o app. Para uma família, aviso de vencimento gerado
quando alguém abre o app é suficiente — e custa praticamente nada.

Se um dia o aviso precisar sair sem ninguém abrir o app (push às 8h, por
exemplo), troque para `--min-instances 1 --no-cpu-throttling`. Aí sim há uma
instância acordada o tempo todo, e uma conta mensal fixa.

### 2.5 Logs

```bash
gcloud run services logs read primatewallet-api --region southamerica-east1 --limit 50
```

É onde saem os links de convite e de recuperação de acesso enquanto não houver
provedor de e-mail (`createLogMailer`, PROGRESS.md §Bloqueios). Procure por
`"E-mail (dev)"`.

### 2.6 Sentry: virar de `staging` para `production`

> **Executado em 2026-08-18.** O segredo `primatewallet-sentry-dsn` existe e a
> revisão `primatewallet-api-00002-ct8` serve 100% do tráfego com
> `"environment":"production"` no `/health`. O resto da seção fica como
> runbook: é o caminho para trocar o DSN ou refazer o serviço do zero.

O serviço subiu como `APP_ENV=staging` por um motivo só: `config/env.ts` exige
`SENTRY_DSN` quando o ambiente é `production`, e o DSN não existia ainda. Não é
gosto — é a regra de docs/14 §1 sendo cumprida pela validação de ambiente.

O que o DSN muda de fato, no código:

- `main.ts` chama `Sentry.init` com `sendDefaultPii: false`. Corpo de requisição
  nunca sai daqui: ele carrega senha e valor financeiro.
- `http/error-handler.ts` chama `captureException` **só** para 5xx. Isto é
  explícito porque o handler responde ao cliente e encerra o erro ali: sem a
  chamada, o Sentry veria a queda do container, nunca um 500 de rota. Os 4xx
  ficam de fora de propósito — senha errada e regra de negócio negada são fluxo
  esperado, não incidente.
- A tag de rota é o PADRÃO (`/households/:id/accounts`), nunca a URL concreta,
  que carrega identificador de família e de lançamento.

Criar o segredo e redeployar:

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=primate-wallet

printf '%s' 'https://…@o….ingest.us.sentry.io/…' \
  | gcloud secrets create primatewallet-sentry-dsn --data-file=- --replication-policy=automatic

PN=$(gcloud projects describe primate-wallet-10 --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding primatewallet-sentry-dsn \
  --member="serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

gcloud run services update primatewallet-api --region southamerica-east1 \
  --update-env-vars "APP_ENV=production,SENTRY_TRACES_SAMPLE_RATE=0.1" \
  --update-secrets "SENTRY_DSN=primatewallet-sentry-dsn:latest"
```

`services update` em vez de `run deploy`: a imagem não mudou, então não há por
que passar pelo Cloud Build de novo. `--update-env-vars` preserva as demais
variáveis — `--set-env-vars` as apagaria, inclusive a CA do Supabase.

Conferência — o `/health` tem de passar a dizer `production`:

```bash
curl -s "$URL/health"     # {"status":"ok",...,"environment":"production",...}
```

Se disser `error` no banco depois da virada, é a CA que se perdeu: confirme que
`DATABASE_SSL_CA` continua no serviço (`gcloud run services describe`).

---

### 2.7 E-mail transacional (Resend)

> **Executado em 2026-08-18.** Segredo `primatewallet-resend-api-key` criado e
> a revisão `primatewallet-api-00003-7tw` já sobe com `createResendMailer`.

Por que é bloqueante e não "melhoria": `register` grava o perfil, gera um token
de verificação de uso único (válido 24h, ver D-093) e manda o link por e-mail; `login`
recusa com `EMAIL_NOT_VERIFIED` enquanto isso não acontece. Com o mailer de log,
a pessoa se cadastra, lê "verifique seu e-mail" e o e-mail nunca chega — o link
fica só no log do Cloud Run. Por isso `config/env.ts` passa a exigir
`RESEND_API_KEY` em produção, do mesmo jeito que já exigia o `SENTRY_DSN`.

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=primate-wallet

# A chave vem de https://resend.com/api-keys — use a de ENVIO apenas. Uma chave
# de acesso total daria a quem lesse o segredo o poder de listar domínios e
# emitir outras chaves.
printf %s "re_..." \
  | gcloud secrets create primatewallet-resend-api-key --data-file=- --replication-policy=automatic

gcloud secrets add-iam-policy-binding primatewallet-resend-api-key \
  --member="serviceAccount:479194115127-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

gcloud run deploy primatewallet-api --source . --region southamerica-east1 \
  --update-env-vars "EMAIL_FROM=Primate Wallet <nao-responda@primatetechnology.com>" \
  --update-secrets "RESEND_API_KEY=primatewallet-resend-api-key:latest"
```

O domínio do remetente precisa estar **verificado** no Resend (registros DNS no
painel deles). Como a chave de envio não lê `/domains`, o jeito de conferir sem
incomodar ninguém é mandar para o destinatário de simulação do próprio Resend,
que não chega a caixa nenhuma. `200` = chave válida e domínio verificado; `403`
com `Domain not verified` = DNS pendente:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
  -d '{"from":"Primate Wallet <nao-responda@primatetechnology.com>","to":["delivered@resend.dev"],"subject":"probe","text":"probe"}'
```

---

### 2.8 Ponte de links de e-mail (`PUBLIC_BASE_URL`)

> **Executado em 2026-08-19**, revisão `primatewallet-api-00004-fkz`.

O primeiro cadastro real em aparelho mostrou o defeito: o e-mail chegou, mas o
botão não era clicável, e o link colado no Chrome deu "endereço inválido". A
causa é estrutural, não de formatação: `familyfinance://` não é `http(s)`,
então cliente de e-mail nenhum o transforma em link e o navegador trata texto
colado como busca.

A correção é uma página https servida pela própria API
(`apps/api/src/http/link-bridge.ts`). O e-mail aponta para
`<PUBLIC_BASE_URL>/abrir/<rota>?token=…`; a página traz um botão com o deep
link, e o toque — por ser gesto do usuário dentro de uma página — faz o
Android entregar o intent ao app. Vale para as quatro rotas que mandam e-mail:
`verificar-email`, `entrar`, `senha-nova` e `convite`.

A página não consome o token nem toca no banco, de propósito: antivírus de
e-mail corporativo abre todo link da mensagem antes de a pessoa ler, e uma
página que confirmasse sozinha queimaria o token no robô (D-090).

```bash
gcloud run deploy primatewallet-api --source . --region southamerica-east1   --update-env-vars "PUBLIC_BASE_URL=https://primatewallet-api-479194115127.southamerica-east1.run.app"
```

Conferência — a segunda linha tem de dar `400`, senão a ponte virou
redirecionador aberto:

```bash
B=https://primatewallet-api-479194115127.southamerica-east1.run.app
T=$(python3 -c 'print("A"*43)')
curl -s "$B/abrir/verificar-email?token=$T" | grep -o 'href="[^"]*"'
curl -s -o /dev/null -w "%{http_code}
" "$B/abrir/evil?token=$T"
```

Junto vieram os outros três elos do mesmo beco sem saída (D-093, D-094, D-095):
a confirmação passou a valer 24h em vez de 1h, cadastrar de novo num e-mail
ainda não confirmado reenvia o link, e o app ganhou o roteamento de
`verificar-email`/`entrar` que faltava em `linking` — sem ele o token era
descartado mesmo com o deep link funcionando.

**Ainda aberto:** a URL do e-mail é a do Cloud Run, que não é apresentável.
Trocar por um domínio próprio é só mudar `PUBLIC_BASE_URL` — nada no código
depende disso.

---

## 3. App — APK release

A chave de upload é `C:/Users/lucia/keys/familyfinance-upload.keystore`, e as
senhas estão em `C:/Users/lucia/.gradle/gradle.properties` — fora do repositório,
nos dois casos. **Guarde uma cópia dos dois.** Sem eles não é possível
_atualizar_ o app instalado: o Android recusa atualização assinada por outra
chave, e a saída seria desinstalar (perdendo o banco local do aparelho).

**O JDK importa.** O `java` do PATH desta máquina é o 26, e o Android Gradle
Plugin não trabalha com ele: a build morre em `JdkImageTransform`, com o `jlink`
falhando ao gerar o `jdkImage`. Use o JDK 21 que vem com o Android Studio. Não
está fixado em `gradle.properties` de propósito — o caminho é desta máquina, e
`~/.gradle/gradle.properties` vale para todo projeto Gradle daqui, inclusive os
que talvez precisem de outra versão.

```powershell
cd apps/mobile/android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:FF_API_URL = "https://primatewallet-api-479194115127.southamerica-east1.run.app"
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

**Se `FF_API_URL` mudou desde a última build, apague o bundle antes.** O Gradle
decide reexecutar uma tarefa olhando arquivos de entrada; variável de ambiente
não é arquivo, então `createBundleReleaseJsAndAssets` fica `UP-TO-DATE` e o APK
sai com a URL ANTIGA — build bem-sucedida, assinatura correta, tudo verde. Foi
assim que quase instalei um app apontando para o projeto que ia ser apagado.

```powershell
# Barra normal funciona no PowerShell e dispensa escape.
Remove-Item -Recurse -Force app/build/generated/assets/react/release,
  app/build/intermediates/assets/release,
  app/build/intermediates/compressed_assets/release
```

O sinal de que funcionou é a linha `> Task :app:createBundleReleaseJsAndAssets`
SEM `UP-TO-DATE` na saída da build.

Duas conferências valem o minuto que custam — as duas falham em silêncio:

```powershell
# 1. Assinado com a chave certa? Tem de sair CN=Family Finance, não Android Debug.
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\<versão>\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk

# 2. A URL foi embutida? Se FF_API_URL não chegou ao Babel, o app cai no padrão
#    `https://api.familyfinance.app`, que não existe — e o sintoma no telefone é
#    "sem conexão", idêntico ao de firewall.
```

Para a segunda, extraia `assets/index.android.bundle` do APK e procure a URL: o
Babel a troca por um literal, então ela está lá em texto.

`FF_API_URL` é trocado pelo Babel por um literal dentro do bundle
(`apps/mobile/src/services/config.ts`) — o telefone não precisa de cabo, de
Metro, nem de editar código. HTTPS aqui é obrigatório: o `release`, ao contrário
do `validation`, bloqueia texto claro.

### Nome do arquivo

O APK sai como `primatewallet-<versionName>-build<versionCode>.apk` — por
exemplo `primatewallet-1.0.1-build2.apk`. O nome vem do próprio Gradle
(`applicationVariants` em `app/build.gradle`), não de um `mv` depois da build,
para que arquivo e conteúdo nunca discordem. Os dois números saem de
`appVersionName` / `appVersionCode`, declarados uma vez no topo do mesmo
arquivo.

**`versionCode` tem de subir a cada APK entregue.** É o que o Android compara
para decidir se é atualização; repetir o número faz o instalador recusar em
alguns aparelhos, com a mensagem genérica "app não instalado". `versionName` é
só rótulo humano e pode repetir.

Instale com:

```bash
adb install -r app/build/outputs/apk/release/primatewallet-1.0.1-build2.apk
```

> Se já houver no aparelho o APK de validação (`build/FamilyFinance-validacao.apk`),
> **desinstale antes**: é a mesma `applicationId` com outra assinatura, e o
> Android recusa a instalação por cima.

### 3.1 Primeiro acesso, sem provedor de e-mail

Atenção: **o login exige e-mail confirmado** (`EMAIL_NOT_VERIFIED`,
`modules/auth/service.ts`). Sem provedor de e-mail contratado, o link de
confirmação não é enviado — ele sai no log do Cloud Run. O caminho, uma vez por
pessoa:

1. Cadastre-se pela tela do app.
2. Pegue o link no log:

   ```bash
   gcloud run services logs read primatewallet-api --region southamerica-east1 --limit 20 \
     | grep verificar-email
   ```

   Sai como `https://…/abrir/verificar-email?token=…` quando `PUBLIC_BASE_URL`
   está configurada (§2.8), ou como `familyfinance:///verificar-email?token=…`
   sem ela.
3. Abra o link no telefone. A página https mostra um botão; o toque abre o app,
   que confirma o e-mail e **já devolve a sessão** — sem login depois.

Em produção o envio é real (`createResendMailer`); o mailer de log só entra
quando `RESEND_API_KEY` está vazia, o que `env.ts` proíbe em produção.

---

## 4. O que continua não funcionando, e por quê

Nada disto é defeito do deploy; é dependência externa ainda não contratada
(PROGRESS.md §Bloqueios):

| O quê | Falta |
| --- | --- |
| E-mail de convite e recuperação | Provedor transacional. O link sai nos logs do Cloud Run |
| Push | Projeto FCM |
| Anexos | Bucket S3-compatível (`STORAGE_*` vazias) |
| App no iPhone | macOS com Xcode |

### 4.1 `smoke.mjs` não roda contra este ambiente

Descoberto ao executá-lo pela primeira vez contra um ambiente de verdade. São
dois defeitos, e o primeiro esconde o segundo:

1. **Papel errado.** O script usa `DATABASE_MIGRATION_URL` para confirmar o
   e-mail do usuário de teste. Mas todas as 24 tabelas têm `FORCE ROW LEVEL
   SECURITY` e **não existe policy alguma para `ff_migrator`** — então o
   `UPDATE` afeta zero linhas **sem levantar erro**. O login seguinte responde
   403 corretamente, e o teste acusa "login devolve sessão" como se o defeito
   estivesse ali. O papel certo para essa operação é `ff_auth`, que tem a policy
   `profiles_auth_service` e o privilégio de `UPDATE`.

2. **A limpeza é impossível como está escrita.** O cabeçalho promete "cria uma
   família descartável e a apaga no fim". Nenhum dos três roles tem `DELETE` em
   `profiles`, e não há policy de `DELETE` em `households`. A limpeza sempre
   falharia calada (o `.catch` só imprime um aviso).

Enquanto não for corrigido, **não rode o smoke contra o ambiente em uso**: ele
deixa perfil e família para trás. Para remover um rastro desses, a exclusão
lógica via `ff_auth` funciona e é o mecanismo que o schema prevê:

```sql
UPDATE profiles SET deleted_at = now() WHERE email LIKE 'smoke-%@exemplo.invalid';
```

O índice único de e-mail é `WHERE deleted_at IS NULL`, então isso libera o
endereço de novo.

---

## 5. Redeploy

Backend, depois de mexer em `apps/api` ou nos pacotes:

```bash
gcloud run deploy primatewallet-api --source . --region southamerica-east1
```

As variáveis e os segredos já configurados permanecem — não é preciso repetir as
flags.

Banco, ao acrescentar migração:

```bash
node --env-file=.env.production.local apps/api/scripts/migrate.mjs up
```

Sempre **antes** do deploy do backend que depende dela, e sempre compatível com
a versão ainda no ar (roll-forward; `reset` é recusado em produção).

App: `assembleRelease` de novo, com `versionCode` incrementado em
`apps/mobile/android/app/build.gradle` — sem isso o Android recusa a atualização.
