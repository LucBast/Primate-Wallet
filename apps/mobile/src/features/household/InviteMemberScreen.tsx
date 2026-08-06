/**
 * Convidar membro — destino do CTA "+ Convidar membro" da tela 3a.
 *
 * Sem screenshot dedicado no pacote: segue os mesmos componentes e espaçamentos
 * das telas de formulário (Field, ChoiceChip, Banner, Button), como manda
 * design/UI-FIDELITY-RULES.md.
 */

import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InvitableRole } from '@ff/api-contracts';
import { parseMoney } from '@ff/domain';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionLabel } from '../../components/Card';
import { ChoiceChip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import * as api from './household-api';
import { useActiveHousehold } from './household-store';
import { ROLE_ABILITIES, ROLE_LABEL } from './roles';

const ROLES: readonly InvitableRole[] = ['ADMIN', 'ADULT', 'MEMBER', 'CHILD'];

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
  const [role, setRole] = useState<InvitableRole>('ADULT');
  const [approvalMode, setApprovalMode] = useState<'NEVER' | 'ALWAYS' | 'ABOVE_THRESHOLD'>('NEVER');
  const [thresholdText, setThresholdText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);

    let thresholdMinor: number | undefined;
    if (role === 'CHILD' && approvalMode === 'ABOVE_THRESHOLD') {
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
        isSupervised: role === 'CHILD',
        approvalMode: role === 'CHILD' ? approvalMode : 'NEVER',
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
  }, [accessToken, approvalMode, displayName, email, household, onInvited, role, thresholdText]);

  const canSubmit = email.trim() !== '' && displayName.trim() !== '' && !sending;

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
        <View style={{ gap: spacing.md }}>
          <Field
            label="Nome"
            testID="campo-nome"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            placeholder="Bruno Souza"
          />
          <Field
            label="E-mail"
            testID="campo-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="bruno@email.com"
          />
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel>PAPEL NA FAMÍLIA</SectionLabel>
          <View style={styles.chips}>
            {ROLES.map((option) => (
              <ChoiceChip
                key={option}
                testID={`papel-${option}`}
                label={ROLE_LABEL[option]}
                selected={role === option}
                tone={option === 'CHILD' ? 'pending' : 'brand'}
                onPress={() => setRole(option)}
              />
            ))}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <Card>
              <Text variant="rowMeta" tone="secondary">
                {`Como ${ROLE_LABEL[role]} a pessoa pode:`}
              </Text>
              {ROLE_ABILITIES[role].map((ability) => (
                <Text
                  key={ability.text}
                  variant="rowMeta"
                  tone={ability.can ? 'primary' : 'secondary'}
                  style={styles.ability}
                >
                  {`${ability.can ? '✓' : '✕'} ${ability.text}`}
                </Text>
              ))}
            </Card>
          </View>
        </View>

        {role === 'CHILD' ? (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>APROVAÇÃO DE LANÇAMENTOS</SectionLabel>
            <View style={styles.chips}>
              {(
                [
                  { value: 'NEVER', label: 'Nunca' },
                  { value: 'ABOVE_THRESHOLD', label: 'Acima de um valor' },
                  { value: 'ALWAYS', label: 'Sempre' },
                ] as const
              ).map((option) => (
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
          </View>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-convite"
            message="O convite vale uma única vez e só para este e-mail. Ele expira em 7 dias e pode ser revogado a qualquer momento."
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
            borderTopColor: colors.border,
            paddingBottom: Math.max(spacing.lg, insets.bottom),
            paddingHorizontal: layout.screenPaddingH,
          },
        ]}
      >
        <Button
          testID="enviar-convite"
          label="Enviar convite"
          loading={sending}
          disabled={!canSubmit}
          onPress={handleInvite}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ability: { lineHeight: 17, marginTop: 2 },
  footer: { borderTopWidth: 1, paddingTop: 12 },
});
