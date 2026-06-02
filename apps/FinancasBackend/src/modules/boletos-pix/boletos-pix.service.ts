import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  BoletoEmitidoResponse,
  BoletosListResponse,
  CrElegivelBoleto,
  ElegiveisBoletosResponse,
  EmitirBoletoBody,
  EmitirPixBody,
} from '@pioneira/shared';
import { BANCOS_CNAB } from '@pioneira/shared';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { BoletoEmitido, type BoletoTipo, type BoletoStatus, type BoletoModo } from '@/entities/boleto-emitido.entity.js';

const EMPRESA_CNPJ = '03461407000175';

function toResponse(b: BoletoEmitido): BoletoEmitidoResponse {
  return {
    id: b.id,
    contaReceberId: b.contaReceberId,
    tipo: b.tipo as BoletoTipo,
    bancoCodigo: b.bancoCodigo,
    bancoNome: b.bancoNome,
    nossoNumero: b.nossoNumero,
    linhaDigitavel: b.linhaDigitavel,
    codigoBarras: b.codigoBarras,
    qrCodePix: b.qrCodePix,
    txidPix: b.txidPix,
    vencimento: b.vencimento,
    valorCents: Number(b.valorCents),
    status: b.status as BoletoStatus,
    modo: b.modo as BoletoModo,
    emitidoEm: b.emitidoEm.toISOString(),
    pagoEm: b.pagoEm ? b.pagoEm.toISOString() : null,
    observacao: b.observacao,
  };
}

/**
 * Gera linha digitavel MOCK no formato 47 digitos (sem checksum real).
 * Formato visual: 99999.99999 99999.999999 99999.999999 9 99999999999999
 */
function gerarLinhaDigitavelMock(bancoCodigo: string, valorCents: number, vencimento: string): string {
  const seq = crypto.randomBytes(4).readUInt32BE(0).toString().padStart(10, '0');
  const dataParts = vencimento.split('-');
  const fatorVenc = dataParts.join('').slice(2);
  const valor = String(valorCents).padStart(10, '0');
  return `${bancoCodigo}9${seq.slice(0, 5)}.${seq.slice(5)} 12345.678901 23456.789012 1 ${fatorVenc}${valor.slice(0, 6)}`;
}

function gerarCodigoBarrasMock(bancoCodigo: string, valorCents: number): string {
  const seq = crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 25);
  const valor = String(valorCents).padStart(10, '0');
  return `${bancoCodigo}9${valor}${seq}`.slice(0, 44);
}

/**
 * Gera QR Code PIX (string EMV BR Code simplificada). Apenas demonstrativo —
 * a string nao gera QR escaneavel real, mas tem o formato esperado.
 */
function gerarQrPixMock(valorCents: number, cnpj: string, descricao: string): { qr: string; txid: string } {
  const txid = crypto.randomBytes(13).toString('hex').toUpperCase();
  const valor = (valorCents / 100).toFixed(2);
  const qr = [
    '000201',
    '26' + String(`PIX${cnpj}`.length + 8).padStart(2, '0') + `0014BR.GOV.BCB.PIX${cnpj}`,
    '52040000',
    '5303986',
    '54' + String(valor.length).padStart(2, '0') + valor,
    '5802BR',
    '5915VIACAOPIONEIRA',
    '6008BRASILIA',
    '62' + String(txid.length + 4).padStart(2, '0') + '05' + String(txid.length).padStart(2, '0') + txid,
    '6304MOCK',
  ].join('');
  return { qr, txid };
}

function bancoNome(codigo: string): string {
  return BANCOS_CNAB.find((b) => b.codigo === codigo)?.nome ?? `Banco ${codigo}`;
}

