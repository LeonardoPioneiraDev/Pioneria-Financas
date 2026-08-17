/**
 * De-para SETOR DA FOLHA (VW_FUNCIONARIOS.CODAREA) → UNIDADE FINANCEIRA (CP).
 *
 * Descoberta (validada no banco local 2026-07, 25 áreas, junho/2026):
 * o `CODAREA` da folha NÃO é departamento nem centro de custo — é a
 * LOCALIDADE / TERMINAL de operação onde o funcionário está lotado (bairros e
 * terminais do DF: Santa Maria, QNR, P Sul, Rodoviária…). Já o "setor" do
 * Contas a Pagar é a UNIDADE FINANCEIRA (`CPGITDOC.CODCUSTOFIN`, 8 unidades).
 * São eixos diferentes que só batem por reconciliação — ver memória
 * globus-setor-custofin / garagens-receita-rateio.
 *
 * Este mapa reconcilia os DOIS eixos para que "Custo por Setor" (folha) e o
 * Contas a Pagar falem a mesma língua. Fase 1 (2026-07): só os mapeamentos
 * ÓBVIOS entram; localidades ambíguas (Núcleo Bandeirante, Rodoviária, QNR, P
 * Sul/Norte, Tag, Samambaia…) caem em `a_classificar` até o financeiro definir
 * qual garagem opera cada terminal. Afastados (Sindicato) e imóveis ociosos com
 * líquido zero (União) vão para o balde `nao_operacional`.
 *
 * Qualquer CODAREA fora deste mapa cai automaticamente em `a_classificar` —
 * default seguro (uma área nova num sync futuro não é silenciosamente somada a
 * uma garagem errada).
 */

export type BucketSetor = 'operacional' | 'nao_operacional' | 'a_classificar';

export interface DeParaSetor {
  /** CODAREA cru da folha (VW_FUNCIONARIOS.CODAREA). */
  codArea: string;
  /** Código do grupo reconciliado (= codUnidade quando operacional; chave própria senão). */
  grupoCod: string;
  /** Nome canônico exibido na UI. */
  grupoNome: string;
  /** CODCUSTOFIN da unidade financeira do CP quando há correspondência; null senão. */
  codUnidade: string | null;
  bucket: Exclude<BucketSetor, 'a_classificar'>;
}

/**
 * Mapeamentos confirmados. Localidades ausentes caem em `a_classificar`.
 * As 8 unidades CP: 10003 Santa Maria · 20003 Gama · 30003 Itapoã ·
 * 40004 São Sebastião · 50003 União · 60003 Setor O · 80003 Adm. N. Bandeirante ·
 * 90003 Abastecimento.
 */
export const DE_PARA_SETOR_FOLHA: readonly DeParaSetor[] = [
  // ---- OPERACIONAL (colapsa localidades na unidade financeira) ----
  { codArea: '1131', grupoCod: '10003', grupoNome: 'Santa Maria', codUnidade: '10003', bucket: 'operacional' },
  { codArea: '1132', grupoCod: '20003', grupoNome: 'Gama', codUnidade: '20003', bucket: 'operacional' },
  // Paranoá é a mesma unidade que Itapoã (o financeiro chama de Paranoá; no Globus
  // a unidade é Itapoã 30003). As duas localidades da folha rolam para a mesma unidade.
  { codArea: '1142', grupoCod: '30003', grupoNome: 'Itapoã', codUnidade: '30003', bucket: 'operacional' },
  { codArea: '1144', grupoCod: '30003', grupoNome: 'Itapoã', codUnidade: '30003', bucket: 'operacional' },
  { codArea: '1148', grupoCod: '40004', grupoNome: 'São Sebastião', codUnidade: '40004', bucket: 'operacional' },
  { codArea: '1101', grupoCod: '60003', grupoNome: 'Setor O', codUnidade: '60003', bucket: 'operacional' },
  { codArea: '1', grupoCod: '60003', grupoNome: 'Setor O', codUnidade: '60003', bucket: 'operacional' }, // "GARAGEM SETOR O"

  // ---- NÃO-OPERACIONAL (afastados / imóveis ociosos — fora da comparação entre garagens) ----
  // União: garagem antiga não operacional; a folha vem com líquido ZERO (afastados).
  { codArea: '1145', grupoCod: 'nao_op_uniao', grupoNome: 'União (não-operacional)', codUnidade: '50003', bucket: 'nao_operacional' },
  { codArea: '3', grupoCod: 'nao_op_uniao', grupoNome: 'União (não-operacional)', codUnidade: '50003', bucket: 'nao_operacional' }, // "GARAGEM UNIAO"
  // Sindicato: dirigentes sindicais afastados (cedidos ao sindicato).
  { codArea: '1700', grupoCod: 'nao_op_sindicato', grupoNome: 'Sindicato (afastados)', codUnidade: null, bucket: 'nao_operacional' },
  // "SEM USO": rótulo do próprio Globus.
  { codArea: '1143', grupoCod: 'nao_op_sem_uso', grupoNome: 'Sem uso', codUnidade: null, bucket: 'nao_operacional' },
];

