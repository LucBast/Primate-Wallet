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
  Check,
  Fingerprint,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Delete,
  Ellipsis,
  Eye,
  Pencil,
  Smartphone,
  EyeOff,
  House,
  Diff,
  Plus,
  RotateCcw,
  Search,
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
  // COMPONENT-SPECS §Ícones por categoria pede `plus-minus` para o ajuste de
  // saldo; este lucide não tem esse nome, e `diff` é o mesmo desenho (um mais
  // sobre um menos). Registrado em docs/21-DECISIONS.md.
  ajuste: Diff,

  // Apoio (⌕ ⌫ ⚡ 🔔 ✓)
  buscar: Search,
  confirmado: Check,
  // Lápis de "editar" no cabeçalho da 2c e da 3b.
  editar: Pencil,
  // Aparelho com sessão ativa (8c).
  aparelho: Smartphone,
  apagar: Delete,
  energia: Zap,
  notificacao: Bell,
  anterior: ChevronLeft,
  proximo: ChevronRight,
  mostrar: Eye,
  ocultar: EyeOff,
  // CLARIFICATIONS-02 item 2a: `fingerprint` cobre Face ID e digital — o card
  // da 6a é sobre o recurso, não sobre o sensor, então não trocar por scan-face.
  biometria: Fingerprint,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

/** Tamanhos usados no design (17–20). */
export const iconSize = { nav: 17, row: 18, action: 20 } as const;
