# 24 — Checklist de release (docs/22)

Status real em **2026-08-09**. A regra do pacote é explícita: só marcar o
projeto como pronto quando todo item aplicável estiver concluído **ou**
explicitamente documentado como bloqueio de responsabilidade humana.

Legenda: **✓** feito e verificado · **⏳** feito, falta verificar no ambiente
real · **🔒** bloqueio humano (conta, segredo, revisão jurídica ou hardware) ·
**✕** não feito.

Nenhum item foi marcado ✓ por inspeção de código apenas — ✓ significa que existe
teste automatizado passando, medição de pixel, ou verificação manual registrada.

---

## Design

| Item | Estado | Onde se comprova |
| --- | --- | --- |
| Design system completo | ✓ | `src/design-system/`, tokens verbatim, lint proíbe literal de cor |
| Tema claro | ✓ | 26 telas medidas em pixel contra `design/screenshots/` |
| Tema escuro | ⏳ | 15 telas reconferidas (1b–1g, 2a, 3a, 3b, 3c, aprovações, 8c, 8d, 8g). Faltam 2b, 2c, 2d, 2e, 3d, 4b, 4c, 6a, 8a, 8b, 8e, 8f |
| Estados de loading | ✓ | `components/states.tsx`, usado em todas as listas |
| Estados vazios | ✓ | idem |
| Estados de erro | ✓ | idem |
| Estados offline | ✓ | verificado no emulador em modo avião |
| Estados sem permissão | ✓ | `states.tsx` + testes de matriz de permissões |
| Acessibilidade revisada | ✓ | varrimento de `Pressable` sem `accessibilityRole`/`Label`; achou o defeito do "Esqueci a senha" |
| Copy revisada | ✓ | comparada verbatim com SCREEN-SPECS nas telas medidas |

## Mobile

| Item | Estado | Observação |
| --- | --- | --- |
| Android build | ✓ | APK debug instalado e exercitado no emulador |
| iOS build | 🔒 | Exige macOS + Xcode. Não existe nesta máquina |
| Deep links | ⏳ | Rotas declaradas (`entrar`, `verificar-email`, `senha-nova`, `novo`); exercitadas por navegação, não por `adb shell am start -d` |
| Atalhos do ícone | ✕ | Fase 8 entregou o lançamento rápido; os atalhos do ícone não |
| Push | 🔒 | Depende de FCM/APNs |
| Upload de anexos | ⏳ | Registro e caminho escopado prontos; falta o bucket |
| Cache | ✓ | WatermelonDB; lista offline verificada no emulador |
| Offline | ✓ | Modo avião: lançamento salvo, faixa correta, envio ao voltar |
| Sincronização | ✓ | idem, sem duplicar |
| Biometria opcional | ⏳ | Card na 6a; ativação real não exercitada |
| Sem segredos no bundle | ✓ | `services/config.ts` só tem URL e esquema; scan no CI |

## Backend

| Item | Estado | Observação |
| --- | --- | --- |
| Migrações | ✓ | 0001–0016, idempotência de re-execução exercitada no CI |
| Constraints | ✓ | CHECK, UNIQUE e FK em todas as tabelas financeiras |
| Índices | ✓ | Revisados na Fase 11; índice de cursor confirmado no `EXPLAIN` |
| RLS | ✓ | `tests/rls.test.ts` + gatilho de imutabilidade da pendência |
| Storage | 🔒 | Bucket S3-compatível |
| Jobs | ✕ | Recorrência e notificações agendadas não implementadas |
| Auditoria | ✓ | `audit_logs` + tela 3d |
| Backup | 🔒 | Depende da infraestrutura; procedimento em `22-RUNBOOKS.md` |
| Restore testado | 🔒 | idem |

## Financeiro

Todos ✓, provados por teste automatizado. O E2E de `tests/e2e.test.ts` percorre
os 15 fluxos de docs/13 §5 encadeados, conferindo o saldo em centavos a cada
passo contra um valor calculado à mão.