/** Índice CODAREA → mapeamento (para reconciliação em JS, ex. filtros). */
export const DE_PARA_SETOR_POR_CODAREA: Readonly<Record<string, DeParaSetor>> = (() => {
  const m: Record<string, DeParaSetor> = {};
  for (const d of DE_PARA_SETOR_FOLHA) m[d.codArea] = d;
  return m;
})();

const BUCKET_A_CLASSIFICAR: BucketSetor = 'a_classificar';

/** Escapa aspas simples para literal SQL (nomes são constantes, mas defensivo). */
function litSql(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Fragmento SQL com o de-para como tabela derivada, pronto para LEFT JOIN.
 * Todos os valores são constantes deste módulo — sem entrada de usuário.
 * Colunas: (cod_area, grupo_cod, grupo_nome, cod_unidade, bucket).
 */
export function mapaSetorValuesSql(): string {
  const linhas = DE_PARA_SETOR_FOLHA.map(
    (d) =>
      `(${litSql(d.codArea)},${litSql(d.grupoCod)},${litSql(d.grupoNome)},` +
      `${d.codUnidade ? litSql(d.codUnidade) : 'NULL'}::text,${litSql(d.bucket)})`,
  );
  return `(VALUES ${linhas.join(',')}) AS m(cod_area, grupo_cod, grupo_nome, cod_unidade, bucket)`;
}

/** LEFT JOIN pronto para casar `m.cod_area` com o alias `f` (funcionarios). */
export const SETOR_JOIN_SQL = `LEFT JOIN ${mapaSetorValuesSql()} ON m.cod_area = f.cod_area`;

/** Expressões reconciliadas (assumem alias `f` para funcionarios e `m` do JOIN acima). */
export const SETOR_GRUPO_COD_SQL = 'COALESCE(m.grupo_cod, f.cod_area)';
export const SETOR_GRUPO_NOME_SQL = 'COALESCE(m.grupo_nome, f.desc_area)';
export const SETOR_COD_UNIDADE_SQL = 'm.cod_unidade';
export const SETOR_BUCKET_SQL = "COALESCE(m.bucket, 'a_classificar')";

/** Reconcilia um CODAREA cru para o grupo/bucket (uso em JS: filtros, drill-down). */
export function reconciliarSetor(codArea: string | null): {
  grupoCod: string | null;
  grupoNome: string | null;
  codUnidade: string | null;
  bucket: BucketSetor;
} {
  if (codArea && DE_PARA_SETOR_POR_CODAREA[codArea]) {
    const d = DE_PARA_SETOR_POR_CODAREA[codArea]!;
    return { grupoCod: d.grupoCod, grupoNome: d.grupoNome, codUnidade: d.codUnidade, bucket: d.bucket };
  }
  return { grupoCod: codArea, grupoNome: null, codUnidade: null, bucket: BUCKET_A_CLASSIFICAR };
}
