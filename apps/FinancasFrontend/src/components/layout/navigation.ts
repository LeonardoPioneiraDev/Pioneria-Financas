import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Wallet,
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
  HelpCircle,
  Activity,
  RefreshCw,
  ListChecks,
  ClipboardCheck,
  GanttChart,
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
  { name: 'Recebíveis', href: '/contas-receber', icon: Banknote, roles: APROVADOR_CR },
  { name: 'Recebíveis GDF', href: '/recebiveis-gdf', icon: Landmark, roles: ALL_FINANCEIRO },
  { name: 'Conciliação Bancária', href: '/conciliacao', icon: Banknote, roles: ALL_FINANCEIRO },
];

const FOLHA_TRIBUTOS: ReadonlyArray<NavigationItem> = [
  { name: 'Encargos & Benefícios', href: '/folha', icon: Users2, roles: ALL_RH },
  { name: 'Custo por Setor', href: '/folha-detalhe', icon: Building2, roles: ALL_RH },
  { name: 'Tributos', href: '/tributos', icon: Calculator, roles: ALL_FINANCEIRO },
  { name: 'Depreciação', href: '/depreciacao', icon: HardDrive, roles: ALL_FINANCEIRO },
];

const PLANEJAMENTO: ReadonlyArray<NavigationItem> = [
  { name: 'Fluxo de Caixa', href: '/fluxo-caixa', icon: TrendingUp, roles: ALL_FINANCEIRO },
  { name: 'Orçamento', href: '/orcamento', icon: ClipboardList, roles: ALL_FINANCEIRO },
  { name: 'DRE', href: '/dre', icon: FileBarChart, roles: ALL_FINANCEIRO },
];

const APROVADOR_VALIDACAO: ReadonlyArray<UserRole> = ['admin', 'cfo'];

const EXEC: ReadonlyArray<NavigationItem> = [
  { name: 'Painel CFO', href: '/painel-cfo', icon: Crown, roles: EXECUTIVO },
  { name: 'Validações', href: '/validacoes', icon: ClipboardCheck, roles: APROVADOR_VALIDACAO },
  { name: 'Auditoria', href: '/auditoria', icon: ShieldCheck, roles: EXECUTIVO },
  // Relatório do PROJETO, não do financeiro — por isso fica fora do catálogo de
  // módulos (`module-status.ts`): ele não é um módulo a ser validado, ele mede
  // a validação dos outros. Entrasse no catálogo, contaria a si mesmo.
  { name: 'Linha do Tempo', href: '/relatorio-prazo', icon: GanttChart, roles: EXECUTIVO },
];

const ADMIN: ReadonlyArray<NavigationItem> = [
  { name: 'Perguntas ao Financeiro', href: '/perguntas', icon: HelpCircle, roles: ALL_RH },
  { name: 'Usuários', href: '/admin/usuarios', icon: Users, roles: SOMENTE_ADMIN },
  { name: 'Métricas de Sistema', href: '/admin/metrics', icon: Activity, roles: SOMENTE_ADMIN },
  { name: 'Sincronismo', href: '/admin/sincronismo', icon: RefreshCw, roles: SOMENTE_ADMIN },
  { name: 'Parâmetros', href: '/admin/parametros', icon: Settings2, roles: SOMENTE_ADMIN },
  { name: 'Integrações', href: '/admin/integracoes', icon: Plug, roles: SOMENTE_ADMIN },
];

function permitido(item: NavigationItem, role: UserRole): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}

/**
 * Como o menu é restringido:
 * - `trilha`  — AUDITOR em liberação progressiva: só as funcionalidades liberadas
 *   (validadas + a próxima) mais o atalho "Minhas funcionalidades".
 * - `espelho` — CFO: só o que a auditoria JÁ VALIDOU. Ele avaliza o conferido;
 *   tela ainda em análise não aparece para ele.
 */
export interface RestricaoMenu {
  modo: 'trilha' | 'espelho';
  chaves: readonly string[];
}

/** Dados do usuário logado que definem a restrição do menu. */
export interface UsuarioMenu {
  role: UserRole;
  liberacaoProgressiva: boolean;
  funcionalidadesLiberadas: string[];
  funcionalidadesValidadasAuditoria: string[] | null;
}

/**
 * Qual restrição vale para este usuário. Usado pelo menu E pelo guarda de rota,
 * para os dois não divergirem (menu escondia, URL direta entrava).
 */
export function restricaoDoUsuario(user: UsuarioMenu): RestricaoMenu | null {
  if (user.liberacaoProgressiva) return { modo: 'trilha', chaves: user.funcionalidadesLiberadas };
  if (user.role === 'cfo' && user.funcionalidadesValidadasAuditoria) {
    return { modo: 'espelho', chaves: user.funcionalidadesValidadasAuditoria };
  }
  return null;
}

/**
 * Monta os grupos do menu. Sem `restricao`, filtra pelo papel (comportamento
 * normal). Com `restricao`, as chaves mandam — independente do papel.
 */
export function buildNavigationGroups(role: UserRole, restricao?: RestricaoMenu | null): NavigationGroup[] {
  const setLib = restricao ? new Set(restricao.chaves) : null;
  // Dashboard nunca entra na trilha de validação — fica sempre disponível.
  // Validações é o trabalho do CFO/admin: também não pode sumir.
  const sempreVisivel = new Set([
    '/dashboard',
    ...(restricao?.modo === 'trilha' ? ['/minhas-funcionalidades'] : []),
    ...(role === 'cfo' || role === 'admin' ? ['/validacoes'] : []),
  ]);
  const visivel = (item: NavigationItem): boolean => {
    if (setLib) return setLib.has(item.href) || sempreVisivel.has(item.href);
    return permitido(item, role);
  };

  const grupos: NavigationGroup[] = [];
  const adicionarSeTiverItens = (label: string, lista: ReadonlyArray<NavigationItem>): void => {
    const itens = lista.filter(visivel);
    if (itens.length > 0) grupos.push({ label, items: itens });
  };

  // Auditor em trilha sempre tem o atalho para conferir/validar.
  if (restricao?.modo === 'trilha') {
    grupos.push({ label: 'Liberação', items: [{ name: 'Minhas funcionalidades', href: '/minhas-funcionalidades', icon: ListChecks }] });
  }

  adicionarSeTiverItens('Geral', TODAS_ROTAS);
  adicionarSeTiverItens('Operacional', OPERACIONAL);
  adicionarSeTiverItens('Folha & Tributos', FOLHA_TRIBUTOS);
  adicionarSeTiverItens('Planejamento', PLANEJAMENTO);
  adicionarSeTiverItens('Executivo', EXEC);
  // Admin nunca é restringido (nem trilha nem espelho), mas mantém a regra por segurança.
  if (!restricao) adicionarSeTiverItens('Admin', ADMIN);

  return grupos;
}
