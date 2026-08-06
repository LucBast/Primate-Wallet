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

## Decisões que exigem validação humana antes de produção

- Provedor de e-mail transacional (envio de confirmação e magic link).
- Contas de loja (App Store Connect, Play Console) e certificados de assinatura.
- DSN do Sentry por ambiente.
- Bucket S3-compatível para anexos e sua política de retenção.
- Texto jurídico da política de privacidade e dos termos.
