/**
 * Catálogo-mestre das FUNCIONALIDADES (módulos) para a liberação progressiva.
 * A ordem AQUI é a ordem PADRÃO de validação: o usuário valida de cima para
 * baixo (dentro do conjunto que o admin atribuiu a ele). A `chave` = href da
 * rota (usado para casar com o menu).
 */
export interface FuncionalidadeInfo {
  chave: string; // = href da rota (ex.: '/contas-pagar')
  nome: string;
  grupo: string;
}

// O tempo mínimo entre o 1º acesso e a validação é CONFIGURÁVEL (em minutos) em
// identity.configuracao.minutos_validacao_funcionalidade — ver módulo parametros.

// OBS.: o Dashboard NÃO entra na trilha de validação — fica sempre disponível no
// menu. A validação progressiva começa em Contas a Pagar.
export const FUNCIONALIDADES: ReadonlyArray<FuncionalidadeInfo> = [
  { chave: '/contas-pagar', nome: 'Contas a Pagar', grupo: 'Operacional' },
  { chave: '/contas-receber', nome: 'Recebíveis', grupo: 'Operacional' },
  { chave: '/recebiveis-gdf', nome: 'Recebíveis GDF', grupo: 'Operacional' },
  { chave: '/conciliacao', nome: 'Conciliação Bancária', grupo: 'Operacional' },
  { chave: '/folha', nome: 'Encargos & Benefícios', grupo: 'Folha & Tributos' },
  { chave: '/folha-detalhe', nome: 'Custo por Setor', grupo: 'Folha & Tributos' },
  { chave: '/tributos', nome: 'Tributos', grupo: 'Folha & Tributos' },
  { chave: '/depreciacao', nome: 'Depreciação', grupo: 'Folha & Tributos' },
  { chave: '/fluxo-caixa', nome: 'Fluxo de Caixa', grupo: 'Planejamento' },
  { chave: '/orcamento', nome: 'Orçamento', grupo: 'Planejamento' },
  { chave: '/dre', nome: 'DRE', grupo: 'Planejamento' },
  { chave: '/painel-cfo', nome: 'Painel CFO', grupo: 'Executivo' },
];

export const FUNCIONALIDADE_LABEL: Record<string, string> = Object.fromEntries(
  FUNCIONALIDADES.map((f) => [f.chave, f.nome]),
);

/** Ordem canônica das chaves (para calcular a progressão). */
export const ORDEM_FUNCIONALIDADES: ReadonlyArray<string> = FUNCIONALIDADES.map((f) => f.chave);

/**
 * Calcula as funcionalidades LIBERADAS (visíveis) de um usuário em liberação
 * progressiva: todas as já validadas + a PRÓXIMA a validar (a primeira atribuída
 * ainda não validada, na ordem canônica). As posteriores ficam bloqueadas.
 */
export function funcionalidadesLiberadas(atribuidas: string[], validadas: string[]): string[] {
  const atrib = new Set(atribuidas);
  const valid = new Set(validadas);
  const liberadas: string[] = [];
  for (const chave of ORDEM_FUNCIONALIDADES) {
    if (!atrib.has(chave)) continue;
    liberadas.push(chave);
    if (!valid.has(chave)) break; // esta é a "atual a validar"; as próximas ficam travadas
  }
  return liberadas;
}

/** A próxima funcionalidade a validar (primeira atribuída não validada). Null se acabou. */
export function proximaAValidar(atribuidas: string[], validadas: string[]): string | null {
  const atrib = new Set(atribuidas);
  const valid = new Set(validadas);
  for (const chave of ORDEM_FUNCIONALIDADES) {
    if (atrib.has(chave) && !valid.has(chave)) return chave;
  }
  return null;
}
