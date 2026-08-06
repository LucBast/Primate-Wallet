/**
 * Categorias — lista e edição (SCREEN-SPECS §"Telas sem screenshot":
 * "categorias (lista/edição com ícone+cor+ordem+arquivar)").
 *
 * Segue os mesmos componentes das demais telas; nenhum padrão visual novo.
 * Categoria em uso é ARQUIVADA, nunca excluída (docs/04 §17).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Category, CategoryNature } from '@ff/api-contracts';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, ListRow, SectionLabel } from '../../components/Card';
import { SegmentedControl } from '../../components/Chip';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';

export function CategoriesScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [nature, setNature] = useState<CategoryNature>('EXPENSE');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [newName, setNewName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage =
    household?.myRole === 'OWNER' || household?.myRole === 'ADMIN' || household?.myRole === 'ADULT';

  const load = useCallback(async () => {
    if (!accessToken || !household) return;
    setError(null);
    try {
      setCategories(await api.listCategories(accessToken, household.id));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Não foi possível carregar as categorias.',
      );
    }
  }, [accessToken, household]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Categorias raiz da natureza escolhida, com suas subcategorias. */
  const tree = useMemo(() => {
    const list = (categories ?? []).filter((category) => category.nature === nature);
    const roots = list.filter((category) => category.parentId === null);
    return roots.map((root) => ({
      root,
      children: list.filter((category) => category.parentId === root.id),
    }));
  }, [categories, nature]);

  const handleCreate = useCallback(async () => {
    if (!accessToken || !household || newName.trim() === '') return;
    try {
      await api.createCategory(accessToken, household.id, {
        name: newName.trim(),
        nature,
        sortOrder: 100,
        ...(parentId === null ? {} : { parentId }),
      });
      setNewName('');
      setParentId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível criar agora.');
    }
  }, [accessToken, household, load, nature, newName, parentId]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader title="Categorias" onBack={onBack} size="screen" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.screenPaddingH, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <SegmentedControl
          testID="segmento-natureza"
          options={[
            { value: 'EXPENSE', label: 'Despesas' },
            { value: 'INCOME', label: 'Receitas' },
          ]}
          value={nature}
          onChange={setNature}
        />

        <View style={{ marginTop: spacing.lg }}>
          {error !== null ? (
            <RecoverableError
              message={error}
              onRetry={() => void load()}
              testID="erro-categorias"
            />
          ) : categories === null ? (
            <SkeletonList rows={5} />
          ) : tree.length === 0 ? (
            <EmptyState
              title="Nenhuma categoria"
              subtitle="Crie a primeira categoria para classificar os lançamentos."
            />
          ) : (
            <Card padded={false} testID="card-categorias">
              {tree.map(({ root, children }, index) => (
                <View key={root.id}>
                  <ListRow
                    first={index === 0}
                    testID={`categoria-${root.id}`}
                    title={root.name}
                    meta={
                      children.length === 0
                        ? root.isSystem
                          ? 'Categoria padrão'
                          : undefined
                        : `${children.length} ${children.length === 1 ? 'subcategoria' : 'subcategorias'}`
                    }
                    right={
                      canManage ? (
                        <Button
                          testID={`arquivar-${root.id}`}
                          label="Arquivar"
                          variant="secondary"
                          size="sm"
                          style={styles.archive}
                          onPress={async () => {
                            if (!accessToken || !household) return;
                            await api.updateCategory(accessToken, household.id, root.id, {
                              archived: true,
                            });
                            await load();
                          }}
                        />
                      ) : undefined
                    }
                  />
                  {children.map((child) => (
                    <View key={child.id} style={styles.child}>
                      <ListRow title={`↳ ${child.name}`} />
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          )}
        </View>

        {canManage ? (
          <View style={{ marginTop: spacing.xl }}>
            <SectionLabel>NOVA CATEGORIA</SectionLabel>
            <Field
              label="Nome"
              testID="campo-nova-categoria"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="sentences"
              placeholder={nature === 'EXPENSE' ? 'Pet' : 'Freelance'}
            />
            <View style={{ marginTop: spacing.md }}>
              <Button
                testID="criar-categoria"
                label="Criar categoria"
                disabled={newName.trim() === ''}
                onPress={handleCreate}
              />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Banner
                kind="info"
                testID="banner-categorias"
                message="Categorias em uso não são excluídas: arquivar impede novos usos e preserva o histórico e os relatórios antigos."
              />
            </View>
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl }}>
            <Text variant="rowMeta" tone="secondary">
              Só quem administra a família pode criar ou arquivar categorias.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  archive: { width: 92 },
  child: { paddingLeft: 20 },
});
