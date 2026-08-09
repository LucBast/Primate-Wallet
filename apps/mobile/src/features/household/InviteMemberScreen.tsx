/**
 * Tela 8b — Convite de membro (screenshots/8b-convite-membro.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Fields: E-mail · Nome de exibição
 *   2. "PAPEL NA FAMÍLIA": Administrador · Adulto · Membro · Filho
 *   3. Card de supervisão: toggle "Supervisionado" + "Exigir aprovação"
 *      (nunca · sempre · acima de um valor) + "Valor limite sem aprovação"
 *   4. Card "PRÉVIA DO CONVITE" — texto derivado dos campos, não persistido
 *   5. Banner warningSoft sobre o convite ser nominal
 *   6. Cancelar + Enviar convite
 *
 * Duas regras vêm do design/CLARIFICATIONS-02 item 1: o chip é **Filho**, e
 * "supervisionado" é o toggle — não são dois papéis; e "Valor limite" só existe
 * no modo *acima de um valor*, sumindo (não desabilitando) nos demais.
 */

import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InvitableRole } from '@ff/api-contracts';
import { formatMoney, minor, parseMoney } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Toggle } from '../../components/Toggle';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { type as typeTokens } from '../../design-system/tokens';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useActiveHousehold } from './household-store';

const ROLES: readonly InvitableRole[] = ['ADMIN', 'ADULT', 'MEMBER', 'CHILD'];

/**
 * Rótulo do CHIP, que é diferente do rótulo exibido do papel: aqui é "Filho",
 * e "Filho supervisionado" só aparece quando o toggle está ligado.
 */
const CHIP_LABEL: Record<InvitableRole, string> = {
  ADMIN: 'Administrador',
  ADULT: 'Adulto',
  MEMBER: 'Membro',
  CHILD: 'Filho',
};

type ApprovalMode = 'NEVER' | 'ALWAYS' | 'ABOVE_THRESHOLD';

const APPROVAL_OPTIONS: ReadonlyArray<{ value: ApprovalMode; label: string }> = [
  { value: 'NEVER', label: 'nunca' },
  { value: 'ALWAYS', label: 'sempre' },
  { value: 'ABOVE_THRESHOLD', label: 'acima de um valor' },
];

/**
 * R$ 50,00 é VALOR, não placeholder.
 *
 * O campo nascia vazio, com "R$ 50,00" só no placeholder. O resultado eram três
 * leituras diferentes do mesmo número na mesma tela: o campo dizia cinquenta
 * reais, a prévia dizia "gastos acima de R$ 0,00", e o convite saía com limite
 * ZERO — isto é, TODA despesa do filho passaria a exigir aprovação, enquanto a
 * tela prometia que só as acima de cinquenta.
 *
 * A 8b escreve `Valor limite sem aprovação · R$ 50,00` como linha de valor, e é
 * assim que ele passa a se comportar.
 */
const LIMITE_PADRAO_MINOR = 50_00;

