/**
 * Avatar de membro: círculo colorido com a inicial (screenshots 3a, 3b, 6b).
 *
 * A cor sai de uma paleta fixa de tokens, escolhida deterministicamente pelo
 * id do membro — o mesmo membro tem sempre a mesma cor, em qualquer tela e em
 * qualquer aparelho, sem precisar guardar isso no banco.
 */

import React from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useTheme } from '../design-system/theme';
import { font } from '../design-system/tokens';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, { box: number; glyph: number }> = {
  sm: { box: 30, glyph: 13 },
  md: { box: 38, glyph: 15 },
  lg: { box: 52, glyph: 20 },
};

export type AvatarProps = {
  readonly name: string;
  /** Semente da cor: use o id do membro para manter a cor estável. */
  readonly seed?: string | undefined;
  readonly size?: AvatarSize | undefined;
  /** Sobrepõe a cor (usado no avatar "?" de convite pendente). */
  readonly muted?: boolean | undefined;
};

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed === '' ? '?' : (trimmed[0] ?? '?').toUpperCase();
}

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 100_000;
  }
  return total;
}

export function Avatar({ name, seed, size = 'md', muted = false }: AvatarProps): React.JSX.Element {
  const { colors, radius } = useTheme();
  const { box, glyph } = SIZES[size];

  // Paleta de avatares: só cores dos tokens.
  const palette = [colors.brand, colors.cardWine, colors.pending, colors.warning, colors.info];
  const background = muted
    ? colors.chipNeutral
    : (palette[hash(seed ?? name) % palette.length] ?? colors.brand);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { backgroundColor: background, borderRadius: radius.pill, height: box, width: box },
      ]}
    >
      <RNText
        style={{
          color: muted ? colors.textSecondary : colors.surfaceElevated,
          fontFamily: font.extrabold,
          fontSize: glyph,
        }}
      >
        {muted ? '?' : initial(name)}
      </RNText>
    </View>
  );
}

/** Avatares sobrepostos da família (screenshot 6b). */
export function AvatarStack({
  names,
  max = 3,
}: {
  readonly names: readonly string[];
  readonly max?: number;
}): React.JSX.Element {
  const shown = names.slice(0, max);
  return (
    <View style={styles.stack}>
      {shown.map((name, index) => (
        <View key={`${name}-${index}`} style={index === 0 ? null : styles.stacked}>
          <Avatar name={name} seed={name} size="lg" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignSelf: 'center',
    flexDirection: 'row',
  },
  stacked: {
    marginLeft: -14,
  },
});
