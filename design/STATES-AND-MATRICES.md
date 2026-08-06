# STATES-AND-MATRICES — estados, permissões e ciclos de vida

## 1. Matriz de estados de tela (aplicar a TODAS as telas)
Referência visual: screenshots/5a-estados.png
- **Loading inicial**: skeleton no layout final. Atualização: pull-to-refresh + barra fina.
- **Vazio**: ícone em container brandSoft + título Bold 13 + subtítulo + CTA primário ("+ Nova conta a pagar").
- **Erro recuperável**: banner dangerSoft com o que houve + "Seus dados estão seguros." + "Tentar novamente".
- **Erro definitivo**: mensagem específica + caminho de volta, sem retry.
- **Sem conexão**: banner infoSoft ◌ "Sem conexão — mostrando dados salvos" (+ contagem aguardando sync).
- **Sem permissão**: banner pendingSoft explicando quem pode dar acesso. Valores restritos NUNCA chegam ao cliente (RLS) — não borrar, simplesmente não renderizar.
- **Conflito de sincronização**: card com borda warning, explica a mudança concorrente com valores, ações "Revisar e continuar" / "Descartar". Servidor vence; nunca mesclar valores.
- **Duplicidade bloqueada**: banner infoSoft "Este lançamento já foi salvo… Nada foi duplicado".
- **Sucesso**: toast com desfazer (5 s) para lançamentos simples; operações postadas corrigem-se por estorno com motivo.
- **Sync por item**: ◌ salvo no aparelho → ◌ aguardando sincronização → ✓ sincronizado → ● falhou · requer atenção.

## 2. Matriz de permissões (papéis × ações) — o servidor é a autoridade; a UI desabilita com explicação
| Ação | Proprietário | Admin | Adulto | Membro | Filho superv. |
|---|---|---|---|---|---|
| Excluir família / transferir propriedade | ✓ | ✕ | ✕ | ✕ | ✕ |
| Convidar/remover membros, permissões | ✓ | ✓¹ | ✕ | ✕ | ✕ |
| Criar/editar contas, cartões, categorias | ✓ | ✓ | ✓² | ✕ | ✕ |
| Lançar despesa/receita em conta autorizada | ✓ | ✓ | ✓ | ✓² | ✓³ |
| Baixa, transferência, pgto fatura, estorno | ✓ | ✓ | ✓² | ✕ | ✕ |
| Ajuste de saldo (com motivo) | ✓ | ✓ | ✕ | ✕ | ✕ |
| Aprovar/recusar lançamentos de filhos | ✓ | ✓ | ✓² | ✕ | ✕ |
| Ver relatórios / exportar | ✓ | ✓ | ✓⁴ | ✓⁴ | ✓⁵ |
| Ver auditoria da família | ✓ | ✓ | ✕ | ✕ | ✕ |

¹ não remove Proprietário nem exclui família · ² só nas contas com permissão concedida (ver/lançar/editar) · ³ sujeito à regra de aprovação; pendente não afeta saldo · ⁴ só contas visíveis; exportação auditada · ⁵ só dados próprios, sem exportação ampla.

## 3. Ciclos de vida
**Conta prevista**: OPEN → (baixa parcial) PARTIAL → (baixa restante) SETTLED; qualquer momento → CANCELED. "Vencido" derivado: due_date < hoje AND outstanding > 0 AND status != CANCELED. Estorno de baixa reabre (SETTLED → PARTIAL/OPEN). outstanding = original + juros + multa − desconto − baixas válidas. UI sempre com progresso numérico.
**Fatura**: Aberta → Fechada → Parcial → Paga; sem pagamento até vencer → Vencida. Botão por estado: "Ver compras" → "Pagar fatura" → "Completar pagamento" → "Ver pagamentos". Pagamento nunca cria despesa; estorno reabre.
**Movimentação**: [Pendente aprovação →] Postada → Estornada (motivo + autor + original preservado; estorno duplicado bloqueado). Recusada encerra pendência. Offline: nasce ◌ aguardando sincronização.

## 4. Mapeamento tela → comando → regras (resumo para implementação)
- Lançamento rápido (1c) → CreateExpenseCommand/CreateIncomeCommand, source BOTTOM_ACTION; foco no valor; "salvar e lançar outra" mantém conta/membro; offline OK (outbox).
- Baixa parcial (1e) → SettlePlannedEntryCommand + expectedVersion; principal ≤ outstanding (OUTSTANDING_AMOUNT_EXCEEDED); juros/multa/desconto separados; VERSION_CONFLICT → diálogo de conflito; exige conexão.
- Fatura (1f) → PayCardStatementCommand / reverseStatementPayment; STATEMENT_ALREADY_PAID tratado; limite recalculado no servidor.
- Compra parcelada (2e) → CreateCardPurchaseCommand; preview das parcelas do domínio (centavos na última); soma exata visível.
- Ajuste de saldo (2d) → serviço próprio com motivo obrigatório; gera transaction; auditado; só Proprietário/Admin.
- Aprovação (3c) → approval_requests approve/reject; payload original imutável; push imediato.
- Relatórios (4a–4d) → calculateMonthlySummary mode ACCRUAL|CASH; estornos fora dos totais; membro soma por allocations; exportação = evento de auditoria.
