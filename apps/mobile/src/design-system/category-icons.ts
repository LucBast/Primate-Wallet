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

/** Ícone e cores da categoria; "Outros" quando não houver correspondência. */
export function categoryVisual(
  categoryName: string | null | undefined,
  colors: Palette,
): CategoryVisual {
  const entry = (categoryName ? MAP[normalize(categoryName)] : undefined) ?? outros;
  const [color, background] = entry.resolve(colors);
  return { Icon: entry.Icon, color, background };
}
