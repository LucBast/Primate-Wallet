# 21 — Decisões e premissas

Registro das decisões tomadas durante a implementação, conforme o processo do pacote
(docs/FAMILY_FINANCE_ALL_IN_ONE.md §21). Uma linha por decisão, com o motivo.

## Fase 0 — Fundação (2026-08-06)

### Ferramental

| # | Decisão | Motivo |
| - | ------- | ------ |
| D-001 | **TypeScript 6.0.3**, não 7.x | `typescript-eslint@8` (a linha atual) declara peer `typescript <6.1.0`. Com TS 7 o lint não instala. Revisitar quando o typescript-eslint suportar TS 7. |
| D-002 | **ESLint 9**, não 10 | `eslint-plugin-react@7.37.5` ainda declara peer `eslint ^9.7`. |
| D-003 | **Zod 4** | Versão atual; os contratos usam a API nova (`z.int()`, `z.email()`, `z.iso.datetime()`). |
| D-004 | **Vitest** no backend e nos pacotes, **Jest** no app | Vitest é o mais rápido para TypeScript puro; o app fica com Jest porque o preset oficial do React Native (`@react-native/jest-preset`) é a única configuração suportada para módulos nativos. |
| D-005 | **@node-rs/argon2** em vez de `argon2` | Binários pré-compilados: não exige toolchain nativa em cada máquina nem no CI. Mesmos parâmetros Argon2id recomendados pelo OWASP. |
| D-006 | **jose** para JWT | Puro JavaScript, sem dependência nativa, com API de verificação estrita. |
| D-007 | **node-pg-migrate** com migrações em SQL versionado | Atende docs/15 §4 (migrações versionadas, roll-forward). SQL puro mantém as policies de RLS legíveis e auditáveis. |
| D-008 | Pacotes do workspace são consumidos pelo **`dist` compilado** | É o que o Metro resolve em runtime; usar o mesmo caminho nos testes evita divergência entre bundle e teste. Vitest usa alias para o fonte apenas nos pacotes puros, onde não há bundler envolvido. |

### Banco e segurança

| # | Decisão | Motivo |
| - | ------- | ------ |
| D-010 | **Três roles de banco**: `ff_migrator` (DDL), `ff_app` (runtime, `NOBYPASSRLS`), `ff_auth` (só autenticação) | Sem um role sem `BYPASSRLS`, as policies não provam nada. O `ff_auth` existe porque login, cadastro e refresh acontecem ANTES de haver identidade de sessão — dar esse acesso ao role da aplicação anularia a política "negar por padrão". |
| D-011 | **Sem privilégio padrão de tabela** para `ff_app` | Cada migração concede explicitamente o que aquela tabela precisa, e por coluna quando há dado sensível. `password_hash` e `refresh_token_hash` ficam fora do alcance do role da aplicação — defesa em profundidade além da policy. |
| D-012 | Identidade da sessão via **GUC `app.user_id`** com `SET LOCAL` dentro de transação | Reverte automaticamente no fim da transação, então uma conexão devolvida ao pool nunca carrega identidade de outro usuário. `app.current_user_id()` retorna NULL sem sessão, o que faz as policies negarem por padrão. |
| D-013 | `audit_logs` já na Fase 0, com `household_id` nulo | As ações sensíveis de autenticação precisam de trilha desde o primeiro dia. A coluna `household_id` é preenchida a partir da Fase 1. |
| D-014 | Trilha de auditoria **append-only** | Nem `ff_app` nem `ff_auth` recebem UPDATE/DELETE em `audit_logs`. |
| D-015 | Refresh token no formato `<deviceId>.<segredo>`, guardado só em **hash SHA-256**, rotacionado a cada uso | Vazamento do banco não permite forjar sessão. Incluir o `deviceId` permite detectar reuso de um refresh antigo — indício de roubo — e revogar a sessão inteira. |
| D-016 | Rotação do refresh é **condicionada ao hash atual** (`UPDATE ... WHERE refresh_token_hash = $expected`) | Torna a rotação atômica: dois pedidos simultâneos com o mesmo token, só um vence; o perdedor é tratado como reuso. |
| D-017 | Efeitos colaterais que precedem um erro rodam em **transação própria** | Contagem de falhas de login e auditoria precisam ser comitadas mesmo quando a requisição termina em erro; na mesma transação do fluxo, o rollback apagaria o bloqueio de conta. |
| D-018 | **Anti-enumeração**: cadastro e magic link respondem sempre o mesmo corpo; login sempre `INVALID_CREDENTIALS`, com tempo equalizado por um hash fictício | docs/10 §2 exige proteção contra enumeração de contas. Conta bloqueada também responde `INVALID_CREDENTIALS`, para não confirmar existência. |
| D-019 | Sessão é revalidada no banco **a cada request autenticado** | Revogar um aparelho passa a ter efeito imediato, sem esperar o access token expirar. |
| D-020 | Envio de e-mail é uma **porta** (`Mailer`) com implementação de log em desenvolvimento | O provedor transacional é um segredo externo (conta contratada) — bloqueio legítimo do pacote. O contrato não muda quando ele chegar. |

