/**
 * Tela 1c — Lançamento rápido (screenshots/1c-lancamento-rapido.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. BottomSheet sobre scrim, com handle
 *   2. Segmented "↓ Despesa | ↑ Receita | Mais ▾" e a linha que explica o Mais
 *   3. "VALOR" + o valor em 44, centralizado, com cursor brand
 *   4. SelectorChips: Conta · Categoria · Membro · Data
 *   5. Sugestões recentes em pills de contorno + "Descrição…"
 *   6. Teclado numérico próprio (3 colunas, teclas 52, última linha , · 0 · ⌫)
 *   7. "Salvar" (flex 1.6) + "Salvar e lançar outra"
 *   8. Link "Mais detalhes ▾"
 *
 * Meta da especificação: despesa simples em ≤ 10 s. Por isso o teclado é da
 * própria tela — nada de esperar o teclado do sistema — e os seletores já vêm
 * preenchidos com o mais recente.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Transaction } from '@ff/api-contracts';
import { familyToday, formatMoney, isoDate, minor } from '@ff/domain';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { DateField, dateFieldLabel } from '../../components/DateField';
import { Field } from '../../components/Field';
import { OptionSheet } from '../../components/OptionSheet';
import { SelectorChip } from '../../components/Chip';
import { SegmentedControl } from '../../components/Chip';
import { Banner } from '../../components/Banner';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { font } from '../../design-system/tokens';
import { icons, iconSize } from '../../design-system/icons';
import { ApiRequestError } from '../../services/api-client';
import { newIdempotencyKey } from '../../services/idempotency';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import { useReferenceStore } from '../household/reference-store';
import * as api from '../transactions/transaction-api';

/** Destinos do "Mais ▾", na ordem e com a copy da especificação. */
const MAIS = [
  { value: 'ContaPagar', label: 'Conta a pagar' },
  { value: 'ContaReceber', label: 'Conta a receber' },
  { value: 'CompraCartao', label: 'Compra no cartão' },
  { value: 'Transferencia', label: 'Transferência' },
  { value: 'PagamentoFatura', label: 'Pagamento de fatura' },
] as const;

export type QuickEntryDestination = (typeof MAIS)[number]['value'];

type Modo = 'EXPENSE' | 'INCOME' | 'MAIS';
type Seletor = 'conta' | 'categoria' | 'membro' | null;

/** Teclas do teclado próprio: 3 colunas, última linha , · 0 · ⌫. */
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const;

export type QuickEntryScreenProps = {
  readonly onClose: () => void;
  readonly onNavigate: (destination: QuickEntryDestination) => void;
};

