/**
 * Tela 2b — Nova conta (screenshots/2b-nova-conta.png).
 *
 * Formulário ÚNICO para conta e cartão — é a invariante nº 2 aparecendo na UI.
 * Blocos:
 *   1. Chips de tipo (Corrente · Poupança · Dinheiro · Carteira digital ·
 *      Investimento · Cartão de crédito)
 *   2. Fields comuns: Nome, Instituição, Titular, Saldo inicial
 *   3. Ao escolher cartão: banner brandSoft + Bandeira, Final (4 dígitos),
 *      Limite, Fecha dia, Vence dia, Conta padrão para pagar a fatura
 *   4. "Quem pode ver e usar" (Família · Só adultos · Membros escolhidos · Só eu)
 *   5. Banner warningSoft: "Nunca pedimos número completo, CVV ou senha do cartão."
 *   6. CTA "Salvar conta" / "Salvar cartão"
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account, AccountType, Member, VisibilityScope } from '@ff/api-contracts';
import { parseMoney } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { listMembers } from '../household/household-api';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';

const TYPES: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: 'CHECKING', label: 'Corrente' },
  { value: 'SAVINGS', label: 'Poupança' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'DIGITAL_WALLET', label: 'Carteira digital' },
  { value: 'INVESTMENT', label: 'Investimento' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const VISIBILITIES: ReadonlyArray<{ value: VisibilityScope; label: string }> = [
  { value: 'HOUSEHOLD', label: 'Família' },
  { value: 'ADULTS_ONLY', label: 'Só adultos' },
  { value: 'SELECTED_MEMBERS', label: 'Membros escolhidos' },
  { value: 'OWNER_ONLY', label: 'Só eu' },
];

export function AccountFormScreen({
  onBack,
  onSaved,
}: {
  readonly onBack: () => void;
  readonly onSaved: (account: Account) => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [accountType, setAccountType] = useState<AccountType>('CHECKING');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [openingBalanceMinor, setOpeningBalanceMinor] = useState(0);
  const [visibility, setVisibility] = useState<VisibilityScope>('HOUSEHOLD');
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [primaryMemberId, setPrimaryMemberId] = useState<string | null>(null);

  const [cardBrand, setCardBrand] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [creditLimitText, setCreditLimitText] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCard = accountType === 'CREDIT_CARD';

  useEffect(() => {
    if (!accessToken || !household) return;
    void listMembers(accessToken, household.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [accessToken, household]);

  const canSubmit = useMemo(() => {
    if (name.trim() === '' || saving) return false;
    if (isCard && (creditLimitText === '' || closingDay === '' || dueDay === '')) return false;
    if (visibility === 'SELECTED_MEMBERS' && selectedMembers.length === 0) return false;
    return true;
  }, [closingDay, creditLimitText, dueDay, isCard, name, saving, selectedMembers, visibility]);

  const handleSave = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    setSaving(true);
    try {
      const account = await api.createAccount(accessToken, household.id, {
        name: name.trim(),
        accountType,
        currencyCode: household.currencyCode,
        openingBalanceMinor: isCard ? 0 : openingBalanceMinor,
        visibilityScope: visibility,
        ...(institution.trim() === '' ? {} : { institutionName: institution.trim() }),
        ...(primaryMemberId === null ? {} : { primaryMemberId }),
        ...(visibility === 'SELECTED_MEMBERS' ? { selectedMemberIds: selectedMembers } : {}),
        ...(isCard
          ? {
              ...(cardBrand.trim() === '' ? {} : { cardBrand: cardBrand.trim() }),
              ...(cardLastFour === '' ? {} : { cardLastFour }),
              creditLimitMinor: parseMoney(creditLimitText),
              closingDay: Number.parseInt(closingDay, 10),
              dueDay: Number.parseInt(dueDay, 10),
            }
          : {}),
      });
      onSaved(account);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }, [
    accessToken,
    accountType,
    cardBrand,
    cardLastFour,
    closingDay,
    creditLimitText,
    dueDay,
    household,
    institution,
    isCard,
    name,
    onSaved,
    openingBalanceMinor,
    primaryMemberId,
    selectedMembers,
    visibility,
  ]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={isCard ? 'Novo cartão' : 'Nova conta'} onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SectionLabel>TIPO</SectionLabel>
        <View style={styles.chips}>
          {TYPES.map((option) => (
            <ChoiceChip
              key={option.value}
              testID={`tipo-${option.value}`}
              label={option.label}
              selected={accountType === option.value}
              onPress={() => setAccountType(option.value)}
            />
          ))}
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <Field
            label="Nome"
            testID="campo-nome"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder={isCard ? 'Cartão Azul' : 'Conta Corrente'}
          />
          <Field
            label="Instituição"
            testID="campo-instituicao"
            value={institution}
            onChangeText={setInstitution}
            autoCapitalize="words"
            placeholder="Banco Azul"
          />
        </View>

        {isCard ? null : (
          <View style={{ marginTop: spacing.md }}>
            <MoneyInput
              label="SALDO INICIAL"
              testID="campo-saldo-inicial"
              valueMinor={openingBalanceMinor}
              onChangeMinor={setOpeningBalanceMinor}
              size={30}
            />
          </View>
        )}

        {isCard ? (
          <View style={{ marginTop: spacing.xl }}>
            <Banner
              kind="info"
              testID="banner-cartao"
              message="Campos do cartão: usamos só o que aparece na fatura para organizar seus gastos."
            />

            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <Field
                label="Bandeira"
                testID="campo-bandeira"
                value={cardBrand}
                onChangeText={setCardBrand}
                autoCapitalize="words"
                placeholder="Visa"
              />
              <Field
                label="Final (4 dígitos)"
                testID="campo-final"
                value={cardLastFour}
                onChangeText={(text) => setCardLastFour(text.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                placeholder="4412"
              />
              <Field
                label="Limite"
                testID="campo-limite"
                value={creditLimitText}
                onChangeText={setCreditLimitText}
                keyboardType="decimal-pad"
                placeholder="5.000,00"
              />
              <View style={styles.dayRow}>
                <View style={styles.dayField}>
                  <Field
                    label="Fecha dia"
                    testID="campo-fecha"
                    value={closingDay}
                    onChangeText={(text) => setClosingDay(text.replace(/\D/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    placeholder="10"
                  />
                </View>
                <View style={styles.dayField}>
                  <Field
                    label="Vence dia"
                    testID="campo-vence"
                    value={dueDay}
                    onChangeText={(text) => setDueDay(text.replace(/\D/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    placeholder="15"
                  />
                </View>
              </View>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Banner
                kind="warning"
                testID="banner-seguranca"
                message="Nunca pedimos número completo, CVV ou senha do cartão."
              />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>QUEM PODE VER E USAR</SectionLabel>
          <View style={styles.chips}>
            {VISIBILITIES.map((option) => (
              <ChoiceChip
                key={option.value}
                testID={`visibilidade-${option.value}`}
                label={option.label}
                selected={visibility === option.value}
                onPress={() => setVisibility(option.value)}
              />
            ))}
          </View>

          {visibility === 'SELECTED_MEMBERS' ? (
            <View style={{ marginTop: spacing.md }}>
              <Card>
                <Text variant="rowMeta" tone="secondary">
                  Escolha quem pode ver e lançar nesta conta.
                </Text>
                <View style={[styles.chips, { marginTop: spacing.sm }]}>
                  {members
                    .filter((member) => member.status === 'ACTIVE')
                    .map((member) => (
                      <ChoiceChip
                        key={member.id}
                        testID={`membro-${member.id}`}
                        label={member.displayName}
                        selected={selectedMembers.includes(member.id)}
                        onPress={() =>
                          setSelectedMembers((current) =>
                            current.includes(member.id)
                              ? current.filter((id) => id !== member.id)
                              : [...current, member.id],
                          )
                        }
                      />
                    ))}
                </View>
              </Card>
            </View>
          ) : null}

          {members.length === 0 ? null : (
            <View style={{ marginTop: spacing.md }}>
              <SectionLabel>TITULAR</SectionLabel>
              <View style={styles.chips}>
                {members
                  .filter((member) => member.status === 'ACTIVE')
                  .map((member) => (
                    <ChoiceChip
                      key={member.id}
                      testID={`titular-${member.id}`}
                      label={member.displayName}
                      selected={primaryMemberId === member.id}
                      onPress={() =>
                        setPrimaryMemberId((current) => (current === member.id ? null : member.id))
                      }
                    />
                  ))}
              </View>
            </View>
          )}
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-conta" />
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
        <Button
          testID="salvar-conta"
          label={isCard ? 'Salvar cartão' : 'Salvar conta'}
          loading={saving}
          disabled={!canSubmit}
          onPress={handleSave}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayRow: { flexDirection: 'row', gap: 10 },
  dayField: { flex: 1 },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