export function InviteMemberScreen({
  onBack,
  onInvited,
}: {
  readonly onBack: () => void;
  readonly onInvited: () => void;
}): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<InvitableRole>('MEMBER');
  const [supervised, setSupervised] = useState(true);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('ABOVE_THRESHOLD');
  const [thresholdText, setThresholdText] = useState(formatMoney(minor(LIMITE_PADRAO_MINOR)));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supervisão só existe para filho; nos demais papéis o bloco some.
  const canSupervise = role === 'CHILD';
  const isSupervised = canSupervise && supervised;

  const handleInvite = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);

    let thresholdMinor: number | undefined;
    if (isSupervised && approvalMode === 'ABOVE_THRESHOLD') {
      try {
        thresholdMinor = parseMoney(thresholdText);
      } catch {
        setError('Informe um valor limite válido.');
        return;
      }
    }

    setSending(true);
    try {
      await api.inviteMember(accessToken, household.id, {
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        isSupervised,
        approvalMode: isSupervised ? approvalMode : 'NEVER',
        ...(thresholdMinor === undefined ? {} : { approvalThresholdMinor: thresholdMinor }),
      });
      onInvited();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Não foi possível convidar agora.',
      );
    } finally {
      setSending(false);
    }
  }, [
    accessToken,
    approvalMode,
    displayName,
    email,
    household,
    isSupervised,
    onInvited,
    role,
    thresholdText,
  ]);

  const canSubmit = email.trim() !== '' && displayName.trim() !== '' && !sending;

  /** Texto derivado dos campos — não é persistido, é o espelho da escolha. */
  const preview = (() => {
    const quem = displayName.trim() === '' ? 'A pessoa' : displayName.trim();
    const papel = isSupervised ? 'Membro supervisionado' : CHIP_LABEL[role];
    const casa = household?.name ?? 'família';
    const base = `${quem} entra como ${papel} na ${casa}. Poderá lançar nas contas que você autorizar em Permissões`;
    if (!isSupervised || approvalMode === 'NEVER') return `${base}.`;
    if (approvalMode === 'ALWAYS') return `${base}; todo lançamento fica ● Aguardando aprovação.`;
    // A prévia lê o MESMO valor que vai no convite. Campo apagado significa
    // zero de verdade — e a frase diz isso, em vez de mostrar um número que a
    // pessoa não escolheu.
    const limite = formatMoney(minor(parseMoney(thresholdText)));
    return `${base}; gastos acima de ${limite} ficam ● Aguardando aprovação.`;
  })();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Convidar membro" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* O e-mail vem primeiro: é ele que identifica o convite. */}
        <View style={{ gap: spacing.md }}>
          <Field
            label="E-mail"
            testID="campo-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="caio@email.com"
          />
          <Field
            label="Nome de exibição"
            testID="campo-nome"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            placeholder="Caio"
          />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <SectionLabel>PAPEL NA FAMÍLIA</SectionLabel>
          <View style={styles.chips}>
            {ROLES.map((option) => (
              <ChoiceChip
                key={option}
                testID={`papel-${option}`}
                label={CHIP_LABEL[option]}
                selected={role === option}
                onPress={() => setRole(option)}
              />
            ))}
          </View>
        </View>

        {canSupervise ? (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-supervisao">
              <View style={styles.row}>
                <View style={styles.rowTexts}>
                  <Text variant="rowTitle">Supervisionado</Text>
                  <Text variant="rowMeta" tone="secondary">
                    os lançamentos passam pela regra de aprovação
                  </Text>
                </View>
                <Toggle
                  testID="toggle-supervisionado"
                  value={supervised}
                  onValueChange={setSupervised}
                  accessibilityLabel="Supervisionado"
                />
              </View>

              {supervised ? (
                <>
                  <Text variant="rowTitle" style={{ marginTop: spacing.md }}>
                    Exigir aprovação
                  </Text>
                  <View style={[styles.chips, { marginTop: spacing.sm }]}>
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

                  {/* Some nos modos nunca/sempre — não fica desabilitado. */}
                  {approvalMode === 'ABOVE_THRESHOLD' ? (
                    <View style={[styles.row, { marginTop: spacing.md }]}>
                      <Text variant="rowTitle">Valor limite sem aprovação</Text>
                      <TextInput
                        testID="campo-limite"
                        accessibilityLabel="Valor limite sem aprovação"
                        value={thresholdText}
                        onChangeText={setThresholdText}
                        keyboardType="decimal-pad"
                        placeholder="R$ 50,00"
                        placeholderTextColor={colors.textSecondary}
                        style={[typeTokens.moneyRow as TextStyle, { color: colors.textPrimary }]}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </Card>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <Card testID="card-previa">
            <Text variant="label" tone="secondary">
              Prévia do convite
            </Text>
            <Text variant="rowMeta" tone="secondary" style={{ marginTop: spacing.sm }}>
              {preview}
            </Text>
          </Card>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="warning"
            testID="banner-convite"
            message={`O convite é nominal: vale só para ${email.trim() === '' ? 'o e-mail informado' : email.trim()}, uma única vez, e expira em 7 dias. Enquanto não for aceito aparece como ● Aguardando aceite e pode ser revogado.`}
          />
        </View>

        {error === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Banner kind="error" message={error} testID="erro-convite" />
          </View>
        )}
      </ScrollView>

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
        <View style={styles.footerButton}>
          <Button testID="cancelar-convite" label="Cancelar" variant="secondary" onPress={onBack} />
        </View>
        <View style={styles.footerButtonWide}>
          <Button
            testID="enviar-convite"
            label="Enviar convite"
            loading={sending}
            disabled={!canSubmit}
            onPress={handleInvite}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  rowTexts: { flex: 1, gap: 2 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  footerButton: { flex: 1 },
  footerButtonWide: { flex: 1.6 },
});
