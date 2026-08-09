/**
 * StatusChip (design/COMPONENT-SPECS.md §StatusChip).
 *
 * Pill raio 999, padding 4×11, texto Bold 11.5, com ● antes do texto.
 * Regra inegociável (CLAUDE.md item 6): status é SEMPRE cor + ponto + texto,
 * nunca só cor. Estornado usa line-through. Sincronização pendente usa ◌.
 *
 * Os textos pt-BR vêm da especificação e são finais — não parafrasear.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../design-system/Text';
import { useTheme } from '../design-system/theme';
import { fixedColors, withAlpha } from '../design-system/spec-values';

export type StatusKind =
  | 'aberto'
  | 'parcial'
  | 'pago'
  | 'recebido'
  | 'vencido'
  | 'aguardandoAprovacao'
  /** Mesma combinação, rótulo curto do chip da 3c: "● Pendente". */
  | 'pendente'
  | 'estornado'
  | 'aguardandoSincronizacao';

export type StatusChipProps = {
  readonly status: StatusKind;
  /** Complemento da especificação: "falta R$ 510,10", "há 3 dias". */
  readonly detail?: string | undefined;
  /**
   * Sobre o card escuro da fatura (1f): "chip de status translúcido"
   * (COMPONENT-SPECS §Cards de destaque) — branco a 16% com texto branco.
   */
  readonly onCard?: boolean | undefined;
};

const LABELS: Record<StatusKind, string> = {
  aberto: 'Aberto',
  parcial: 'Parcial',
  pago: 'Pago',
  recebido: 'Recebido',
  vencido: 'Vencido',
  aguardandoAprovacao: 'Aguardando aprovação',
  pendente: 'Pendente',
  estornado: 'Estornado',
  aguardandoSincronizacao: 'Aguardando sincronização',
};

export function StatusChip({ status, detail, onCard = false }: StatusChipProps): React.JSX.Element {
  const { colors, radius } = useTheme();

  const palette: Record<StatusKind, { background: string; foreground: string }> = {
    aberto: { background: colors.chipNeutral, foreground: colors.textTertiary },
    parcial: { background: colors.warningSoft, foreground: colors.warning },
    pago: { background: colors.incomeSoft, foreground: colors.income },
    recebido: { background: colors.incomeSoft, foreground: colors.income },
    vencido: { background: colors.dangerSoft, foreground: colors.danger },
    aguardandoAprovacao: { background: colors.pendingSoft, foreground: colors.pending },
    pendente: { background: colors.pendingSoft, foreground: colors.pending },
    estornado: { background: colors.chipNeutral, foreground: colors.textSecondary },
    aguardandoSincronizacao: { background: colors.infoSoft, foreground: colors.info },
  };

  const { background, foreground } = onCard
    ? // Sobre o card escuro da fatura o chip é branco nos dois temas.
      { background: withAlpha(fixedColors.onBrand, 0.16), foreground: fixedColors.onBrand }
    : palette[status];
  // ◌ para sincronização pendente; ● para todos os demais estados.
  const marker = status === 'aguardandoSincronizacao' ? '◌' : '●';
  const label = detail === undefined ? LABELS[status] : `${LABELS[status]} · ${detail}`;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={[styles.chip, { backgroundColor: background, borderRadius: radius.pill }]}
    >
      <Text
        variant="chip"
        style={[{ color: foreground }, status === 'estornado' ? styles.reversed : null]}
      >
        {`${marker} ${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  reversed: {
    textDecorationLine: 'line-through',
  },
});