### Design e app

| # | Decisão | Motivo |
| - | ------- | ------ |
| D-030 | `apps/mobile/src/design-system/tokens.ts` é **cópia byte a byte** de `design/design-tokens.ts`, verificada por teste | CLAUDE.md item 1. O teste falha se alguém editar a cópia; o arquivo também está no `.prettierignore` para o formatador não quebrar a igualdade. |
| D-031 | Lint bloqueia **literais de cor** (hex, rgb/hsl e cores nomeadas) fora de `tokens.ts`, e o import de kits de UI com tema próprio | CLAUDE.md itens 1 e 4, agora como gate automático e não como disciplina. |
| D-032 | Valores que a **COMPONENT-SPECS define mas os tokens não** ficam em `src/design-system/spec-values.ts`, cada um com a citação de origem | `tokens.ts` não pode ser editado, e espalhar números mágicos pelas telas seria pior. Exemplos: rótulo da BottomNav (10px em caixa mista, que nenhum token de `type` cobre), borda 1.5 dos botões secundários, line-height 1.5 dos banners. |
| D-033 | A sombra do botão central da BottomNav usa `colors.brand` com opacidade 0.35 | A especificação pede `rgba(20,110,100,0.35)`, e rgb(20,110,100) é exatamente `light.brand` (#146E64). Expressar pelo token evita literal de cor e mantém a sombra correta no tema escuro. |
| D-034 | O logotipo "F" da tela 6a usa 64px de caixa e glifo ExtraBold 30 (`spec-values.loginLogo`) | Medido no screenshot 6a-login.png; nenhum token de `type` cobre glifo de logotipo. Regra 8 de CLAUDE.md: dúvida visual → screenshot. |
| D-035 | **Fontes Manrope estáticas** (400/500/600/700/800) de `github.com/aaronbell/manrope`, upstream oficial do Google Fonts | O google/fonts publica só a versão variável `Manrope[wght].ttf`, que o React Native não renderiza de forma confiável no Android. Os nomes PostScript dos arquivos estáticos batem exatamente com os valores de `font` nos tokens. |
| D-036 | A **tab bar padrão do React Navigation não é usada**; a barra é o componente `BottomNav` e a aba ativa é estado local | O design exige 5 posições com botão central elevado e sombra colorida — impossível de reproduzir fielmente com a tab bar padrão (docs/01 §Mobile). |
| D-037 | Telas ainda não implementadas usam `PhasePlaceholder`, que declara a fase e o screenshot de aceite | Melhor do que uma tela em branco ou uma aproximação que passaria despercebida no gate visual. O componente deve desaparecer antes do release. |
| D-038 | Tokens de sessão no **Keychain/Keystore** (`react-native-keychain`), com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | docs/10 §8: nenhum segredo em AsyncStorage ou arquivo. O segredo não sai do aparelho nem por backup. |
| D-039 | Porta do Postgres de desenvolvimento: **5435**; porta da API: **3400** | 5432–5434 e 3333 já estavam ocupadas na máquina de desenvolvimento. Valores só de desenvolvimento; homologação e produção usam a configuração do ambiente. |

| D-040 | Os caminhos do Gradle apontam para o `node_modules` da **raiz do monorepo** (`../../../node_modules`), não para `apps/mobile/node_modules` | O npm workspaces iça as dependências para a raiz, mas o template do React Native assume `node_modules` ao lado do `package.json` do app. Sem isso o build falha em `com.facebook.react.settings`. Vale para `settings.gradle` e para o bloco `react {}` de `app/build.gradle`. |
| D-041 | `@babel/plugin-transform-export-namespace-from` é declarado explicitamente em `apps/mobile/babel.config.js` | O preset `@react-native/babel-preset` 0.86 deixou de incluir esse transform, e o zod 4 usa `export * as core from …` nos próprios arquivos. Sem o plugin o Metro derruba o bundle inteiro com SyntaxError dentro de `node_modules/zod`. Fixado na linha 7.x porque a 8.x exige `@babel/core` 8. |
| D-042 | ~~Altura da linha de valor do `Field` fixada em `spec-values.fieldValueHeight`~~ **SUPERSEDIDA pela D-045** | Era um contorno para a ausência de `lineHeight` nos tokens. Com a D-045 o campo fecha nos 53 do design por conta própria, e `design/COMPONENT-SPECS.md` passou a dizer explicitamente para não fixar `height`. |
| D-043 | O slot central da `BottomNav` tem largura fixa de 54 em vez de dividir os cinco espaços por igual | Com divisão igual sobram 75dp por item e "Movimentações" é truncado; o screenshot mostra o rótulo inteiro. Com 54 no centro sobram 81dp, suficientes. |
| D-044 | Nome duplicado de categoria devolve `VALIDATION_ERROR`, não 500 | A família nasce com categorias padrão, então repetir um nome é erro de usuário. A violação de unicidade subia como `INTERNAL_ERROR` e a tela mostrava "tente de novo" para sempre. |

| D-045 | Todo estilo de `type` tem `lineHeight` obrigatório, vindo dos tokens; nenhum componente calcula entrelinha | `design/CLARIFICATIONS-01.md` item 1. Sem `lineHeight` cada texto crescia pela métrica natural da Manrope e o erro acumulava por card — 15dp só no card de biometria da 6a. Removeu `spec-values.fieldValueHeight` e `spec-values.bannerLineHeightRatio`, que eram contornos dessa lacuna. |
| D-046 | **Consolidado = Σ contas** (sem descontar cartão); **Disponível = consolidado − cartões em aberto** | `design/CLARIFICATIONS-01.md`, consistente com `1b-inicio.png`. O app tinha os dois rótulos trocados. Patrimônio líquido seria um quarto número e não existe hoje — se for pedido, entra como campo novo, não redefinindo estes. |
| D-047 | Conta prevista já resolvida com vencimento anterior a hoje entra em **"Esta semana"** | Ela não é "vencida" (não tem saldo em aberto) nem está no futuro, e `1d-planejamento.png` não mostra o caso — o exemplo pago do screenshot vence depois de hoje. Regra do CLAUDE.md item 8: sem screenshot e sem COMPONENT-SPECS, escolher o mais próximo do existente em vez de inventar uma quarta seção com copy nova. |
| D-048 | As setas do seletor de mês são os glifos de texto **‹ ›**, não `chevron-left`/`chevron-right` do set de ícones | Medido em `1b-inicio.png` e `1d-planejamento.png`: o glifo tem 3–4dp de largura, contra ~10 de um chevron de 17. É a única exceção à regra de que toda seta vem do mapa de ícones, e está isolada no componente `MonthPicker`, usado pelas duas telas. |
| D-049 | `settledPercentage` **arredonda** (e nunca devolve 100 com saldo em aberto) | O design escreve "44% pago" para R$ 400,00 de R$ 910,10 (1d e 1e); truncando daria 43. O teto de 99 com saldo em aberto impede que o arredondamento sugira conta quitada. A proibição de `Math.round` do ESLint vale para dinheiro — aqui é percentual de exibição, e nenhum centavo é derivado dele. |
| D-050 | Os testes de integração rodam em um banco próprio (`TEST_DATABASE_NAME`) | Cada arquivo de teste dá TRUNCATE; enquanto apontavam para o banco de desenvolvimento, `npm run verify` apagava o seed dos screenshots e o gate visual ficava sem dados. `npm run db:test:prepare` cria o banco e repete os GRANT de `infra/postgres-init/01-roles.sql`, que são por banco. Vazio (CI) mantém o comportamento antigo, onde o Postgres já é efêmero. |

| D-051 | O seletor de data é o nativo do sistema (`@react-native-community/datetimepicker`), embrulhado em `DateField` | A 1e mostra "DATA · Hoje, 06/08 ▾", um select, não um campo onde se digita "2026-08-08". A proibição do CLAUDE.md item 4 é a kits de UI com tema próprio (Paper, NativeBase…); um seletor que abre o calendário do sistema operacional não desenha nada dentro da tela. A caixa fechada é o `SelectField`, que é o `Field` do COMPONENT-SPECS. |

## Decisões que exigem validação humana antes de produção

- Provedor de e-mail transacional (envio de confirmação e magic link).
- Contas de loja (App Store Connect, Play Console) e certificados de assinatura.
- DSN do Sentry por ambiente.
- Bucket S3-compatível para anexos e sua política de retenção.
- Texto jurídico da política de privacidade e dos termos.
