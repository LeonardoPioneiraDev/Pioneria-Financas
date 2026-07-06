import type { FastifyInstance } from 'fastify';
import type {
  ConferenciaDivergenciasResponse,
  ConferenciaRetencao,
  RetencaoComparacao,
  RetencaoTipo,
  AliquotasUsadasResponse,
} from '@pioneira/shared';
import { ALIQUOTAS_PADRAO } from '@pioneira/shared';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';

const TOLERANCIA_CENTS = 1;  // 1 centavo de tolerancia para arredondamento
// So a NOTA FISCAL DE SERVICO (NFS) sofre retencao na fonte de PIS/COFINS/CSLL/IRRF.
// NF/NFE/NFV sao MERCADORIA (produto nao tem retencao na fonte) e BOL/REC/AD/FIN nao
// sao NF de servico. Inclui-los marcava ~4.300 titulos de retencao ZERO LEGITIMA como
// "divergentes" (falso positivo) e, com o LIMIT, a tela mostrava o proprio teto como
// total. Validado no banco (2026-07-06): NF 0/3887, NFV 1/405 com retencao vs NFS 69/69.
// A validacao da heuristica (auditoria §7) sempre foi feita so sobre NFS.
const TIPOS_DOC_SUJEITOS = ['NFS'];

/**
 * Decide se um CP eh "aplicavel" pra retencao padrao (NF de servico PJ).
 * Casos NAO aplicaveis: folha de pagamento, guias de imposto, lancamento manual,
 * boletos genericos (que ja tem retencao na fonte do banco/emissor).
 */
function ehAplicavel(cp: ContaPagar): { aplicavel: boolean; motivo?: string } {
  if (cp.origemDocumento === 'folha') return { aplicavel: false, motivo: 'Origem folha — retencoes calculadas pelo eSocial' };
  if (cp.origemDocumento === 'guia') return { aplicavel: false, motivo: 'Origem guia — eh a propria retencao paga ao fisco' };
  const tipo = cp.tipoDocumento?.toUpperCase() ?? '';
  if (!TIPOS_DOC_SUJEITOS.includes(tipo)) {
    return { aplicavel: false, motivo: `Tipo ${tipo || '?'} nao eh NF de servico (heuristica padrao nao aplica)` };
  }
  // Fornecedor optante do Simples Nacional NAO sofre retencao de PIS/COFINS/CSLL/IRRF
  // na fonte (recolhe tudo no DAS). Marcar como nao aplicavel evita falso divergente.
  if (cp.fornecedor?.optSimplesNacional === true) {
    return { aplicavel: false, motivo: 'Fornecedor Simples Nacional — sem retencao de PIS/COFINS/CSLL/IRRF na fonte' };
  }
  return { aplicavel: true };
}

