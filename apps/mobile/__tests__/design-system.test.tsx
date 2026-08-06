/**
 * Gate de fidelidade visual automatizado.
 *
 * A comparação lado a lado com os screenshots é manual (UI-FIDELITY-RULES §3),
 * mas o que dá para verificar por código, verificamos: que os tokens são cópia
 * fiel do design, que a tipografia usa Manrope, e que os componentes aplicam os
 * valores exatos da especificação.
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design-system/theme';
import { dark, font, layout, light, radius, type as typeTokens } from '../src/design-system/tokens';
import { StatusChip } from '../src/components/StatusChip';
import { BottomNav } from '../src/components/BottomNav';

const repoRoot = path.resolve(__dirname, '../../..');

async function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="light">{node}</ThemeProvider>);
}

describe('tokens', () => {
  it('src/design-system/tokens.ts é cópia verbatim de design/design-tokens.ts', async () => {
    const source = fs.readFileSync(path.join(repoRoot, 'design/design-tokens.ts'));
    const copy = fs.readFileSync(path.join(repoRoot, 'apps/mobile/src/design-system/tokens.ts'));
    expect(copy.equals(source)).toBe(true);
  });

  it('toda tipografia usa Manrope, nunca a fonte do sistema', async () => {
    const families = Object.values(typeTokens).map((style) => style.fontFamily);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(family).toMatch(/^Manrope-/);
    }
    expect(Object.values(font)).toEqual(
      expect.arrayContaining([
        'Manrope-Regular',
        'Manrope-Medium',
        'Manrope-SemiBold',
        'Manrope-Bold',
        'Manrope-ExtraBold',
      ]),
    );
  });

  it('valores monetários usam tabular-nums', async () => {
    for (const key of ['moneyLg', 'moneyMd', 'moneyRow'] as const) {
      expect(typeTokens[key].fontVariant).toEqual(['tabular-nums']);
    }
  });

  it('as fontes Manrope estão no bundle nas duas plataformas', async () => {
    const androidFonts = fs.readdirSync(
      path.join(repoRoot, 'apps/mobile/android/app/src/main/assets/fonts'),
    );
    const plist = fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/ios/FamilyFinance/Info.plist'),
      'utf8',
    );
    for (const weight of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
      expect(androidFonts).toContain(`Manrope-${weight}.ttf`);
      expect(plist).toContain(`Manrope-${weight}.ttf`);
    }
  });

  it('o tema escuro cobre exatamente as mesmas chaves do claro', async () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
});

describe('StatusChip', () => {
  it('mostra cor + ponto + texto, nunca só cor (CLAUDE.md item 6)', async () => {
    const { getByText } = await renderWithTheme(<StatusChip status="vencido" detail="há 3 dias" />);
    expect(getByText('● Vencido · há 3 dias')).toBeTruthy();
  });

  it('usa ◌ para sincronização pendente, com a copy da especificação', async () => {
    const { getByText } = await renderWithTheme(<StatusChip status="aguardandoSincronizacao" />);
    expect(getByText('◌ Aguardando sincronização')).toBeTruthy();
  });

  it('estornado vem com line-through', async () => {
    const { getByText } = await renderWithTheme(<StatusChip status="estornado" />);
    const styles = getByText('● Estornado').props.style.flat();
    expect(styles).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
  });
});

describe('BottomNav', () => {
  it('tem 5 posições: 4 itens mais o botão central', async () => {
    const { getByTestId } = await renderWithTheme(
      <BottomNav active="inicio" onSelect={jest.fn()} onAdd={jest.fn()} />,
    );
    for (const key of ['inicio', 'planejamento', 'movimentacoes', 'mais']) {
      expect(getByTestId(`nav-${key}`)).toBeTruthy();
    }
    expect(getByTestId('nav-adicionar')).toBeTruthy();
  });

  it('o botão central é circular de 54 com deslocamento −26', async () => {
    const { getByTestId } = await renderWithTheme(
      <BottomNav active="inicio" onSelect={jest.fn()} onAdd={jest.fn()} />,
    );
    const styles = getByTestId('nav-adicionar').props.style.flat();
    const merged = Object.assign({}, ...styles);
    expect(merged.width).toBe(layout.navCenterButton);
    expect(merged.height).toBe(layout.navCenterButton);
    expect(merged.borderRadius).toBe(radius.pill);
    expect(merged.marginTop).toBe(-26);
    expect(merged.backgroundColor).toBe(light.brand);
    // Sombra na cor brand, como manda a especificação.
    expect(merged.shadowColor).toBe(light.brand);
  });

  it('a copy dos itens é a da especificação', async () => {
    const { getByText } = await renderWithTheme(
      <BottomNav active="inicio" onSelect={jest.fn()} onAdd={jest.fn()} />,
    );
    for (const label of ['Início', 'Planejamento', 'Movimentações', 'Mais']) {
      expect(getByText(label)).toBeTruthy();
    }
  });
});
