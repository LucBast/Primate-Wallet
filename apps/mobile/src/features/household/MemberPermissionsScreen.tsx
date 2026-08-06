/**
 * Tela 3b — Permissões do membro (screenshots/3b-permissoes.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Header ‹ + avatar + nome + selo do papel
 *   2. "PAPEL NA FAMÍLIA" + chips (Administrador · Adulto · Membro ·
 *      Filho supervisionado, este em pending quando selecionado)
 *   3. "CONTAS AUTORIZADAS" + linhas "✓ ver · ✓ lançar · ✕ editar" com Toggle,
 *      e um bloco de contas sem acesso com a microcopy
 *      "Sem acesso — o servidor nega mesmo por chamada direta"
 *   4. "APROVAÇÃO DE LANÇAMENTOS" + Exigir aprovação (seletor) + Valor limite
 *   5. Banner infoSoft sobre pendências
 *   6. Botões lado a lado: Suspender (destrutivo) + Salvar permissões
 *
 * A lista de contas chega por props: na Fase 1 ainda não existem contas, e a
 * seção simplesmente não é renderizada.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ApprovalMode, HouseholdRole, Member } from '@ff/api-contracts';
import { formatMoney, minor, parseMoney } from '@ff/domain';
import { Avatar } from '../../components/Avatar';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Toggle } from '../../components/Toggle';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ROLE_LABEL } from './roles';

/** Permissão de uma conta para este membro (preenchida a partir da Fase 2). */
export type AccountPermission = {
  readonly accountId: string;
  readonly accountName: string;
  readonly canView: boolean;
  readonly canTransact: boolean;
  readonly canEdit: boolean;
};

export type MemberPermissionsScreenProps = {
  readonly member: Member;
  readonly accounts?: readonly AccountPermission[];
  readonly onBack: () => void;
  readonly onSave: (input: {
    role: HouseholdRole;
    approvalMode: ApprovalMode;
    approvalThresholdMinor: number | null;
    accounts: readonly AccountPermission[];
  }) => Promise<void>;
  readonly onSuspend: () => Promise<void>;
};

const SELECTABLE_ROLES: ReadonlyArray<Exclude<HouseholdRole, 'OWNER'>> = [
  'ADMIN',
  'ADULT',
  'MEMBER',
  'CHILD',
];

const APPROVAL_OPTIONS: ReadonlyArray<{ value: ApprovalMode; label: string }> = [
  { value: 'NEVER', label: 'Nunca' },
  { value: 'ABOVE_THRESHOLD', label: 'Acima de um valor' },
  { value: 'ALWAYS', label: 'Sempre' },
];