function calcular(cp: ContaPagar): ConferenciaRetencao {
  const valorBruto = Number(cp.valorBrutoCents);
  // BASE DE CALCULO das retencoes = o proprio valor BRUTO da NF (valor antes das
  // retencoes). valor_bruto_cents vem do Globus VLR_TOTAL_ITENS (migration
  // 1700000032000) e JA E o bruto/base fiscal — o retido de PIS bate no centavo com
  // bruto*0,65% (validado no banco em 2026-07-06).
  // ATENCAO historica: ate a migration 32000 esse campo era o LIQUIDO (VLR_ORIGINAL) e
  // a base correta era liquido+retencoes. Quando o campo virou bruto, aquela formula
  // (bruto + retencoes) passou a inflar a base em ~4% e marcava 100% das NFS como
  // divergentes. Base correta agora = bruto puro.
  const baseCalculo = valorBruto;

  const aplicabilidade = ehAplicavel(cp);
  const alertas: string[] = [];
  if (!aplicabilidade.aplicavel && aplicabilidade.motivo) {
    alertas.push(aplicabilidade.motivo);
  }

  // Aviso quando a base eh pequena (provavelmente isento de IRRF)
  if (baseCalculo < ALIQUOTAS_PADRAO.valorMinimoIrrfCents) {
    alertas.push(`Base abaixo do minimo IRRF (R$ ${(ALIQUOTAS_PADRAO.valorMinimoIrrfCents / 100).toFixed(2)})`);
  }

  // Calcula esperados (so se aplicavel) sobre a BASE CORRETA (= liquido + retencoes)
  function esperado(percAplicavel: number, retidoCents: number, tipo: RetencaoTipo, observacao: string | null = null): RetencaoComparacao {
    const esperadoCents = aplicabilidade.aplicavel
      ? Math.round(baseCalculo * (percAplicavel / 100))
      : 0;
    const divergencia = retidoCents - esperadoCents;
    return {
      tipo,
      aliquotaPerc: percAplicavel,
      esperadoCents,
      retidoCents,
      divergenciaCents: divergencia,
      divergente: aplicabilidade.aplicavel && Math.abs(divergencia) > TOLERANCIA_CENTS,
      aplicavel: aplicabilidade.aplicavel,
      observacao,
    };
  }

  // IRRF: so aplica se a BASE >= minimo (Art. 67 Lei 9.430/96)
  function esperadoIrrf(percAplicavel: number, retidoCents: number): RetencaoComparacao {
    const eligible = aplicabilidade.aplicavel && baseCalculo >= ALIQUOTAS_PADRAO.valorMinimoIrrfCents;
    const esperadoCents = eligible ? Math.round(baseCalculo * (percAplicavel / 100)) : 0;
    const divergencia = retidoCents - esperadoCents;
    return {
      tipo: 'irrf',
      aliquotaPerc: percAplicavel,
      esperadoCents,
      retidoCents,
      divergenciaCents: divergencia,
      divergente: eligible && Math.abs(divergencia) > TOLERANCIA_CENTS,
      aplicavel: eligible,
      observacao: !eligible && aplicabilidade.aplicavel
        ? `Isento — valor menor que R$ ${(ALIQUOTAS_PADRAO.valorMinimoIrrfCents / 100).toFixed(2)}`
        : null,
    };
  }

  const retencoes: RetencaoComparacao[] = [
    esperado(ALIQUOTAS_PADRAO.pisPerc, Number(cp.vlrPisCents ?? 0), 'pis'),
    esperado(ALIQUOTAS_PADRAO.cofinsPerc, Number(cp.vlrCofinsCents ?? 0), 'cofins'),
    esperado(ALIQUOTAS_PADRAO.csllPerc, Number(cp.vlrCsllCents ?? 0), 'csll'),
    esperadoIrrf(ALIQUOTAS_PADRAO.irrfPerc, Number(cp.vlrIrrfCents ?? 0)),
    // INSS: nao calcula esperado (depende muito do tipo de servico). So mostra retido.
    {
      tipo: 'inss',
      aliquotaPerc: 0,
      esperadoCents: 0,
      retidoCents: Number(cp.vlrInssCents ?? 0),
      divergenciaCents: 0,
      divergente: false,
      aplicavel: false,
      observacao: 'INSS nao calculado automaticamente (depende do tipo de servico)',
    },
    // ISS: idem (depende do municipio + tipo)
    {
      tipo: 'iss',
      aliquotaPerc: 0,
      esperadoCents: 0,
      retidoCents: Number(cp.vlrIssCents ?? 0),
      divergenciaCents: 0,
      divergente: false,
      aplicavel: false,
      observacao: `ISS depende do municipio (${ALIQUOTAS_PADRAO.issMinPerc}-${ALIQUOTAS_PADRAO.issMaxPerc}% normalmente)`,
    },
  ];

  const totalRetido = retencoes.reduce((s, r) => s + r.retidoCents, 0);
  const totalEsperado = retencoes.reduce((s, r) => s + r.esperadoCents, 0);
  const divergenciaTotal = totalRetido - totalEsperado;
  const temDivergencia = retencoes.some((r) => r.divergente);

  return {
    contaPagarId: cp.id,
    numeroDocumento: cp.numeroDocumento,
    fornecedorRazaoSocial: cp.fornecedor?.razaoSocial ?? null,
    cnpjCpf: cp.fornecedor?.cnpjCpf ?? null,
    fornecedorSimplesNacional: cp.fornecedor?.optSimplesNacional ?? null,
    fornecedorTipoInscricao: cp.fornecedor?.tipoInscricao ?? null,
    fornecedorUf: cp.fornecedor?.uf ?? null,
    fornecedorMunicipio: cp.fornecedor?.cidade ?? null,
    valorBrutoCents: valorBruto,
    totalRetidoCents: totalRetido,
    totalEsperadoCents: totalEsperado,
    divergenciaTotalCents: divergenciaTotal,
    temDivergencia,
    retencoes,
    alertas,
  };
}

