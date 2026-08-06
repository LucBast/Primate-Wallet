/**
 * Rótulos e cores dos papéis (PRD §3, screenshots 3a e 3b).
 *
 * Os nomes vêm do PRD e são usados sem flexão de gênero: o modelo não guarda
 * gênero, e inventar concordância criaria copy fora da especificação.
 * Registrado em docs/21-DECISIONS.md (D-040).
 */

import type { HouseholdRole } from '@ff/api-contracts';
import type { TextTone } from '../../design-system/Text';

export const ROLE_LABEL: Record<HouseholdRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  ADULT: 'Adulto',
  MEMBER: 'Membro',
  CHILD: 'Filho supervisionado',
};

/** Cores do selo de papel (screenshot 3a). */
export const ROLE_TONE: Record<HouseholdRole, TextTone> = {
  OWNER: 'brand',
  ADMIN: 'info',
  ADULT: 'primary',
  MEMBER: 'secondary',
  CHILD: 'pending',
};

/** O que cada papel pode fazer — texto da tela 6b, item a item. */
export const ROLE_ABILITIES: Record<
  HouseholdRole,
  ReadonlyArray<{ can: boolean; text: string }>
> = {
  OWNER: [
    { can: true, text: 'ver e usar todas as contas da família' },
    { can: true, text: 'registrar e dar baixa em qualquer lançamento' },
    { can: true, text: 'administrar membros e permissões' },
    { can: true, text: 'transferir a propriedade e excluir a família' },
  ],
  ADMIN: [
    { can: true, text: 'ver e usar todas as contas da família' },
    { can: true, text: 'registrar e dar baixa em qualquer lançamento' },
    { can: true, text: 'administrar membros e permissões' },
    { can: false, text: 'remover o proprietário ou excluir a família' },
  ],
  ADULT: [
    { can: true, text: 'ver e usar as contas autorizadas para você' },
    { can: true, text: 'registrar despesas, receitas e contas a pagar' },
    { can: true, text: 'ver relatórios das contas visíveis' },
    { can: false, text: 'administrar membros e permissões' },
  ],
  MEMBER: [
    { can: true, text: 'ver as contas autorizadas para você' },
    { can: true, text: 'registrar despesas e receitas nas contas autorizadas' },
    { can: false, text: 'dar baixa, transferir ou pagar fatura' },
    { can: false, text: 'administrar membros e permissões' },
  ],
  CHILD: [
    { can: true, text: 'ver as contas autorizadas para você' },
    { can: true, text: 'registrar lançamentos, sujeitos a aprovação' },
    { can: false, text: 'dar baixa, transferir ou pagar fatura' },
    { can: false, text: 'ver a auditoria da família ou exportar dados' },
  ],
};