export function MemberPermissionsScreen({
  member,
  accounts = [],
  onBack,
  onSave,
  onSuspend,
}: MemberPermissionsScreenProps): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [role, setRole] = useState<HouseholdRole>(member.role);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(member.approvalMode);
  const [thresholdText, setThresholdText] = useState(
    member.approvalThresholdMinor === null
      ? ''
      : formatMoney(minor(member.approvalThresholdMinor), { symbol: false }),
  );
  const [permissions, setPermissions] = useState<readonly AccountPermission[]>(accounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const granted = useMemo(() => permissions.filter((item) => item.canView), [permissions]);
  const denied = useMemo(() => permissions.filter((item) => !item.canView), [permissions]);

  const toggleAccount = useCallback((accountId: string, next: boolean) => {
    setPermissions((current) =>
      current.map((item) =>
        item.accountId === accountId
          ? { ...item, canView: next, canTransact: next, canEdit: false }
          : item,
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    let thresholdMinor: number | null = null;
    if (approvalMode === 'ABOVE_THRESHOLD') {
      try {
        thresholdMinor = parseMoney(thresholdText);
      } catch {
        setError('Informe um valor limite válido.');
        return;
      }
      if (thresholdMinor <= 0) {
        setError('Informe um valor limite válido.');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        role,
        approvalMode,
        approvalThresholdMinor: thresholdMinor,
        accounts: permissions,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }, [approvalMode, onSave, permissions, role, thresholdText]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title={member.displayName}
        subtitle={ROLE_LABEL[role]}
        onBack={onBack}
        size="screen"
        left={<Avatar name={member.displayName} seed={member.id} />}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>PAPEL NA FAMÍLIA</SectionLabel>
        <View style={styles.chips}>
          {SELECTABLE_ROLES.map((option) => (
            <ChoiceChip
              key={option}
              testID={`papel-${option}`}
              label={ROLE_LABEL[option]}
              selected={role === option}
              tone={option === 'CHILD' ? 'pending' : 'brand'}
              onPress={() => {
                setRole(option);
                // Supervisão só se aplica a filho; trocar de papel limpa a regra.
                if (option !== 'CHILD') setApprovalMode('NEVER');
              }}
            />
          ))}
        </View>

        {permissions.length === 0 ? null : (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>CONTAS AUTORIZADAS</SectionLabel>
            <Card padded={false}>
              {granted.map((account, index) => (
                <View
                  key={account.accountId}
                  style={[
                    styles.accountRow,
                    index > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                  ]}
                >
                  <View style={styles.accountTexts}>
                    <Text variant="rowTitle">{account.accountName}</Text>
                    <Text variant="rowMeta" tone="income">
                      {`✓ ver · ${account.canTransact ? '✓' : '✕'} lançar · ${account.canEdit ? '✓' : '✕'} editar`}
                    </Text>
                  </View>
                  <Toggle
                    testID={`conta-${account.accountId}`}
                    value
                    accessibilityLabel={`Acesso a ${account.accountName}`}
                    onValueChange={(next) => toggleAccount(account.accountId, next)}
                  />
                </View>
              ))}

              {denied.length === 0 ? null : (
                <View
                  style={[
                    styles.accountRow,
                    granted.length > 0 && { borderTopColor: colors.divider, borderTopWidth: 1 },
                  ]}
                >
                  <View style={styles.accountTexts}>
                    <Text variant="rowTitle" tone="secondary">
                      {denied.map((item) => item.accountName).join(' · ')}
                    </Text>
                    <Text variant="rowMeta" tone="secondary">
                      Sem acesso — o servidor nega mesmo por chamada direta
                    </Text>
                  </View>
                  <Toggle
                    testID="contas-sem-acesso"
                    value={false}
                    accessibilityLabel="Liberar contas sem acesso"
                    onValueChange={(next) => {
                      for (const item of denied) toggleAccount(item.accountId, next);
                    }}
                  />
                </View>
              )}
            </Card>
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>APROVAÇÃO DE LANÇAMENTOS</SectionLabel>
          <Card>
            <View style={styles.approvalRow}>
              <Text variant="rowTitle">Exigir aprovação</Text>
              <View style={styles.approvalChips}>
                {APPROVAL_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    testID={`aprovacao-${option.value}`}
                    label={option.label}
                    selected={approvalMode === option.value}
                    tone="pending"
                    onPress={() => setApprovalMode(option.value)}
                  />
                ))}
              </View>
            </View>

            {approvalMode === 'ABOVE_THRESHOLD' ? (
              <View style={{ marginTop: spacing.md }}>
                <Field
                  label="Valor limite sem aprovação"
                  testID="campo-limite"
                  value={thresholdText}
                  onChangeText={setThresholdText}
                  keyboardType="decimal-pad"
                  placeholder="50,00"
                />
              </View>
            ) : null}
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-aprovacao"
            message="Lançamentos acima do limite ficam ● Aguardando aprovação: não afetam saldo e o conteúdo original é preservado para o aprovador."
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-permissoes" />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(spacing.lg, insets.bottom),
            paddingHorizontal: layout.screenPaddingH,
          },
        ]}
      >
        <View style={styles.footerButton}>
          <Button
            testID="suspender"
            label="Suspender"
            variant="destructive"
            size="sm"
            onPress={onSuspend}
          />
        </View>
        <View style={styles.footerButtonWide}>
          <Button
            testID="salvar-permissoes"
            label="Salvar permissões"
            size="sm"
            loading={saving}
            onPress={handleSave}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  accountTexts: { flex: 1, gap: 2 },
  approvalRow: { gap: 10 },
  approvalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  footerButton: { flex: 1 },
  footerButtonWide: { flex: 1.6 },
});
