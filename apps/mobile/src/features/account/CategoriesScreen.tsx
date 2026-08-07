/**
 * Tela 8d — Gestão de categorias (screenshots/8d-categorias.png).
 *
 * Blocos, na ordem do screenshot:
 *   1. Header "Categorias" + botão primário "+ Nova"
 *   2. Segmented "Despesa | Receita"
 *   3. Lista: ícone da categoria, nome, "do sistema · N subcategorias" ou
 *      "criada pela família · N subcategorias", subcategorias numa linha só,
 *      arquivada com line-through e "Reativar"
 *   4. Card "Editar «nome»" com a grade de ícones e os swatches de cor
 *   5. Dois banners: o que explica as categorias do sistema e o que lembra que
 *      categoria nunca é excluída
 *
 * Categoria do sistema é imutável: sem "Editar", ícone e cor vêm do mapa por
 * nome (design/CLARIFICATIONS-02 item 3).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Category, CategoryNature } from '@ff/api-contracts';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, IconBadge, ListRow } from '../../components/Card';
import { BottomSheet } from '../../components/BottomSheet';
import { SegmentedControl } from '../../components/Chip';
import { Field } from '../../components/Field';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, RecoverableError, SkeletonList } from '../../components/states';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../design-system/theme';
import { iconSize } from '../../design-system/icons';
import {
  categoryVisual,
  CURATED_COLORS,
  CURATED_ICONS,
  type CuratedIconKey,
} from '../../design-system/category-icons';
import { ApiRequestError } from '../../services/api-client';
import { useSessionStore } from '../auth/session-store';
import { useActiveHousehold } from '../household/household-store';
import * as api from './account-api';

/** O screenshot mostra seis ícones e um "+24" que abre o resto. */
const VISIBLE_ICONS = 6;

