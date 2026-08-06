/**
 * Mapa 1:1 dos glifos placeholder do design para um único set de ícones de
 * linha (design/UI-FIDELITY-RULES.md §Ícones).
 *
 * Nenhuma tela importa de `lucide-react-native` diretamente: quem quiser um
 * ícone escolhe uma chave daqui, e o mapeamento fica auditável em um lugar só.
 */

import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Delete,
  Ellipsis,
  Eye,
  EyeOff,
  House,
  Plus,
  RotateCcw,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

export const icons = {
  // Navegação (⌂ ▦ ⇄ ⋯)
  inicio: House,
  planejamento: Calendar,
  movimentacoes: ArrowLeftRight,
  mais: Ellipsis,
  adicionar: Plus,

  // Movimentações (↑ ↓ ⇄ ↺)
  receita: ArrowUp,
  despesa: ArrowDown,
  transferencia: ArrowLeftRight,
  estorno: RotateCcw,
  cartao: CreditCard,

  // Apoio (⌫ ⚡ 🔔)
  apagar: Delete,
  energia: Zap,
  notificacao: Bell,
  anterior: ChevronLeft,
  proximo: ChevronRight,
  mostrar: Eye,
  ocultar: EyeOff,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

/** Tamanhos usados no design (17–20). */
export const iconSize = { nav: 17, row: 18, action: 20 } as const;
