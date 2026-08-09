# 25 — Validar no aparelho (Android)

Como instalar o app num telefone real e usá-lo contra o backend desta máquina.
Escrito para o Galaxy S25 Ultra, mas serve para qualquer Android 8+ com arm64.

---

## O que o build de validação é

Um tipo de build próprio — `validation` —, e não um `debug` remendado. Ele
precisa de duas coisas que se contradizem em qualquer outro arranjo:

- **JS embutido e `debuggable false`.** Um build `debug` tenta o Metro antes de
  cair no bundle, e no telefone `10.0.2.2` não significa nada: a tela fica cinza
  esperando um servidor que não existe.
- **Texto claro permitido.** A API de desenvolvimento fala HTTP na rede local, e
  um `release` de verdade bloqueia isso antes da primeira tela.

Deixar o `release` aceitar texto claro para atender à segunda carregaria a
permissão até a loja. Aqui ela fica presa a um build cujo nome diz o que ele é.

O APK é assinado com a chave de debug: instala por USB, **não** serve para loja.

---

## 1. Descobrir o IP desta máquina

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object IPAddress, InterfaceAlias
```

Use o da interface **Wi-Fi** — na última medição, `192.168.1.158`. O telefone
precisa estar na MESMA rede.

## 2. Liberar a porta 3400 no firewall

**É aqui que costuma falhar.** O Windows bloqueia conexão de fora por padrão, e o
sintoma no telefone é "Sem conexão no momento" já na tela de login.

Num PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Family Finance API (dev)" `
  -Direction Inbound -LocalPort 3400 -Protocol TCP -Action Allow -Profile Private
```

Só perfil `Private`: a regra vale na rede de casa, não numa Wi-Fi pública.

Para conferir do próprio telefone, abra `http://192.168.1.158:3400/health` no
navegador dele. Tem de responder `{"status":"ok"…}`.

## 3. Gerar o APK

```bash
npm run db:up                              # Postgres
npm run dev --workspace @ff/api            # API, escutando em 0.0.0.0:3400
npm run seed:demo --workspace @ff/api      # Família Souza, se quiser dados

cd apps/mobile/android
FF_API_URL="http://192.168.1.158:3400" ./gradlew assembleValidation -PreactNativeArchitectures=arm64-v8a
```

`FF_API_URL` é embutido no bundle pelo Babel — o telefone não precisa de cabo,
de Metro, nem de editar código. Trocou de rede? Rode de novo com o IP novo.

O arquivo sai em
`apps/mobile/android/app/build/outputs/apk/validation/app-validation.apk`
(~29 MB, só arm64).

## 4. Instalar no telefone

Com o cabo e a **depuração USB** ligada (Ajustes › Opções do desenvolvedor):

```bash
adb devices                 # autorize o pareamento na tela do telefone
adb install -r app-validation.apk
```

Sem cabo: copie o APK para o telefone e abra pelo gerenciador de arquivos,
autorizando "instalar apps desconhecidos".

## 5. Entrar

`ana@email.com` / `familia-souza-2026` — a proprietária da família de
demonstração. `bruno@email.com` é adulto e `caio@email.com` é o filho
supervisionado, os três com a mesma senha.

---

## O que dá para validar, e o que não dá

**Funciona tudo que não depende de segredo externo:** as telas nos dois temas,
as regras financeiras, supervisão e aprovação, offline com o modo avião, atalhos
de pressão longa no ícone, deep links.

**Não funciona, e não é defeito:**

| O quê | Por quê |
| --- | --- |
| E-mail de convite e de recuperação de acesso | Sem provedor de e-mail; o link sai no log da API. Pegue-o lá e abra no telefone |
| Push | Depende de FCM |
| Anexos | Depende do bucket |
| A máquina desligada | O app fica offline: mostra o cache e enfileira lançamentos |

## Se der errado

| Sintoma | Causa mais provável |
| --- | --- |
| "Sem conexão" no login | Firewall (passo 2), ou telefone em outra rede |
| Instalação recusada | APK de outra assinatura já instalado — desinstale o antigo |
| App abre e fecha | APK sem a ABI do aparelho; confira o `-PreactNativeArchitectures` |
| Dados sumiram | `npm run verify` roda num banco separado, mas `seed:demo` recria a família do zero |

## Antes de publicar

O tipo `validation` **não** vai para a loja: ele aceita texto claro e é assinado
com a chave de debug. A loja usa `assembleRelease` com chave própria, e aí a API
já estará em HTTPS.
