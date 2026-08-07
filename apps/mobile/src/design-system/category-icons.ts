/**
 * Mapa oficial de ícone por categoria — design/COMPONENT-SPECS.md
 * §Ícones por categoria, publicado em design/CLARIFICATIONS-01.md item 3.
 *
 * A regra do design: em Próximos compromissos (1b) e nas listas de planejamento
 * o ícone é o da CATEGORIA; em movimentações e extratos (1g, 2c) é o da
 * NATUREZA. Este arquivo cobre o primeiro caso.
 *
 * A chave é o nome da categoria porque é isso que o servidor manda em
 * `categoryName` e o que o usuário vê. Categoria fora da tabela cai em
 * "Outros" — nunca fica sem ícone.
 */

import {
  Briefcase,
  Car,
  Droplets,
  Gamepad2,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  PlusCircle,
  Shirt,
  ShoppingBasket,
  Tag,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { Palette } from './theme';
import { withAlpha } from './spec-values';

export type CategoryVisual = {
  readonly Icon: LucideIcon;
  readonly color: string;
  readonly background: string;
};

type Entry = { readonly Icon: LucideIcon; readonly resolve: (colors: Palette) => [string, string] };

const outros: Entry = {
  Icon: Tag,
  resolve: (c) => [c.textSecondary, c.chipNeutral],
};

const casa: Entry = { Icon: House, resolve: (c) => [c.brand, c.brandSoft] };
const energia: Entry = { Icon: Zap, resolve: (c) => [c.warning, c.warningSoft] };
const rede: Entry = { Icon: Wifi, resolve: (c) => [c.warning, c.warningSoft] };
const agua: Entry = { Icon: Droplets, resolve: (c) => [c.warning, c.warningSoft] };
const mercado: Entry = { Icon: ShoppingBasket, resolve: (c) => [c.income, c.incomeSoft] };
const salario: Entry = { Icon: Briefcase, resolve: (c) => [c.income, c.incomeSoft] };
const reembolso: Entry = { Icon: HandCoins, resolve: (c) => [c.income, c.incomeSoft] };

/** Chaves sem acento e em minúsculas, para aguentar variação de grafia. */
const MAP: Readonly<Record<string, Entry>> = {
  moradia: casa,
  aluguel: casa,
  condominio: casa,
  financiamento: casa,

  energia: energia,
  'energia eletrica': energia,
  internet: rede,
  telefone: rede,
  'internet/telefone': rede,
  agua: agua,
  gas: agua,
  'agua/gas': agua,

  mercado: mercado,
  alimentacao: mercado,
  transporte: { Icon: Car, resolve: (c) => [c.warning, c.warningSoft] },
  saude: { Icon: HeartPulse, resolve: (c) => [c.info, c.infoSoft] },
  educacao: { Icon: GraduationCap, resolve: (c) => [c.pending, c.pendingSoft] },
  // O spec pede fundo rgba(122,58,94,0.12), que é o token cardWine a 12%.
  lazer: { Icon: Gamepad2, resolve: (c) => [c.cardWine, withAlpha(c.cardWine, 0.12)] },
  'vestuario e casa': { Icon: Shirt, resolve: (c) => [c.textTertiary, c.chipNeutral] },
  vestuario: { Icon: Shirt, resolve: (c) => [c.textTertiary, c.chipNeutral] },

  salario: salario,
  reembolso: reembolso,
  'outras receitas': { Icon: PlusCircle, resolve: (c) => [c.income, c.incomeSoft] },

  outros: outros,
};

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Conjunto curado que a família pode escolher na 8d.
 *
 * Guardamos o NOME do ícone e o NOME do token de cor, nunca o hex — é o que
 * faz o tema escuro continuar funcionando sozinho (CLARIFICATIONS-02 item 3).
 */
export const CURATED_ICONS = {
  house: House,
  zap: Zap,
  wifi: Wifi,
  droplets: Droplets,
  'shopping-basket': ShoppingBasket,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'gamepad-2': Gamepad2,
  shirt: Shirt,
  briefcase: Briefcase,
  'hand-coins': HandCoins,
  'plus-circle': PlusCircle,
  tag: Tag,
} as const satisfies Record<string, LucideIcon>;

export type CuratedIconKey = keyof typeof CURATED_ICONS;

/** Swatches da 8d: nomes de token, resolvidos no tema ativo. */
export const CURATED_COLORS = [
  'pending',
  'brand',
  'expense',
  'warning',
  'info',
  'cardWine',
] as const;

export type CuratedColorKey = (typeof CURATED_COLORS)[number];

/**
 * Ícone e cores da categoria.
 *
 * Ordem de resolução (CLARIFICATIONS-02 item 3): escolha da família primeiro,
 * depois o mapa por nome, depois "Outros" — nunca fica sem ícone.
 */
export function categoryVisual(
  categoryName: string | null | undefined,
  colors: Palette,
  choice?: { readonly icon?: string | null; readonly color?: string | null } | undefined,
): CategoryVisual {
  const chosenIcon =
    choice?.icon != null && choice.icon in CURATED_ICONS
      ? CURATED_ICONS[choice.icon as CuratedIconKey]
      : null;
  const chosenColor =
    choice?.color != null && (CURATED_COLORS as readonly string[]).includes(choice.color)
      ? colors[choice.color as CuratedColorKey]
      : null;

  const entry = (categoryName ? MAP[normalize(categoryName)] : undefined) ?? outros;
  const [color, background] = entry.resolve(colors);

  if (chosenIcon === null && chosenColor === null) {
    return { Icon: entry.Icon, color, background };
  }
  const finalColor = chosenColor ?? color;
  return {
    Icon: chosenIcon ?? entry.Icon,
    color: finalColor,
    // Fundo derivado da própria cor a 12%, como o Lazer do COMPONENT-SPECS.
    background: chosenColor === null ? background : withAlpha(finalColor, 0.12),
  };
}