export function QuickEntryScreen({
  onClose,
  onNavigate,
}: QuickEntryScreenProps): React.JSX.Element {
  const { colors, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();
  const { accounts, categories, members } = useReferenceStore();

  const today =
    household === null
      ? isoDate(new Date().toISOString().slice(0, 10))
      : familyToday(household.timezone);

  const [modo, setModo] = useState<Modo>('EXPENSE');
  const [amountMinor, setAmountMinor] = useState(0);
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState<string>(today);
  const [seletor, setSeletor] = useState<Seletor>(null);
  const [descricaoAberta, setDescricaoAberta] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [notes, setNotes] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [recentes, setRecentes] = useState<Transaction[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const nature = modo === 'INCOME' ? 'INCOME' : 'EXPENSE';

  /** Pré-preenche com o mais recente, como pede a especificação. */
  useEffect(() => {
    if (accountId === null) setAccountId(accounts[0]?.id ?? null);
    if (memberId === null) setMemberId(members[0]?.id ?? null);
  }, [accountId, accounts, memberId, members]);

  useEffect(() => {
    // A categoria acompanha a natureza escolhida.
    const compativel = categories.filter((item) => item.nature === nature);
    if (!compativel.some((item) => item.id === categoryId)) {
      setCategoryId(compativel[0]?.id ?? null);
    }
  }, [categories, categoryId, nature]);

  useEffect(() => {
    if (!accessToken || !household) return;
    void api
      .listTransactions(accessToken, household.id, { pageSize: 20 })
      .then((page) => setRecentes([...page.items]))
      .catch(() => setRecentes([]));
  }, [accessToken, household]);

  /** Pills de sugestão: descrições recentes, sem repetir. */
  const sugestoes = useMemo(() => {
    const vistas = new Set<string>();
    const lista: Array<{ description: string; amountMinor: number }> = [];
    for (const item of recentes) {
      if (item.transactionType !== nature) continue;
      if (vistas.has(item.description)) continue;
      vistas.add(item.description);
      lista.push({ description: item.description, amountMinor: item.amountMinor });
      if (lista.length === 3) break;
    }
    return lista;
  }, [nature, recentes]);

  const digitar = useCallback((tecla: string) => {
    setAmountMinor((atual) => {
      if (tecla === '⌫') return Math.floor(atual / 10);
      if (tecla === ',') return atual;
      const proximo = atual * 10 + Number.parseInt(tecla, 10);
      // Teto de segurança: nenhum lançamento passa de R$ 99.999.999,99.
      return proximo > 9_999_999_999 ? atual : proximo;
    });
  }, []);

  const salvar = useCallback(
    async (continuar: boolean) => {
      if (!accessToken || !household || accountId === null || memberId === null) return;
      setErro(null);
      setSalvando(true);
      try {
        const payload = {
          description: description.trim() === '' ? 'Lançamento rápido' : description.trim(),
          amountMinor,
          accountId,
          memberId,
          ...(categoryId === null ? {} : { categoryId }),
          ...(counterparty.trim() === '' ? {} : { counterpartyName: counterparty.trim() }),
          ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
          occurredAt,
          competenceDate: occurredAt,
          source: 'BOTTOM_ACTION' as const,
          idempotencyKey: newIdempotencyKey('rapido'),
        };
        if (nature === 'INCOME') {
          await api.createIncome(accessToken, household.id, payload);
        } else {
          await api.createExpense(accessToken, household.id, payload);
        }

        if (!continuar) {
          onClose();
          return;
        }
        // "Salvar e lançar outra": o valor e a descrição zeram, o resto fica.
        setSalvo(`${formatMoney(minor(amountMinor))} salvo.`);
        setAmountMinor(0);
        setDescription('');
      } catch (cause) {
        setErro(
          cause instanceof ApiRequestError ? cause.message : 'Não foi possível salvar agora.',
        );
      } finally {
        setSalvando(false);
      }
    },
    [
      accessToken,
      accountId,
      amountMinor,
      categoryId,
      counterparty,
      description,
      household,
      memberId,
      nature,
      notes,
      occurredAt,
      onClose,
    ],
  );

  const conta = accounts.find((item) => item.id === accountId);
  const categoria = categories.find((item) => item.id === categoryId);
  const membro = members.find((item) => item.id === memberId);
  const podeSalvar = amountMinor > 0 && accountId !== null && memberId !== null && !salvando;

  const Apagar = icons.apagar;

  /* Os CTAs ficam no rodapé fixo da folha: no screenshot eles são a última
     coisa visível, e aqui a folha rola. */
  const rodape = (
    <>
      <View style={styles.acoes}>
        <View style={styles.acaoPrimaria}>
          <Button
            testID="salvar-lancamento"
            label="Salvar"
            loading={salvando}
            disabled={!podeSalvar}
            onPress={() => void salvar(false)}
          />
        </View>
        <View style={styles.acaoSecundaria}>
          <Button
            testID="salvar-e-outra"
            label="Salvar e lançar outra"
            variant="secondary"
            disabled={!podeSalvar}
            onPress={() => void salvar(true)}
          />
        </View>
      </View>

      <Pressable
        testID="mais-detalhes"
        accessibilityRole="button"
        accessibilityLabel="Mais detalhes"
        onPress={() => setDetalhes((atual) => !atual)}
        style={{ marginTop: spacing.md }}
      >
        <Text variant="rowTitle" tone="brand" style={styles.centered}>
          {detalhes ? 'Menos detalhes ▴' : 'Mais detalhes ▾'}
        </Text>
      </Pressable>
    </>
  );

  return (
    <BottomSheet
      visible
      embedded
      onClose={onClose}
      footer={rodape}
      testID="folha-lancamento-rapido"
    >
      <SegmentedControl
        testID="segmento-lancamento"
        options={[
          { value: 'EXPENSE', label: '↓ Despesa' },
          { value: 'INCOME', label: '↑ Receita' },
          { value: 'MAIS', label: 'Mais ▾' },
        ]}
        value={modo}
        onChange={(value) => {
          if (value === 'MAIS') {
            setMaisAberto(true);
            return;
          }
          setModo(value);
        }}
      />

      <Text variant="rowMeta" tone="secondary" style={[styles.centered, { marginTop: spacing.sm }]}>
        Mais: conta a pagar · conta a receber · compra no cartão · transferência · pagamento de
        fatura
      </Text>

      {/* 3. Valor — no screenshot é texto centralizado, sem o card do MoneyInput. */}
      <View style={[styles.valor, { marginTop: spacing.lg }]}>
        <Text variant="label" tone="secondary">
          VALOR
        </Text>
        <View style={styles.valorLinha}>
          <Text
            testID="valor-lancamento"
            accessibilityLabel={`Valor: ${formatMoney(minor(amountMinor))}`}
            style={[styles.valorTexto, { color: colors.textPrimary }]}
          >
            {formatMoney(minor(amountMinor))}
          </Text>
          <View style={[styles.cursor, { backgroundColor: colors.brand }]} />
        </View>
      </View>

      {/* 4. Seletores */}
      <View style={[styles.chips, { marginTop: spacing.md }]}>
        <SelectorChip
          testID="chip-conta"
          label={
            conta === undefined
              ? 'Conta'
              : [conta.name, conta.primaryMemberName]
                  .filter((part): part is string => Boolean(part))
                  .join(' · ')
          }
          empty={conta === undefined}
          onPress={() => setSeletor('conta')}
        />
        <SelectorChip
          testID="chip-categoria"
          label={categoria?.name ?? 'Categoria'}
          empty={categoria === undefined}
          onPress={() => setSeletor('categoria')}
        />
        <SelectorChip
          testID="chip-membro"
          label={membro?.displayName ?? 'Membro'}
          empty={membro === undefined}
          onPress={() => setSeletor('membro')}
        />
        <DateField
          testID="chip-data"
          variant="chip"
          label="Data"
          value={occurredAt}
          onChange={setOccurredAt}
          today={today}
        />
      </View>

      {/* 5. Sugestões recentes + a pill que abre a descrição */}
      <View style={[styles.chips, { marginTop: spacing.md }]}>
        {sugestoes.map((item) => (
          <Pressable
            key={item.description}
            testID={`sugestao-${item.description}`}
            accessibilityRole="button"
            accessibilityLabel={`Usar ${item.description}`}
            onPress={() => {
              setDescription(item.description);
              if (amountMinor === 0) setAmountMinor(item.amountMinor);
            }}
            style={[styles.sugestao, { borderColor: colors.border, borderRadius: radius.pill }]}
          >
            <Text variant="rowMeta">
              {`${item.description}${amountMinor === 0 ? ` ${formatMoney(minor(item.amountMinor))}` : ''}`}
            </Text>
          </Pressable>
        ))}
        <Pressable
          testID="abrir-descricao"
          accessibilityRole="button"
          accessibilityLabel="Escrever descrição"
          onPress={() => setDescricaoAberta(true)}
          style={[styles.sugestao, { borderColor: colors.border, borderRadius: radius.pill }]}
        >
          <Text variant="rowMeta" tone="secondary">
            {description === '' ? 'Descrição…' : description}
          </Text>
        </Pressable>
      </View>

      {descricaoAberta ? (
        <View style={{ marginTop: spacing.sm }}>
          <Field
            label="Descrição"
            testID="campo-descricao"
            value={description}
            onChangeText={setDescription}
            autoFocus
          />
        </View>
      ) : null}

      {/* 6. Teclado próprio */}
      <View style={[styles.teclado, { marginTop: spacing.md }]}>
        {TECLAS.map((tecla) => (
          <Pressable
            key={tecla}
            testID={`tecla-${tecla}`}
            accessibilityRole="button"
            accessibilityLabel={tecla === '⌫' ? 'Apagar' : tecla}
            onPress={() => digitar(tecla)}
            style={({ pressed }) => [
              styles.tecla,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                borderRadius: radius.md,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {tecla === '⌫' ? (
              <Apagar size={iconSize.action} color={colors.textPrimary} />
            ) : (
              <Text style={[styles.teclaTexto, { color: colors.textPrimary }]}>{tecla}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {erro === null ? null : (
        <View style={{ marginTop: spacing.md }}>
          <Banner kind="error" message={erro} testID="erro-lancamento" />
        </View>
      )}
      {salvo === null ? null : (
        <View style={{ marginTop: spacing.md }}>
          <Banner kind="brand" message={salvo} testID="salvo-lancamento" />
        </View>
      )}

      {detalhes ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Field
            label="Favorecido"
            testID="campo-favorecido"
            value={counterparty}
            onChangeText={setCounterparty}
          />
          <Field
            label="Observação"
            testID="campo-observacao"
            value={notes}
            onChangeText={setNotes}
          />
          <Text variant="rowMeta" tone="secondary">
            Recorrência, parcelas, rateio e anexo ficam nas telas próprias, pelo botão Mais.
          </Text>
        </View>
      ) : null}

      <View style={{ height: spacing.lg }} />

      <OptionSheet
        visible={seletor === 'conta'}
        title="Conta"
        options={accounts.map((item) => ({
          value: item.id,
          label: item.name,
          meta: item.primaryMemberName ?? undefined,
        }))}
        value={accountId}
        onSelect={setAccountId}
        onClose={() => setSeletor(null)}
      />
      <OptionSheet
        visible={seletor === 'categoria'}
        title="Categoria"
        options={categories
          .filter((item) => item.nature === nature)
          .map((item) => ({ value: item.id, label: item.name }))}
        value={categoryId}
        onSelect={setCategoryId}
        onClose={() => setSeletor(null)}
      />
      <OptionSheet
        visible={seletor === 'membro'}
        title="Membro"
        options={members.map((item) => ({ value: item.id, label: item.displayName }))}
        value={memberId}
        onSelect={setMemberId}
        onClose={() => setSeletor(null)}
      />
      <OptionSheet
        visible={maisAberto}
        title="Mais"
        options={MAIS.map((item) => ({ value: item.value, label: item.label }))}
        value={null}
        onSelect={(value) => onNavigate(value as QuickEntryDestination)}
        onClose={() => setMaisAberto(false)}
      />
    </BottomSheet>
  );
}

/** Só para o teste: a data escolhida aparece como "Hoje, 07/08". */
export { dateFieldLabel };

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  valor: { alignItems: 'center' },
  valorLinha: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  // COMPONENT-SPECS §MoneyInput: "44 no lançamento rápido". O lineHeight é
  // obrigatório (CLARIFICATIONS-01 item 1) e aqui também evita o corte do
  // glifo no Android; 55 mantém a proporção do token moneyLg (32/40).
  valorTexto: {
    fontFamily: font.extrabold,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    lineHeight: 55,
  },
  // "cursor fino brand" da especificação.
  cursor: { height: 40, width: 2 },
  chips: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sugestao: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  // COMPONENT-SPECS §Teclado numérico: grid 3 colunas, gap 7, teclas 52.
  teclado: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tecla: {
    alignItems: 'center',
    borderWidth: 1,
    flexBasis: '31%',
    flexGrow: 1,
    height: 52,
    justifyContent: 'center',
  },
  teclaTexto: { fontFamily: font.bold, fontSize: 20 },
  acoes: { flexDirection: 'row', gap: 8 },
  acaoPrimaria: { flex: 1.6 },
  acaoSecundaria: { flex: 1 },
});
