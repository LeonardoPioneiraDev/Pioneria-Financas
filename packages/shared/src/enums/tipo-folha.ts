/**
 * Tipos de "folha" no CPG da Pioneira/Praxio.
 * Identificacao por padroes textuais no favorecido + CODTPDOC + competencia.
 */
export const TIPO_FOLHA = [
  'salario',
  'decimo_terceiro',
  'ferias',
  'rescisao',
  'adiantamento',
  'inss',
  'fgts',
  'irrf_folha',
  'sindicato',
  'vale_transporte',
  'vale_alimentacao',
  'pensao_alimenticia',
  'outros_encargos',
  'nao_classificado',
] as const;

export type TipoFolha = (typeof TIPO_FOLHA)[number];

export const TIPO_FOLHA_LABEL: Record<TipoFolha, string> = {
  salario: 'Salario',
  decimo_terceiro: '13o Salario',
  ferias: 'Ferias',
  rescisao: 'Rescisao',
  adiantamento: 'Adiantamento / Vale',
  inss: 'INSS',
  fgts: 'FGTS',
  irrf_folha: 'IRRF da Folha',
  sindicato: 'Contribuicao Sindical',
  vale_transporte: 'Vale-Transporte',
  vale_alimentacao: 'Vale-Alimentacao',
  pensao_alimenticia: 'Pensao Alimenticia',
  outros_encargos: 'Outros Encargos',
  nao_classificado: 'Nao Classificado',
};

export const TIPO_FOLHA_GRUPO: Record<TipoFolha, 'funcionario' | 'encargo' | 'beneficio' | 'desconto' | 'outros'> = {
  salario: 'funcionario',
  decimo_terceiro: 'funcionario',
  ferias: 'funcionario',
  rescisao: 'funcionario',
  adiantamento: 'funcionario',
  inss: 'encargo',
  fgts: 'encargo',
  irrf_folha: 'encargo',
  sindicato: 'desconto',
  vale_transporte: 'beneficio',
  vale_alimentacao: 'beneficio',
  pensao_alimenticia: 'desconto',
  outros_encargos: 'encargo',
  nao_classificado: 'outros',
};

/**
 * Classifica um titulo de folha baseado em multiplos sinais:
 * - codTpDoc (FLP, F13, FER, RES, ADT, DAR, GPS, GRF...)
 * - favorecido (texto livre - busca por palavras-chave)
 * - codigoForn (alguns fornecedores tem padrao - INSS, Caixa, etc.)
 * - mes da competencia (novembro/dezembro = 13o)
 *
 * Retorna 'nao_classificado' se nenhum sinal bater - util para refinar depois.
 */
export function classificarTipoFolha(args: {
  codTpDoc: string | null;
  favorecido: string | null;
  competenciaFlp: string | null;
}): TipoFolha {
  const tipo = (args.codTpDoc ?? '').toUpperCase().trim();
  const fav = (args.favorecido ?? '').toUpperCase().trim();

  // 1. CODTPDOC e sinal forte
  if (['F13', '13S', 'D13'].includes(tipo)) return 'decimo_terceiro';
  if (['FER', 'FERIAS'].includes(tipo)) return 'ferias';
  if (['RES', 'RESC'].includes(tipo)) return 'rescisao';
  if (['ADT', 'VAL', 'VALE', 'ADIANT'].includes(tipo)) return 'adiantamento';
  if (['PEN', 'PNS', 'PENSAO'].includes(tipo)) return 'pensao_alimenticia';

  // 2. Padroes no favorecido (mais confiavel quando preenchido)
  if (/INSS|RECEITA FED|PREVIDENCIA|RFB(?!\w)/i.test(fav)) {
    // pode ser INSS ou IRRF
    if (/IRRF|IMPOSTO DE RENDA|IR\s*RETIDO/i.test(fav)) return 'irrf_folha';
    return 'inss';
  }
  if (/CAIXA ECON|FGTS|FUNDO DE GARANTIA|^CEF\b/i.test(fav)) return 'fgts';
  if (/IRRF|IMPOSTO DE RENDA|IR\s*FOLHA/i.test(fav)) return 'irrf_folha';
  if (/SINDICATO|SIND\b|CONFEDERACAO/i.test(fav)) return 'sindicato';
  if (/VALE.?TRANSP|VT\b|PASSE LIVRE|BILHETE UNICO|TRANSP\w* PUBLICO/i.test(fav)) return 'vale_transporte';
  if (/SODEXO|ALELO|VR\b|TICKET|VALE.?ALIM|VA\b|VALE.?REFEI/i.test(fav)) return 'vale_alimentacao';
  if (/PENSAO|ALIMENT[IÍ]CIA|JUDICIAL|FORUM/i.test(fav)) return 'pensao_alimenticia';

  // 3. Padroes especificos de folha por descricao
  if (/13[O°]?\s*SAL|DECIMO TERC|GRATIFICACAO NATAL/i.test(fav)) return 'decimo_terceiro';
  if (/FERIAS|FÉRIAS/i.test(fav)) return 'ferias';
  if (/RESCIS/i.test(fav)) return 'rescisao';
  if (/ADIANT|VALE\b/i.test(fav)) return 'adiantamento';

  // 4. CODTPDOC generico de folha → assume salario (mais comum)
  if (['FLP', 'FOL', 'SAL', 'FOLHA'].includes(tipo)) return 'salario';

  // 5. Se tem competencia FLP mas nada mais bate → encargo generico
  if (args.competenciaFlp) return 'outros_encargos';

  return 'nao_classificado';
}
