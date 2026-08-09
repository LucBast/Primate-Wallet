/**
 * Tela 3c — Aprovação pendente (screenshots/3c-aprovacao.png).
 *
 * BottomSheet do adulto, na ordem conferida contra o screenshot:
 *   1. Header: avatar do solicitante + "Caio pediu aprovação" +
 *      "hoje, 14:32 · via lançamento rápido" + chip "● Pendente" à direita
 *   2. Card branco: "DESPESA PROPOSTA", valor em expense 30 e as linhas
 *      Descrição / Conta / Categoria / Regra acionada / Saldo da conta hoje
 *   3. Banner infoSoft explicando que nada muda no saldo enquanto pendente
 *   4. Field "MENSAGEM PARA O CAIO · OPCIONAL"
 *   5. Rodapé: "Recusar" (destrutivo) + "Aprovar R$ 89,90" (primário, mais largo)
 *
 * A tela não decide nada por conta própria: valor, saldo e regra acionada vêm
 * prontos do servidor, porque é o servidor que sabe qual regra estava valendo
 * quando o pedido nasceu.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ApprovalRequest } from '@ff/api-contracts';
import { formatMoney, minor } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Banner } from '../../components/Banner';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Field } from '../../components/Field';
import { StatusChip } from '../../components/StatusChip';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { sheetMoney } from '../../design-system/spec-values';
import { requestedAtLabel, sourceLabel } from './approval-copy';

export type ApprovalSheetProps = {
  readonly request: ApprovalRequest | null;
  readonly onClose: () => void;
  readonly onApprove: (message: string | undefined) => Promise<void>;
  readonly onReject: (message: string | undefined) => Promise<void>;
  readonly error?: string | null | undefined;
};

/** Linha "rótulo à esquerda, valor à direita" do card da despesa proposta. */
function ProposalRow({
  label,
  value,
  tone = 'primary',
  first = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'primary' | 'pending';
  readonly first?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.row, first ? null : { borderTopColor: colors.divider, borderTopWidth: 1 }]}
    >
      <Text variant="rowTitle" tone="secondary">
        {label}
      </Text>
      <Text variant="rowTitle" tone={tone} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

/** "acima de R$ 50,00" / "toda despesa" — o porquê de o lançamento ter parado. */
function ruleLabel(request: ApprovalRequest): string {
  if (request.ruleMode === 'ALWAYS') return 'toda despesa';
  return request.ruleThresholdMinor === null
    ? 'toda despesa'
    : `acima de ${formatMoney(minor(request.ruleThresholdMinor))}`;
}

export function ApprovalSheet({
  request,
  onClose,
  onApprove,
  onReject,
  error,
}: ApprovalSheetProps): React.JSX.Element | null {
  const { colors, spacing } = useTheme();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  if (request === null) return null;

  const { transaction } = request;
  const amount = formatMoney(minor(transaction.amountMinor));
  const firstName = request.requestedByName.split(' ')[0] ?? request.requestedByName;
  const trimmed = message.trim();
  const decisionMessage = trimmed === '' ? undefined : trimmed;

  const decide = async (action: 'approve' | 'reject'): Promise<void> => {
    setBusy(action);
    try {
      await (action === 'approve' ? onApprove(decisionMessage) : onReject(decisionMessage));
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      visible
      // Sem `embedded`: a folha é aberta de dentro da lista, que já ocupa a
      // tela inteira. Só o `Modal` a sobrepõe; embutida ela disputaria altura
      // com a lista e ficaria espremida no rodapé.
      onClose={onClose}
      testID="folha-aprovacao"
      footer={
        <View style={styles.footer}>
          <Button
            testID="recusar-aprovacao"
            label="Recusar"
            variant="destructive"
            style={styles.reject}
            loading={busy === 'reject'}
            disabled={busy !== null}
            onPress={() => decide('reject')}
          />
          <Button
            testID="aprovar-aprovacao"
            label={`Aprovar ${amount}`}
            style={styles.approve}
            loading={busy === 'approve'}
            disabled={busy !== null}
            onPress={() => decide('approve')}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <Avatar name={request.requestedByName} seed={request.requestedByMemberId} />
        <View style={styles.headerText}>
          <Text variant="section">{`${firstName} pediu aprovação`}</Text>
          <Text variant="rowMeta" tone="secondary">
            {`${requestedAtLabel(request.createdAt)} · via ${sourceLabel(transaction.source)}`}
          </Text>
        </View>
        <StatusChip status="pendente" />
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text variant="label" tone="secondary">
          DESPESA PROPOSTA
        </Text>
        <Text
          accessibilityLabel={`Valor proposto ${amount}`}
          style={[sheetMoney, styles.amount, { color: colors.expense }]}
        >
          {amount}
        </Text>

        <ProposalRow first label="Descrição" value={transaction.description} />
        <ProposalRow label="Conta" value={transaction.accountName ?? '—'} />
        <ProposalRow label="Categoria" value={transaction.categoryName ?? '—'} />
        <ProposalRow label="Regra acionada" value={ruleLabel(request)} tone="pending" />
        <ProposalRow
          label="Saldo da conta hoje"
          value={formatMoney(minor(request.accountBalanceMinor))}
        />
      </Card>

      <View style={{ marginTop: spacing.md }}>
        <Banner
          kind="info"
          testID="banner-pendente"
          message={`Enquanto pendente, nada muda no saldo. Ao aprovar, a despesa é lançada como enviada; ao recusar, ${firstName} recebe o motivo.`}
        />
      </View>

      {error === null || error === undefined ? null : (
        <View style={{ marginTop: spacing.sm }}>
          <Banner kind="error" message={error} testID="erro-aprovacao" />
        </View>
      )}

      <View style={{ marginTop: spacing.md }}>
        <Field
          testID="mensagem-aprovacao"
          label={`MENSAGEM PARA O ${firstName.toUpperCase()} · OPCIONAL`}
          placeholder="Escreva um comentário…"
          value={message}
          onChangeText={setMessage}
          maxLength={200}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Card medido em 3c-aprovacao.png: 203dp de altura. Com o padding do Card
  // (14+14), o rótulo (15) e o valor (38+2), sobram 120 para as cinco linhas —
  // 24 cada: entrelinha 18 do rowTitle + 2,5 de padding em cima e embaixo + o
  // fio de 1 que separa uma linha da outra.
  amount: { marginBottom: 0, marginTop: 2 },
  // "Aprovar" ocupa mais largura que "Recusar" (flex 1.6 no spec da 8b, mesma
  // proporção do par destrutivo/primário aqui).
  approve: { flex: 1.6 },
  footer: { flexDirection: 'row', gap: 12 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  headerText: { flex: 1, gap: 1 },
  reject: { flex: 1 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 2.5,
  },
  rowValue: { flexShrink: 1, textAlign: 'right' },
});