export function CategoriesScreen({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const { colors, layout, radius, spacing } = useTheme();
  const accessToken = useSessionStore((state) => state.accessToken);
  const household = useActiveHousehold();

  const [nature, setNature] = useState<CategoryNature>('EXPENSE');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [allIcons, setAllIcons] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
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
      });
      setNewName('');
      setCreating(false);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Não foi possível criar agora.');
    }
  }, [accessToken, household, load, nature, newName]);

  const patch = useCallback(
    async (category: Category, input: { icon?: string; color?: string; archived?: boolean }) => {
      if (!accessToken || !household) return;
      const updated = await api.updateCategory(accessToken, household.id, category.id, input);
      setEditing((current) => (current?.id === category.id ? updated : current));
      await load();
    },
    [accessToken, household, load],
  );

  const iconKeys = Object.keys(CURATED_ICONS) as CuratedIconKey[];
  const shownIcons = allIcons ? iconKeys : iconKeys.slice(0, VISIBLE_ICONS);

  return (
    <View style={[styles.flex, { backgroundColor: colors.surface }]}>
      <ScreenHeader
        title="Categorias"
        onBack={onBack}
        size="screen"
        right={
          canManage ? (
            <Button
              testID="nova-categoria"
              label="+ Nova"
              size="sm"
              style={styles.headerAction}
              onPress={() => setCreating(true)}
            />
          ) : undefined
        }
      />

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
            { value: 'EXPENSE', label: 'Despesa' },
            { value: 'INCOME', label: 'Receita' },
          ]}
          value={nature}
          onChange={setNature}
        />

        <View style={{ marginTop: spacing.md }}>
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
              {tree.map(({ root, children }, index) => {
                const visual = categoryVisual(root.name, colors, {
                  icon: root.icon,
                  color: root.color,
                });
                const archived = root.archivedAt !== null;
                return (
                  <View key={root.id}>
                    <ListRow
                      first={index === 0}
                      testID={`categoria-${root.id}`}
                      title={root.name}
                      titleStyle={
                        archived ? { ...styles.archived, color: colors.textSecondary } : undefined
                      }
                      left={
                        <IconBadge background={visual.background}>
                          <visual.Icon size={iconSize.row} color={visual.color} />
                        </IconBadge>
                      }
                      meta={
                        archived
                          ? '◌ Arquivada · histórico preservado'
                          : [
                              root.isSystem ? 'do sistema' : 'criada pela família',
                              children.length === 0
                                ? null
                                : `${children.length} ${children.length === 1 ? 'subcategoria' : 'subcategorias'}`,
                            ]
                              .filter((part): part is string => Boolean(part))
                              .join(' · ')
                      }
                      // Do sistema: só chevron. Da família: "Editar".
                      showChevron={!archived && root.isSystem}
                      right={
                        !canManage || (!archived && root.isSystem) ? undefined : (
                          <Button
                            testID={`${archived ? 'reativar' : 'editar'}-${root.id}`}
                            label={archived ? 'Reativar' : 'Editar'}
                            variant="secondary"
                            size="sm"
                            style={styles.rowAction}
                            onPress={() => {
                              if (archived) void patch(root, { archived: false });
                              else setEditing(root);
                            }}
                          />
                        )
                      }
                    />
                    {children.length === 0 ? null : (
                      /* Todas as subcategorias numa linha só, como no design. */
                      <View style={styles.children}>
                        <Text variant="rowMeta" tone="secondary">
                          {`↳  ${children.map((child) => child.name).join(' · ')}`}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {editing === null ? null : (
          <View style={{ marginTop: spacing.md }}>
            <Card testID="card-editar">
              <View style={styles.editHeader}>
                <Text variant="rowTitle">{`Editar “${editing.name}”`}</Text>
                <Text variant="rowMeta" tone="secondary">
                  categoria da família
                </Text>
              </View>

              <Text variant="label" tone="secondary" style={{ marginTop: spacing.md }}>
                Ícone
              </Text>
              <View style={styles.grid}>
                {shownIcons.map((key) => {
                  const Icone = CURATED_ICONS[key];
                  const selected = editing.icon === key;
                  return (
                    <Pressable
                      key={key}
                      testID={`icone-${key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Ícone ${key}`}
                      accessibilityState={{ selected }}
                      onPress={() => void patch(editing, { icon: key })}
                      style={[
                        styles.gridCell,
                        {
                          backgroundColor: selected ? colors.brandSoft : colors.surface,
                          borderColor: selected ? colors.brand : colors.border,
                          borderRadius: radius.md,
                        },
                      ]}
                    >
                      <Icone
                        size={iconSize.row}
                        color={selected ? colors.brand : colors.textTertiary}
                      />
                    </Pressable>
                  );
                })}
                {allIcons || iconKeys.length <= VISIBLE_ICONS ? null : (
                  <Pressable
                    testID="mais-icones"
                    accessibilityRole="button"
                    accessibilityLabel="Ver todos os ícones"
                    onPress={() => setAllIcons(true)}
                    style={[
                      styles.gridCell,
                      styles.gridMore,
                      { borderColor: colors.border, borderRadius: radius.md },
                    ]}
                  >
                    <Text variant="rowMeta" tone="secondary">
                      {`+${iconKeys.length - VISIBLE_ICONS}`}
                    </Text>
                  </Pressable>
                )}
              </View>

              <Text variant="label" tone="secondary" style={{ marginTop: spacing.md }}>
                Cor
              </Text>
              <View style={styles.grid}>
                {CURATED_COLORS.map((key) => {
                  const selected = editing.color === key;
                  return (
                    <Pressable
                      key={key}
                      testID={`cor-${key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Cor ${key}`}
                      accessibilityState={{ selected }}
                      onPress={() => void patch(editing, { color: key })}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: colors[key],
                          borderColor: selected ? colors.textPrimary : 'transparent',
                          borderRadius: radius.pill,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </Card>
          </View>
        )}

        <View style={{ marginTop: spacing.md }}>
          <Banner
            kind="info"
            testID="banner-sistema"
            message="Categorias do sistema não podem ser renomeadas nem arquivadas, e o ícone delas é fixo. Nas categorias criadas pela família, o ícone e a cor são escolhidos aqui; sem escolha, valem o ícone e a cor do nome."
          />
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Banner
            kind="warning"
            testID="banner-arquivar"
            message="Categoria nunca é excluída — arquivar impede novos lançamentos e mantém o histórico e os relatórios intactos. Máximo de 2 níveis."
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="Nova categoria"
        testID="folha-nova-categoria"
        footer={
          <Button
            testID="criar-categoria"
            label="Criar categoria"
            disabled={newName.trim() === ''}
            onPress={handleCreate}
          />
        }
      >
        <Field
          label="Nome"
          testID="campo-nova-categoria"
          value={newName}
          onChangeText={setNewName}
          autoCapitalize="sentences"
          placeholder={nature === 'EXPENSE' ? 'Pet' : 'Freelance'}
        />
        <View style={{ height: spacing.md }} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 4 },
  headerAction: { width: 92 },
  rowAction: { width: 88 },
  archived: { textDecorationLine: 'line-through' },
  children: { paddingBottom: 10, paddingLeft: 44 },
  editHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  gridCell: {
    alignItems: 'center',
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  gridMore: { borderStyle: 'dashed' },
  swatch: { borderWidth: 2, height: 32, width: 32 },
});
