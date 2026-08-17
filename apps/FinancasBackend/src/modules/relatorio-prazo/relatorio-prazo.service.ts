import type { FastifyInstance } from 'fastify';
import type { RelatorioPrazoResponse } from '@pioneira/shared';
import { dataIsoSp } from '@/shared/utils/datetime.js';
import {
  INICIO_FASE_0,
  INICIO_FASE_1,
  CP_DECLARADO_PRONTO,
  diasEntre,
  calcularCicloValidacao,
  calcularReferencia,
  type RegistroValidacao,
} from '@/shared/relatorio-prazo/calculo.js';

interface LinhaValidacao {
  funcionalidade: string;
  tipo: string;
  status: string;
  observacoes: string | null;
  criado_em: Date;
}

/**
 * Linha do tempo do projeto, sempre ao vivo.
 *
 * Tudo que é dado do banco vem daqui; o catálogo de módulos é cruzado no
 * frontend, onde ele já mora. Nenhum número é cacheado de propósito: a tela
 * existe justamente para não depender de alguém lembrar de atualizar.
 */
export function buildRelatorioPrazoService(fastify: FastifyInstance) {
  async function contarEscalar(sql: string): Promise<number> {
    const linhas = await fastify.db.query<Array<{ n: string }>>(sql);
    return Number(linhas[0]?.n ?? 0);
  }

  return {
    async obter(): Promise<RelatorioPrazoResponse> {
      const hoje = dataIsoSp();

      const linhas = await fastify.db.query<LinhaValidacao[]>(
        `SELECT funcionalidade, tipo, status, observacoes, criado_em
           FROM audit.validacao_funcionalidade
          ORDER BY criado_em ASC`,
      );

      const validacoes: RegistroValidacao[] = linhas.map((l) => ({
        funcionalidade: l.funcionalidade,
        tipo: l.tipo,
        status: l.status,
        observacoes: l.observacoes,
        criadoEm: dataIsoSp(l.criado_em),
      }));

      const inicioValidacao = validacoes[0]?.criadoEm ?? null;

      const [tabelas, titulosCp] = await Promise.all([
        contarEscalar(
          `SELECT count(*)::text AS n FROM information_schema.tables
            WHERE table_schema IN ('finance','identity','integration','audit')`,
        ),
        contarEscalar('SELECT count(*)::text AS n FROM finance.contas_pagar'),
      ]);

      return {
        hoje,
        marcos: {
          inicioFase0: INICIO_FASE_0,
          inicioFase1: INICIO_FASE_1,
          cpDeclaradoPronto: CP_DECLARADO_PRONTO,
        },
        dias: {
          total: diasEntre(INICIO_FASE_0, hoje),
          fase0: diasEntre(INICIO_FASE_0, INICIO_FASE_1),
          fase1: diasEntre(INICIO_FASE_1, hoje),
          validacao: inicioValidacao ? diasEntre(inicioValidacao, hoje) : 0,
        },
        inicioValidacao,
        validacoes,
        contagens: { tabelas, titulosCp },
        cicloValidacao: calcularCicloValidacao(validacoes),
        referencia: calcularReferencia(validacoes),
      };
    },
  };
}
