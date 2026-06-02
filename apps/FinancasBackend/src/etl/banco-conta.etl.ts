import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusBcocontaStage } from '@/entities/globus-bcoconta-stage.entity.js';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import type { RawBcoContaRow } from '@/integrations/globus/globus-bcoconta.adapter.js';
import { dataIsoSpOuNull } from '@/shared/utils/datetime.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/**
 * Contas operacionalmente principais da Pioneira.
 *
 * O Globus retorna 11+ contas no cadastro, mas a maior parte e historica /
 * descontinuada. Esta allowlist define quais aparecem em destaque no Fluxo
 * de Caixa. As demais ficam visiveis em "secundarias".
 *
 * Quando uma conta nova entrar em uso, atualizar aqui OU marcar via UI
 * (campo eh_principal e editavel — o ETL NAO sobrescreve a flag manualmente
 * setada).
 */
const CONTAS_PRINCIPAIS: ReadonlySet<string> = new Set([
  '70-40-037874',    // BRB Bilhetagem Eletronica
  '33-2032-13003306', // Santander
  '422-52-017582',   // Safra
  '102-1-18089216',  // XP Investimentos
  '756-5004-1029489', // Sicoob ASA SUL
  '1-3382-505258',   // Banco do Brasil
]);

function chaveConta(codBanco: number, codAgencia: number, codContaBco: string): string {
  return `${codBanco}-${codAgencia}-${String(codContaBco).trim()}`;
}

function brlToCents(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return Math.round(v * 100).toString();
}

function sn(v: string | null | undefined): boolean {
  return String(v ?? '').toUpperCase() === 'S';
}

export interface BancoContaEtlResult {
  processados: number;
  gravados: number;
  principaisMarcadas: number;
  comErro: number;
  duracaoMs: number;
}

export function buildBancoContaEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusBcocontaStage);
  const contaRepo = fastify.db.getRepository(BancoConta);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<BancoContaEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'banco_conta' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 200,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:banco-conta] processando ${pendentes.length} contas`);

      let gravados = 0;
      let principaisMarcadas = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          const raw = stage.rawPayload as unknown as RawBcoContaRow;
          const codContaBco = String(raw.COD_CONTA_BCO).trim();
          const chave = chaveConta(raw.COD_BANCO, raw.COD_AGENCIA, codContaBco);
          const ehPrincipalAutomatico = CONTAS_PRINCIPAIS.has(chave);
          if (ehPrincipalAutomatico) principaisMarcadas += 1;

          const origemIdExterno = chave;

          // INSERT-ou-UPDATE preservando campos editaveis pelo usuario.
          // Campos NUNCA sobrescritos pelo ETL apos primeira insercao:
          //   - saldo_acm_cents, data_saldo_acm, saldo_acm_atualizado_*
          //     (preenchidos manualmente pelo tesoureiro)
          //   - nome_amigavel (editavel pelo usuario)
          //   - eh_principal (so seta no insert; updates manuais nao sao revertidos)
          await contaRepo.query(
            `INSERT INTO finance.banco_conta (
               empresa_id, codigo_fl,
               cod_banco, cod_agencia, cod_conta_bco, digito,
               nome_conta_bco,
               conta_caixa, eh_principal,
               saldo_inicial_globus_cents, saldo_acm_globus_cents, data_saldo_acm_globus, dt_limite_movto_globus,
               limite_credito_cents, chave_pix, tipo_chave_pix, cod_conta_ctb, cod_custo,
               origem_sistema, origem_id_externo, ultimo_sync_em
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               'globus', $19, NOW()
             )
             ON CONFLICT (origem_sistema, origem_id_externo)
             DO UPDATE SET
               -- Dados Globus: sempre atualiza
               empresa_id = EXCLUDED.empresa_id,
               codigo_fl = EXCLUDED.codigo_fl,
               digito = EXCLUDED.digito,
               nome_conta_bco = EXCLUDED.nome_conta_bco,
               conta_caixa = EXCLUDED.conta_caixa,
               saldo_inicial_globus_cents = EXCLUDED.saldo_inicial_globus_cents,
               saldo_acm_globus_cents = EXCLUDED.saldo_acm_globus_cents,
               data_saldo_acm_globus = EXCLUDED.data_saldo_acm_globus,
               dt_limite_movto_globus = EXCLUDED.dt_limite_movto_globus,
               limite_credito_cents = EXCLUDED.limite_credito_cents,
               chave_pix = EXCLUDED.chave_pix,
               tipo_chave_pix = EXCLUDED.tipo_chave_pix,
               cod_conta_ctb = EXCLUDED.cod_conta_ctb,
               cod_custo = EXCLUDED.cod_custo,
               ultimo_sync_em = NOW(),
               atualizado_em = NOW()
               -- NAO sobrescreve: nome_amigavel, eh_principal, saldo_acm_cents,
               -- data_saldo_acm, saldo_acm_atualizado_*`,
            [
              raw.CODIGO_EMPRESA,
              raw.CODIGO_FL,
              raw.COD_BANCO,
              raw.COD_AGENCIA,
              codContaBco,
              raw.DIGITO,
              String(raw.NOME_CONTA_BCO ?? '').trim().slice(0, 80),
              sn(raw.CONTA_CAIXA),
              ehPrincipalAutomatico,
              brlToCents(raw.SALDO_INICIAL),
              brlToCents(raw.SALDO_ACM_ATE_DATA),
              dataIsoSpOuNull(raw.DATA_SALDO_ACM),
              dataIsoSpOuNull(raw.DT_LIMITE_MOVTO),
              brlToCents(raw.LIMITE_CREDITO),
              raw.CHAVE_PIX,
              raw.TIPO_CHAVE_PIX,
              raw.COD_CONTA_CTB,
              raw.COD_CUSTO,
              origemIdExterno,
            ],
          );

          stage.processadoEm = new Date();
          await stageRepo.save(stage);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: stage.id }, '[etl:banco-conta] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'banco_conta',
            fase: 'etl_processamento',
            chaveNatural: {
              cod_banco: stage.codBanco,
              cod_agencia: stage.codAgencia,
              cod_conta_bco: stage.codContaBco,
            },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, principaisMarcadas, comErro, duracaoMs },
        `[etl:banco-conta] concluido em ${duracaoMs}ms (${gravados} gravadas, ${principaisMarcadas} principais)`,
      );
      return { processados: pendentes.length, gravados, principaisMarcadas, comErro, duracaoMs };
    },
  };
}

export type BancoContaEtl = ReturnType<typeof buildBancoContaEtl>;
