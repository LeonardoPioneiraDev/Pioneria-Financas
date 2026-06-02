import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  Landmark,
  Banknote,
  Users2,
  Building2,
  Calculator,
  HardDrive,
  TrendingUp,
  ClipboardList,
  FileBarChart,
  Crown,
  ShieldCheck,
  Users,
  Settings2,
  Plug,
} from 'lucide-react';
// Importar o tipo via deep-path evita o barrel exporta tudo do @pioneira/shared
// (que puxa schemas TypeBox e quebra a resolucao no turbopack em nested routes).
import type { UserRole } from '@pioneira/shared/enums/user-role';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles?: ReadonlyArray<UserRole>;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const ALL_FINANCEIRO: ReadonlyArray<UserRole> = ['admin', 'cfo', 'controller'];
const APROVADOR_CP: ReadonlyArray<UserRole> = ['admin', 'cfo', 'controller', 'cp_analista'];
const APROVADOR_CR: ReadonlyArray<UserRole> = ['admin', 'cfo', 'controller', 'cr_analista'];
const ALL_RH: ReadonlyArray<UserRole> = ['admin', 'cfo', 'controller', 'rh'];
const EXECUTIVO: ReadonlyArray<UserRole> = ['admin', 'cfo', 'auditor'];
const SOMENTE_ADMIN: ReadonlyArray<UserRole> = ['admin'];

const TODAS_ROTAS: ReadonlyArray<NavigationItem> = [
  // Dashboard sempre acessivel
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
];

const OPERACIONAL: ReadonlyArray<NavigationItem> = [
  { name: 'Contas a Pagar', href: '/contas-pagar', icon: Wallet, roles: APROVADOR_CP },
  { name: 'Contas a Receber', href: '/contas-receber', icon: Receipt, roles: APROVADOR_CR },
  { name: 'Recebíveis GDF', href: '/recebiveis-gdf', icon: Landmark, roles: ALL_FINANCEIRO },
  { name: 'Conciliação Bancária', href: '/conciliacao', icon: Banknote, roles: ALL_FINANCEIRO },
];

const FOLHA_TRIBUTOS: ReadonlyArray<NavigationItem> = [
  { name: 'Folha (CPG)', href: '/folha', icon: Users2, roles: ALL_RH },
  { name: 'Folha por Setor', href: '/folha-detalhe', icon: Building2, roles: ALL_RH },
  { name: 'Tributos', href: '/tributos', icon: Calculator, roles: ALL_FINANCEIRO },
  { name: 'Depreciação', href: '/depreciacao', icon: HardDrive, roles: ALL_FINANCEIRO },
];

const PLANEJAMENTO: ReadonlyArray<NavigationItem> = [
  { name: 'Fluxo de Caixa', href: '/fluxo-caixa', icon: TrendingUp, roles: ALL_FINANCEIRO },
  { name: 'Orçamento', href: '/orcamento', icon: ClipboardList, roles: ALL_FINANCEIRO },
  { name: 'DRE', href: '/dre', icon: FileBarChart, roles: ALL_FINANCEIRO },
];

const EXEC: ReadonlyArray<NavigationItem> = [
  { name: 'Painel CFO', href: '/painel-cfo', icon: Crown, roles: EXECUTIVO },
  { name: 'Auditoria', href: '/auditoria', icon: ShieldCheck, roles: EXECUTIVO },
];

const ADMIN: ReadonlyArray<NavigationItem> = [
  { name: 'Usuários', href: '/admin/usuarios', icon: Users, roles: SOMENTE_ADMIN },
  { name: 'Parâmetros', href: '/admin/parametros', icon: Settings2, roles: SOMENTE_ADMIN },
  { name: 'Integrações', href: '/admin/integracoes', icon: Plug, roles: SOMENTE_ADMIN },
];

function permitido(item: NavigationItem, role: UserRole): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}

export function buildNavigationGroups(role: UserRole): NavigationGroup[] {
  const grupos: NavigationGroup[] = [];
  const adicionarSeTiverItens = (label: string, lista: ReadonlyArray<NavigationItem>): void => {
    const itens = lista.filter((i) => permitido(i, role));
    if (itens.length > 0) grupos.push({ label, items: itens });
  };

  adicionarSeTiverItens('Geral', TODAS_ROTAS);
  adicionarSeTiverItens('Operacional', OPERACIONAL);
  adicionarSeTiverItens('Folha & Tributos', FOLHA_TRIBUTOS);
  adicionarSeTiverItens('Planejamento', PLANEJAMENTO);
  adicionarSeTiverItens('Executivo', EXEC);
  adicionarSeTiverItens('Admin', ADMIN);

  return grupos;
}
