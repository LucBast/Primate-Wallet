# 01 — Decisões de stack (substitui o 07-ARCHITECTURE do pacote)

Data: 2026-08-06 · Decisão do proprietário do projeto. Registrar mudanças futuras em 21-DECISIONS.

## Mobile — React Native CLI (sem Expo)
- \`react-native init\` + TypeScript strict; arquitetura por feature igual à estrutura do pacote.
- Navegação: React Navigation (bottom tabs custom — ver COMPONENT-SPECS "BottomNav"; NÃO usar a tab bar padrão).
- Formulários: React Hook Form + Zod. Estado de servidor: TanStack Query. Estado local: Zustand.
- Fontes: TTFs Manrope no bundle (ios/Android assets + react-native.config.js).
- Deep links: \`Linking\` + esquema \`familyfinance://\` (rotas do doc 12).
- Atalhos do ícone: Quick Actions (iOS) / App Shortcuts (Android) via módulo nativo ou react-native-quick-actions; abrem o MESMO formulário do botão "+" via deep link; sessão expirada → login → retomar intenção.
- Push: FCM + APNs (@react-native-firebase/messaging + Notifee para canais/horários).
- Biometria: react-native-biometrics (bloqueio local opcional). Segredos de sessão: react-native-keychain.

## Offline — WatermelonDB
- Espelha as tabelas de leitura do modelo de dados (accounts, categories, members, planned_entries, transactions, card_statements, notifications) + tabela \`outbox\`.
- Outbox: id local, idempotency_key, tipo de comando, payload JSON, created_at, tentativas, último erro, status (pending | syncing | done | failed).
- Sincronização: protocolo \`synchronize()\` do Watermelon com endpoints \`/sync/pull\` e \`/sync/push\` no backend (changes + timestamp). Dados financeiros postados: servidor SEMPRE vence; nunca mesclar valores automaticamente (diálogo de conflito da matriz de estados).
- Escrita offline permitida SÓ para: despesa, receita, compra simples no cartão, criação de conta prevista. Baixa, pagamento de fatura, transferência, estorno e aprovação exigem conexão (erro OFFLINE_OPERATION_REJECTED).

## Backend — PostgreSQL próprio
- Node/TypeScript (Fastify ou NestJS) com os contratos Zod do doc 09 compartilhados em packages/api-contracts.
- Auth: JWT próprio (access + refresh com rotação, sessões revogáveis em tabela \`devices\`), e-mail/senha + magic link. (Substitui Supabase Auth.)
- RLS: policies nativas do Postgres usando GUC de sessão (\`SET LOCAL app.user_id = ...\`) definida por request em transação; toda tabela familiar filtrada por household_id via membership. Revalidar permissões também na camada de serviço.
- Funções financeiras críticas (baixa, estorno, transferência, compra parcelada, pagamento de fatura, aprovação, ajuste) como transações SERIALIZABLE/row-lock com verificação de \`version\` e \`idempotency_key\` única.
- Migrações: SQL versionado (node-pg-migrate ou dbmate). Schema = doc 08 do pacote.
- Storage de anexos: bucket S3-compatível privado, caminho com household_id, URL assinada.
- Jobs (recorrência, notificações, reconciliação): BullMQ + Redis, ou pg_cron; respeitar fuso da família.
- Observabilidade: Sentry (app) + logs estruturados com request_id/idempotency_key.

## O que NÃO muda
Regras de domínio (doc 04), modelo de dados (08), contratos (09), segurança (10), offline/estratégia (11), notificações (12), testes (13), observabilidade (14), operações (15), plano de fases (16), critérios de aceite (17), checklist de release (22).