export function buildBoletosPixService(fastify: FastifyInstance) {
  const crRepo = fastify.db.getRepository(ContaReceber);
  const boletoRepo = fastify.db.getRepository(BoletoEmitido);

  return {
    async listarElegiveis(): Promise<ElegiveisBoletosResponse> {
      const crs = await crRepo
        .createQueryBuilder('cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where("cr.status IN ('aberto','renegociado')")
        .andWhere('cr.excluido_em IS NULL')
        // PROPERTY name no orderBy (nao coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('cr.dataVencimento', 'ASC')
        .limit(500)
        .getMany();

      const boletosExistentes = await boletoRepo
        .createQueryBuilder('b')
        .select(['b.conta_receber_id AS cr_id', 'b.tipo AS tipo'])
        .where("b.status IN ('emitido','registrado','pago')")
        .getRawMany<{ cr_id: string; tipo: string }>();

      const temBoleto = new Set(boletosExistentes.filter((b) => b.tipo === 'boleto').map((b) => b.cr_id));
      const temPix = new Set(boletosExistentes.filter((b) => b.tipo === 'pix').map((b) => b.cr_id));

      const itens: CrElegivelBoleto[] = crs.map((cr) => ({
        contaReceberId: cr.id,
        numeroDocumento: cr.numeroDocumento,
        dataVencimento: cr.dataVencimento,
        valorCents: Number(cr.valorBrutoCents),
        cliente: cr.cliente
          ? {
              razaoSocial: cr.cliente.razaoSocial,
              cnpjCpf: cr.cliente.numeroInscricao,
            }
          : null,
        jaTemBoleto: temBoleto.has(cr.id),
        jaTemPix: temPix.has(cr.id),
      }));

      return { itens };
    },

    async listarDoCr(crId: string): Promise<BoletosListResponse> {
      const boletos = await boletoRepo.find({
        where: { contaReceberId: crId },
        order: { emitidoEm: 'DESC' },
      });
      return { itens: boletos.map(toResponse) };
    },

    async listarUltimos(): Promise<BoletosListResponse> {
      const boletos = await boletoRepo.find({
        order: { emitidoEm: 'DESC' },
        take: 50,
      });
      return { itens: boletos.map(toResponse) };
    },

    async emitirBoleto(args: { body: EmitirBoletoBody; usuarioId: string }): Promise<BoletoEmitidoResponse> {
      const banco = BANCOS_CNAB.find((b) => b.codigo === args.body.bancoCodigo);
      if (!banco) throw fastify.httpErrors.badRequest(`Banco ${args.body.bancoCodigo} nao suportado`);

      const cr = await crRepo.findOne({ where: { id: args.body.contaReceberId } });
      if (!cr) throw fastify.httpErrors.notFound('CR nao encontrado');
      if (cr.excluidoEm || cr.status === 'cancelado') {
        throw fastify.httpErrors.conflict('CR excluido/cancelado nao pode receber boleto');
      }

      const valorCents = Number(cr.valorBrutoCents);
      const nossoNumero = `${Date.now()}`.slice(-15);
      const linhaDigitavel = gerarLinhaDigitavelMock(banco.codigo, valorCents, cr.dataVencimento);
      const codigoBarras = gerarCodigoBarrasMock(banco.codigo, valorCents);

      const novo = boletoRepo.create({
        contaReceberId: cr.id,
        tipo: 'boleto',
        bancoCodigo: banco.codigo,
        bancoNome: banco.nome,
        nossoNumero,
        linhaDigitavel,
        codigoBarras,
        qrCodePix: null,
        txidPix: null,
        vencimento: cr.dataVencimento,
        valorCents: String(valorCents),
        status: 'emitido',
        modo: 'mock',
        emitidoPorId: args.usuarioId,
        observacao: 'Boleto gerado em modo MOCK — sem integracao real com banco.',
      });
      await boletoRepo.save(novo);
      fastify.log.info({ boletoId: novo.id, crId: cr.id, banco: banco.codigo }, '[boletos-pix] boleto MOCK emitido');
      return toResponse(novo);
    },

    async emitirPix(args: { body: EmitirPixBody; usuarioId: string }): Promise<BoletoEmitidoResponse> {
      const cr = await crRepo.findOne({ where: { id: args.body.contaReceberId } });
      if (!cr) throw fastify.httpErrors.notFound('CR nao encontrado');
      if (cr.excluidoEm || cr.status === 'cancelado') {
        throw fastify.httpErrors.conflict('CR excluido/cancelado nao pode receber PIX');
      }

      const valorCents = Number(cr.valorBrutoCents);
      const { qr, txid } = gerarQrPixMock(valorCents, EMPRESA_CNPJ, `CR ${cr.numeroDocumento ?? cr.id.slice(0, 8)}`);

      const novo = boletoRepo.create({
        contaReceberId: cr.id,
        tipo: 'pix',
        bancoCodigo: null,
        bancoNome: null,
        nossoNumero: null,
        linhaDigitavel: null,
        codigoBarras: null,
        qrCodePix: qr,
        txidPix: txid,
        vencimento: cr.dataVencimento,
        valorCents: String(valorCents),
        status: 'emitido',
        modo: 'mock',
        emitidoPorId: args.usuarioId,
        observacao: 'PIX gerado em modo MOCK — string EMV nao escaneavel.',
      });
      await boletoRepo.save(novo);
      fastify.log.info({ pixId: novo.id, crId: cr.id }, '[boletos-pix] PIX MOCK emitido');
      return toResponse(novo);
    },
  };
}

export type BoletosPixService = ReturnType<typeof buildBoletosPixService>;
