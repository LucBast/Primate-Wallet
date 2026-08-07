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
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account, AccountType, Member, VisibilityScope } from '@ff/api-contracts';
import { parseMoney } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { MoneyInput } from '../../components/MoneyInput';
import { OptionSheet } from '../../components/OptionSheet';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SelectField } from '../../components/SelectField';
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

/**
 * Swatches de cor da conta (screenshot 2b). Guardamos o NOME do token, nunca o
 * hex — é o que faz o tema escuro continuar funcionando sozinho
 * (design/CLARIFICATIONS-02 item 3).
 */
const SWATCHES = ['cardNavy', 'cardWine', 'brand', 'warning'] as const;
type SwatchKey = (typeof SWATCHES)[number];

export function AccountFormScreen({
  onBack,
  onSaved,
}: {
  readonly onBack: () => void;
  readonly onSaved: (account: Account) => void;
}): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
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
  const [defaultPaymentAccountId, setDefaultPaymentAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [color, setColor] = useState<SwatchKey>('cardNavy');
  const [sheet, setSheet] = useState<'titular' | 'visibilidade' | 'contaFatura' | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCard = accountType === 'CREDIT_CARD';

  useEffect(() => {
    if (!accessToken || !household) return;
    void listMembers(accessToken, household.id)
      .then(setMembers)
      .catch(() => setMembers([]));
    // Contas que podem pagar a fatura: qualquer uma que não seja cartão.
    void api
      .listAccounts(accessToken, household.id)
      .then((list) => setAccounts(list.filter((item) => item.accountType !== 'CREDIT_CARD')))
      .catch(() => setAccounts([]));
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
        color,
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
              ...(defaultPaymentAccountId === null
                ? {}
                : { defaultPaymentAccountId: defaultPaymentAccountId }),
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
    color,
    creditLimitText,
    defaultPaymentAccountId,
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
      {/* O título é "Nova conta" mesmo com o tipo Cartão: o formulário é UM só
          (invariante nº 2), e é o CTA que muda de nome. */}
      <ScreenHeader title="Nova conta" onBack={onBack} size="screen" />

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
          {/* Instituição e titular dividem a linha, como no screenshot. */}
          <View style={styles.dayRow}>
            <View style={styles.wideField}>
              <Field
                label="Instituição"
                testID="campo-instituicao"
                value={institution}
                onChangeText={setInstitution}
                autoCapitalize="words"
                placeholder="Banco Azul"
              />
            </View>
            <View style={styles.dayField}>
              <SelectField
                testID="campo-titular"
                label="Titular"
                value={
                  members.find((member) => member.id === primaryMemberId)?.displayName ?? 'Escolher'
                }
                placeholder={primaryMemberId === null}
                onPress={() => setSheet('titular')}
              />
            </View>
          </View>
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
              kind="brand"
              testID="banner-cartao"
              message="Campos do cartão — aparecem só quando o tipo é Cartão de crédito"
            />

            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <View style={styles.dayRow}>
                <View style={styles.dayField}>
                  <Field
                    label="Bandeira"
                    testID="campo-bandeira"
                    value={cardBrand}
                    onChangeText={setCardBrand}
                    autoCapitalize="words"
                    placeholder="Visa"
                  />
                </View>
                <View style={styles.wideField}>
                  <Field
                    label="Final (4 dígitos)"
                    testID="campo-final"
                    value={cardLastFour}
                    onChangeText={(text) => setCardLastFour(text.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    placeholder="4412"
                  />
                </View>
              </View>
              <View style={styles.dayRow}>
                <View style={styles.wideField}>
                  <Field
                    label="Limite"
                    testID="campo-limite"
                    value={creditLimitText}
                    onChangeText={setCreditLimitText}
                    keyboardType="decimal-pad"
                    placeholder="5.000,00"
                  />
                </View>
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
              <SelectField
                testID="campo-conta-fatura"
                label="Conta padrão para pagar a fatura"
                value={
                  accounts.find((item) => item.id === defaultPaymentAccountId)?.name ?? 'Escolher'
                }
                placeholder={defaultPaymentAccountId === null}
                onPress={() => setSheet('contaFatura')}
              />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          {/* Um select com a lista das opções embaixo, como no screenshot. */}
          <SelectField
            testID="campo-visibilidade"
            label="Quem pode ver e usar"
            value={VISIBILITIES.find((item) => item.value === visibility)?.label ?? 'Família'}
            onPress={() => setSheet('visibilidade')}
          />
          <Text variant="rowMeta" tone="secondary" style={styles.helper}>
            {VISIBILITIES.map((item) => item.label).join(' · ')}
          </Text>

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
        </View>

        {/* Cor e moeda dividem a linha final (screenshot 2b). */}
        <View style={[styles.dayRow, { marginTop: spacing.md }]}>
          <View style={styles.wideField}>
            <View
              style={[
                styles.swatchCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                },
              ]}
            >
              <Text variant="label" tone="secondary">
                Cor
              </Text>
              <View style={styles.swatches}>
                {SWATCHES.map((key) => (
                  <Pressable
                    key={key}
                    testID={`cor-${key}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Cor ${key}`}
                    accessibilityState={{ selected: color === key }}
                    onPress={() => setColor(key)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: colors[key],
                        borderColor: color === key ? colors.textPrimary : 'transparent',
                        borderRadius: radius.pill,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
          <View style={styles.dayField}>
            <SelectField
              testID="campo-moeda"
              label="Moeda"
              value={`${household?.currencyCode ?? 'BRL'} — Real`}
              onPress={() => undefined}
            />
          </View>
        </View>

        {/* A microcopy de segurança fecha a tela, antes do CTA. */}
        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="warning"
            testID="banner-seguranca"
            message="Nunca pedimos número completo, CVV ou senha do cartão."
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-conta" />
          </View>
        )}
      </ScrollView>

      <OptionSheet
        visible={sheet === 'titular'}
        title="Titular"
        options={members
          .filter((member) => member.status === 'ACTIVE')
          .map((member) => ({ value: member.id, label: member.displayName }))}
        value={primaryMemberId}
        onSelect={setPrimaryMemberId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'visibilidade'}
        title="Quem pode ver e usar"
        options={VISIBILITIES.map((item) => ({ value: item.value, label: item.label }))}
        value={visibility}
        onSelect={(value) => setVisibility(value as VisibilityScope)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'contaFatura'}
        title="Conta padrão para pagar a fatura"
        options={accounts.map((item) => ({ value: item.id, label: item.name }))}
        value={defaultPaymentAccountId}
        onSelect={setDefaultPaymentAccountId}
        onClose={() => setSheet(null)}
      />

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
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
  wideField: { flex: 1.6 },
  helper: { marginLeft: 14, marginTop: 4 },
  // Mesma caixa do Field (COMPONENT-SPECS §Field: raio 14, borda 1, 9×14).
  swatchCard: { borderWidth: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  swatches: { flexDirection: 'row', gap: 10 },
  swatch: { borderWidth: 2, height: 24, width: 24 },
  footer: { paddingTop: 12 },
});
