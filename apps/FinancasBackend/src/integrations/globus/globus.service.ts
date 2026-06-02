import type { FastifyInstance } from 'fastify';
import { GLOBUS_QUERIES } from './globus.queries.js';

export interface ComprasPagamentosMensalRow {
  mes: string;
  codEmpresa: number;
  nomeEmpresa: string | null;
  vlrCompras: number;
  vlrPag: number;
  vlrVencfin: number;
  perc: number | null;
  entradaDefin: number;
}

export interface ComprasPagamentosMensalParams {
  empresa: number;
  /** Primeiro dia do mes (00:00 local). */
  dtInicio: Date;
  /** Primeiro dia do MES SEGUINTE (exclusivo). */
  dtFimExclusivo: Date;
}

// Oracle retorna chaves em UPPER pelo OUT_FORMAT_OBJECT. Mapeamos para camelCase.
interface RawComprasPagamentosRow {
  MES: string;
  CODEMP: number;
  NOME_EMPRESA: string | null;
  VLR_COMPRAS: number;
  VLR_PAG: number;
  VLR_VENCFIN: number;
  PERC: number | null;
  ENTRADADEFIN: number;
}

export function buildGlobusService(fastify: FastifyInstance) {
  function exigirOracleDisponivel(): void {
    if (!fastify.oracle?.isAvailable?.()) {
      throw fastify.httpErrors.serviceUnavailable(
        'Conexao com GLOBUS (Oracle) indisponivel. Verifique ORACLE_ENABLED e os logs do backend.',
      );
    }
  }

  return {
    /**
     * Relatorio mensal: Compras x Pagamentos programados x Carteira CPG.
     * Equivalente ao SQL legado da Pioneira (2009) modernizado para intervalo
     * semi-aberto (>= dt_ini AND < dt_fim_exclusivo).
     */
    async comprasPagamentosMensal(params: ComprasPagamentosMensalParams): Promise<ComprasPagamentosMensalRow | null> {
      exigirOracleDisponivel();

      const result = await fastify.oracle.execute<RawComprasPagamentosRow>(
        GLOBUS_QUERIES.comprasPagamentosMensal,
        {
          empresa: params.empresa,
          dt_ini: params.dtInicio,
          dt_fim_excl: params.dtFimExclusivo,
        },
      );

      const row = result.rows?.[0];
      if (!row) return null;

      return {
        mes: row.MES,
        codEmpresa: row.CODEMP,
        nomeEmpresa: row.NOME_EMPRESA,
        vlrCompras: Number(row.VLR_COMPRAS ?? 0),
        vlrPag: Number(row.VLR_PAG ?? 0),
        vlrVencfin: Number(row.VLR_VENCFIN ?? 0),
        perc: row.PERC === null || row.PERC === undefined ? null : Number(row.PERC),
        entradaDefin: Number(row.ENTRADADEFIN ?? 0),
      };
    },
  };
}

export type GlobusService = ReturnType<typeof buildGlobusService>;