| Item | Onde | Item | Onde |
| --- | --- | --- | --- |
| Baixa total | `settlement.test.ts` | Pagamento parcial | `card.test.ts`, E2E |
| Baixa parcial | `settlement.test.ts`, E2E | Pagamento total | `card.test.ts`, E2E |
| Concorrência | `settlement.test.ts` (duas baixas simultâneas) | Reembolso | `card.test.ts` |
| Idempotência | `transaction.test.ts`, E2E, smoke | Estorno | `transaction.test.ts` |
| Transferência | `transaction.test.ts` | Competência | `report.test.ts` |
| Compra no cartão | `card.test.ts` | Caixa | `report.test.ts` |
| Parcelamento | `card.test.ts`, E2E | Rateio | `transaction.test.ts` |
| Fatura | `card.test.ts`, E2E | Reconciliação | `account.test.ts` |

## Segurança

| Item | Estado | Observação |
| --- | --- | --- |
| Autorização no servidor | ✓ | Papel resolvido da sessão, nunca do cliente |
| RLS por papel | ✓ | `rls.test.ts` |
| Isolamento entre famílias | ✓ | `rls.test.ts` + smoke test |
| Storage privado | 🔒 | Falta o provedor |
| Sessões revogáveis | ✓ | 8c + rotação de refresh com detecção de reuso |
| Scan de segredos | ✓ | CI |
| Teste de acesso direto | ✓ | `rls.test.ts` e o gatilho de pendência (recusa até por SQL do dono da app) |
| Política de privacidade | 🔒 | Minuta em `docs/legal/`; exige revisão jurídica |
| Dados de menores revisados | ✓ | §5 da política; nenhum dado adicional coletado por ser menor, sem perfilamento |

## Testes

| Item | Estado | Número |
| --- | --- | --- |
| Lint | ✓ | limpo |
| Typecheck | ✓ | limpo, strict |
| Unitários | ✓ | 80 (domínio 68, validação 7, contratos 5) |
| Integração | ✓ | 172 |
| RLS | ✓ | incluído nos 172 |
| E2E | ✓ | 15 fluxos, encadeados |
| Acessibilidade | ⏳ | Varrimento estático feito; falta leitor de tela em aparelho real |
| Performance | ⏳ | Índices e planos revisados; falta medir as metas de docs/11 §5 em aparelho |
| Dispositivos reais | 🔒 | Só emulador aqui |
| Rede instável | ✓ | Modo avião, ida e volta |
| Offline | ✓ | idem |
| Migração | ✓ | CI aplica e reaplica |
| Roll-forward testado | ✓ | 0014 e 0016 aplicadas sobre base com dados |

Cobertura da API: linhas 92,2% · funções 92,8% · instruções 88,2% · ramos 72,6%,
com piso no CI logo abaixo desses valores.

## Operações

| Item | Estado |
| --- | --- |
| Development | ✓ |
| Staging | 🔒 (infraestrutura) |
| Production | 🔒 (infraestrutura) |
| CI | ✓ |
| CD | 🔒 |
| Monitoramento | 🔒 (DSN do Sentry) |
| Alertas | 🔒 |
| Runbooks | ✓ `docs/22-RUNBOOKS.md` |
| Suporte | ✓ procedimentos escritos; 🔒 canal |
| Analytics com privacidade | ✓ por ausência — não há analytics, e é decisão, não lacuna |

## Lojas

Ficha completa em `docs/23-STORE.md`. Nome, descrição, palavras-chave,
classificação, declarações de coleta e justificativas de permissão: ✓ escritos.
Ícone, screenshots, contas de loja, TestFlight, Play testing e aprovação: 🔒.

Smoke test pós-release: ✓ implementado (`npm run smoke --workspace @ff/api`),
9/9 passos verdes contra o ambiente local.

---

## O que falta para "pronto", em ordem de quem resolve

**Resolvível por código (nesta máquina):**

1. Tema escuro nas 12 telas restantes.
2. Atalhos do ícone (docs/12, telas 6c).
3. Jobs de recorrência e de notificação agendada.

**Bloqueios de responsabilidade humana** — nenhum destes sai por código:

1. **macOS com Xcode** para o build e o gate visual do iOS.
2. **Contas de loja** e certificados de assinatura.
3. **Revisão jurídica** da política de privacidade e dos termos.
4. **Provedor de e-mail transacional** (hoje o link vai para o log).
5. **Bucket S3-compatível** para anexos.
6. **DSN do Sentry** e infraestrutura de homologação e produção.
7. **FCM/APNs** para push.
8. **Aparelhos reais** para teste de dispositivo e leitor de tela.