export function buildRetencoesService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);

  return {
    aliquotasUsadas(): AliquotasUsadasResponse {
      return {
        perc: {
          pis: ALIQUOTAS_PADRAO.pisPerc,
          cofins: ALIQUOTAS_PADRAO.cofinsPerc,
          csll: ALIQUOTAS_PADRAO.csllPerc,
          irrf: ALIQUOTAS_PADRAO.irrfPerc,
          inss: ALIQUOTAS_PADRAO.inssPerc,
          issMin: ALIQUOTAS_PADRAO.issMinPerc,
          issMax: ALIQUOTAS_PADRAO.issMaxPerc,
        },
        valorMinimoIrrfCents: ALIQUOTAS_PADRAO.valorMinimoIrrfCents,
        observacao:
          'Heuristica MVP Lucro Real para NF de servico PJ generico. Casos especiais ' +
          '(Simples Nacional, MEI, exterior, servicos especificos) precisam tratamento dedicado.',
      };
    },

    async conferirTitulo(contaPagarId: string): Promise<ConferenciaRetencao> {
      const cp = await cpRepo.findOne({
        where: { id: contaPagarId },
        relations: ['fornecedor'],
      });
      if (!cp) throw fastify.httpErrors.notFound('Conta a pagar nao encontrada');
      return calcular(cp);
    },

    async listarDivergencias(): Promise<ConferenciaDivergenciasResponse> {
      // Carrega NFs apenas (tipos aplicaveis) com valor > minimo (otimiza)
      const cps = await cpRepo
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .where('cp.tipo_documento IN (:...tipos)', { tipos: TIPOS_DOC_SUJEITOS })
        .andWhere('cp.excluido_em IS NULL')
        .andWhere('cp.origem_documento NOT IN (:...origens)', { origens: ['folha', 'guia'] })
        .andWhere('cp.valor_bruto_cents > 0')
        // Sem LIMIT: o universo de NFS e pequeno (~69 titulos) e `total`/
        // `totalDivergenciaCents` PRECISAM refletir TODAS as divergencias, nao uma
        // janela. O LIMIT 500 antigo, somado ao tipo errado (mercadoria incluida),
        // fazia a tela mostrar "500" (o proprio teto) como total de divergentes.
        // orderBy com leftJoinAndSelect cai no caminho "combined select" do TypeORM,
        // que resolve a coluna pela PROPERTY name (dataVencimento), nao pela coluna do
        // banco. Usar 'cp.data_vencimento' aqui quebra com "reading 'databaseName'".
        .orderBy('cp.dataVencimento', 'DESC')
        .getMany();

      const conferencias = cps.map((cp) => calcular(cp));
      const divergentes = conferencias.filter((c) => c.temDivergencia);
      const totalDivergencia = divergentes.reduce((s, c) => s + Math.abs(c.divergenciaTotalCents), 0);

      return {
        itens: divergentes,
        total: divergentes.length,
        totalDivergenciaCents: totalDivergencia,
      };
    },
  };
}

export type RetencoesService = ReturnType<typeof buildRetencoesService>;
