/**
 * Mapa dos eventos (verbas) da folha da Pioneira → categorias de encargos e
 * beneficios. Fonte de verdade unica, montada a partir do catalogo real de
 * FLP_EVENTOS validado em producao (folha mensal de referencia).
 *
 * Usado em dois lugares:
 *   1. `folha.service` (endpoint /api/folha/encargos): agrega finance.ficha_evento
 *      por CODEVENTO — imune a bagunca de tipo (o ETL normaliza TIPOEVEN A/C→P).
 *   2. `folha-flp.etl` (classificarGrupoEvento): override por CODEVENTO, corrige
 *      casos que a heuristica de texto erra (ex.: "MENS. SINDICATO").
 *
 * IMPORTANTE — o que NAO esta na folha (aparece em `observacoes` na UI):
 *   - INSS PATRONAL (~20% sobre a base): recolhido em guia (GPS), nao ha evento.
 *   - Vale-transporte: nao se aplica (empresa de onibus, funcionario tem passe).
 * Totalizadores autoritativos (TIPOEVEN='B'):
 *   - 318 = TOTAL DE PROVENTOS · 319 = TOTAL DE DESCONTOS · 500 = LIQUIDO FOLHA
 */

export type NaturezaCategoria = 'provento' | 'encargo' | 'beneficio' | 'desconto';

export interface CategoriaEventoFolha {
  /** Chave estavel usada no front. */
  chave: string;
  /** Rotulo exibido. */
  label: string;
  natureza: NaturezaCategoria;
  /** Grupo correspondente em finance.eventos_folha (para override do classificador). */
  grupo: string;
  /** CODEVENTOs (FLP_EVENTOS) que compoem a categoria. */
  codigos: number[];
}

// Códigos dos tributos da folha (fonte única — usados nas categorias abaixo e no
// painel de Tributos da Folha). INSS/IRRF = descontos do funcionário (tipo D);
// FGTS = depósito da empresa (bases tipo B). Base INSS (315) alimenta a estimativa
// do INSS patronal.
export const COD_INSS_RETIDO = [171, 191, 169];
export const COD_FGTS = [508, 505, 506, 507];
export const COD_IRRF_RETIDO = [172, 170, 608];
export const COD_BASE_INSS = 315;
/** Adiantamento (evento 607) — saída de caixa (paga no meio do mês). */
export const COD_ADIANTAMENTO = 607;

/**
 * Verbas de FÉRIAS (proventos, TIPOEVEN='P') — custo real de férias.
 * Na Pioneira férias é paga DENTRO da folha Mensal (não há folha tipo 4), o ano
 * todo. Lista validada com os dados reais de 2025 (ver memória
 * folha-ferias-13-realizado). Descontos de acerto (224 LIQ PAGO FÉRIAS, etc.)
 * NÃO entram — são a baixa do que foi adiantado, não custo.
 */
export const COD_FERIAS = [15, 64, 701, 702, 39, 40, 24, 25, 76, 703, 704, 149, 148, 142, 68];

/**
 * Verbas de 13º SALÁRIO (proventos, TIPOEVEN='P').
 * Concentrado em nov/dez (folha TIPOFOLHA=5) + proporcional o ano todo (rescisões,
 * folha Mensal). ATENÇÃO: medir só no tipo 5 — o tipo 35 é cálculo paralelo
 * (duplicata do 5), somar os dois DOBRA o 13º. Ver TIPO_FOLHA_13O_DUPLICADO.
 */
export const COD_13O = [18, 30, 19, 117, 14, 10, 38, 20];

/** Base de cálculo do INSS por funcionário (evento 315, TIPOEVEN='B'). */
export const COD_BASE_INSS_FUNC = 315;

export const CATEGORIAS_ENCARGOS_FOLHA: ReadonlyArray<CategoriaEventoFolha> = [
  // ---- ENCARGOS ----
  { chave: 'inss', label: 'INSS retido do funcionário', natureza: 'encargo', grupo: 'inss', codigos: COD_INSS_RETIDO },
  { chave: 'fgts', label: 'FGTS (depósito da empresa)', natureza: 'encargo', grupo: 'fgts', codigos: COD_FGTS },
  { chave: 'irrf', label: 'IRRF retido', natureza: 'encargo', grupo: 'irrf', codigos: COD_IRRF_RETIDO },
  // ---- BENEFICIOS ----
  { chave: 'ticket_alimentacao', label: 'Ticket alimentação', natureza: 'beneficio', grupo: 'va', codigos: [900] },
  { chave: 'cesta_basica', label: 'Cesta básica', natureza: 'beneficio', grupo: 'beneficio', codigos: [901] },
  { chave: 'seguro_vida', label: 'Seguro de vida', natureza: 'beneficio', grupo: 'beneficio', codigos: [902] },
  // ---- DESCONTOS / REPASSES ----
  { chave: 'adiantamento', label: 'Adiantamento (40%)', natureza: 'desconto', grupo: 'adiantamento', codigos: [607] },
  {
    chave: 'consignado',
    label: 'Consignados / empréstimos',
    natureza: 'desconto',
    grupo: 'consignado',
    codigos: [764, 766, 767, 768, 769, 824, 825, 826, 827],
  },
  { chave: 'sindicato', label: 'Contribuição sindical', natureza: 'desconto', grupo: 'sindical', codigos: [195] },
  { chave: 'pensao', label: 'Pensão alimentícia', natureza: 'desconto', grupo: 'pensao', codigos: [163, 189, 161] },
  // Plano de saude / convenio (coparticipacao descontada do funcionario). Em algumas
  // competencias vem zerado; a categoria so aparece na tela quando tem valor.
  {
    chave: 'plano_saude',
    label: 'Plano de saúde / convênio',
    natureza: 'desconto',
    grupo: 'saude',
    codigos: [284, 283, 249, 905],
  },
];

/**
 * Chave da categoria catch-all "Outros descontos" — montada no service com TODAS
 * as verbas TIPOEVEN='D' que nao caem em nenhuma categoria nomeada acima. Garante
 * que a soma das categorias de desconto feche com o total (evento 319).
 */
export const CHAVE_OUTROS_DESCONTOS = 'outros_descontos';

/** Totalizadores autoritativos da folha (TIPOEVEN='B'). */
export const COD_TOTAL_PROVENTOS = 318;
export const COD_TOTAL_DESCONTOS = 319;
export const COD_LIQUIDO_FOLHA = 500;

/** Chave da categoria de pensao (destaque — vira repasse no Contas a Pagar). */
export const CHAVE_PENSAO = 'pensao';

/**
 * Override CODEVENTO → grupo (finance.eventos_folha.grupo). Derivado do mapa de
 * categorias — mantido em sincronia automaticamente. Aplicado no classificador
 * do ETL antes da heuristica de texto.
 */
export const GRUPO_POR_CODEVENTO: Readonly<Record<number, string>> = (() => {
  const m: Record<number, string> = {};
  for (const cat of CATEGORIAS_ENCARGOS_FOLHA) {
    for (const cod of cat.codigos) m[cod] = cat.grupo;
  }
  return m;
})();
