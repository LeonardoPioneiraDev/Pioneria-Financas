import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type {
  CandidatoNegativacao,
  CandidatosResponse,
  ConsultarSerasaBody,
  ConsultasListResponse,
  NegativacoesListResponse,
  NegativarBody,
  SerasaConsultaResponse,
  SerasaNegativacaoResponse,
} from '@pioneira/shared';
import { Cliente } from '@/entities/cliente.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { SerasaConsulta } from '@/entities/serasa-consulta.entity.js';
import { SerasaNegativacao, type SerasaNegativacaoStatus } from '@/entities/serasa-negativacao.entity.js';

/** Score MOCK determinístico por CNPJ (mesma resposta sempre — bom pra demo). */
function scoreMock(cnpj: string | null | undefined): number {
  if (!cnpj) return 0;
  const hash = crypto.createHash('sha256').update(cnpj).digest();
  return 300 + (hash.readUInt16BE(0) % 700);
}

function classificacao(score: number | null): 'baixo_risco' | 'medio_risco' | 'alto_risco' | 'sem_dados' {
  if (!score) return 'sem_dados';
  if (score >= 700) return 'baixo_risco';
  if (score >= 500) return 'medio_risco';
  return 'alto_risco';
}

function restricaoMock(cnpj: string | null | undefined): { tem: boolean; qtd: number; valorCents: number } {
  if (!cnpj) return { tem: false, qtd: 0, valorCents: 0 };
  const hash = crypto.createHash('sha256').update(cnpj).digest();
  const tem = hash[0]! < 60; // ~24% dos clientes "tem restrição" — convincente pra demo
  if (!tem) return { tem: false, qtd: 0, valorCents: 0 };
  const qtd = (hash[1]! % 4) + 1;
  const valor = (hash.readUInt32BE(2) % 50_000_00) + 100_00;
  return { tem: true, qtd, valorCents: valor };
}

function toConsulta(c: SerasaConsulta): SerasaConsultaResponse {
  return {
    id: c.id,
    clienteId: c.clienteId,
    clienteRazaoSocial: c.cliente?.razaoSocial ?? null,
    cnpjCpf: c.cnpjCpf,
    score: c.score,
    classificacao: classificacao(c.score),
    temRestricao: c.temRestricao,
    qtdRestricoes: c.qtdRestricoes,
    valorRestricoesCents: Number(c.valorRestricoesCents),
    observacao: c.observacao,
    modo: c.modo,
    consultadoEm: c.consultadoEm.toISOString(),
  };
}

function toNegativacao(n: SerasaNegativacao): SerasaNegativacaoResponse {
  return {
    id: n.id,
    contaReceberId: n.contaReceberId,
    numeroDocumentoCr: n.contaReceber?.numeroDocumento ?? null,
    clienteId: n.clienteId,
    clienteRazaoSocial: n.cliente?.razaoSocial ?? null,
    protocoloSerasa: n.protocoloSerasa,
    motivo: n.motivo,
    valorCents: Number(n.valorCents),
    status: n.status as SerasaNegativacaoStatus,
    modo: n.modo,
    enviadoEm: n.enviadoEm.toISOString(),
    efetivadoEm: n.efetivadoEm ? n.efetivadoEm.toISOString() : null,
    baixadoEm: n.baixadoEm ? n.baixadoEm.toISOString() : null,
    observacao: n.observacao,
  };
}

const DIAS_CANDIDATO_MIN = 30;

export function buildSerasaService(fastify: FastifyInstance) {
  const clienteRepo = fastify.db.getRepository(Cliente);
  const crRepo = fastify.db.getRepository(ContaReceber);
  const consultaRepo = fastify.db.getRepository(SerasaConsulta);
  const negativacaoRepo = fastify.db.getRepository(SerasaNegativacao);

  return {
    async consultar(args: { body: ConsultarSerasaBody; usuarioId: string }): Promise<SerasaConsultaResponse> {
      const cliente = await clienteRepo.findOne({ where: { id: args.body.clienteId } });
      if (!cliente) throw fastify.httpErrors.notFound('Cliente não encontrado');

      const score = scoreMock(cliente.numeroInscricao);
      const r = restricaoMock(cliente.numeroInscricao);

      const consulta = consultaRepo.create({
        clienteId: cliente.id,
        cnpjCpf: cliente.numeroInscricao,
        score,
        temRestricao: r.tem,
        qtdRestricoes: r.qtd,
        valorRestricoesCents: String(r.valorCents),
        observacao: r.tem
          ? `Cliente com ${r.qtd} restrição(ões) totalizando R$ ${(r.valorCents / 100).toFixed(2)}`
          : 'Cliente sem restrições',
        modo: 'mock',
        consultadoPorId: args.usuarioId,
      });
      await consultaRepo.save(consulta);
      consulta.cliente = cliente;
      return toConsulta(consulta);
    },

    async listarConsultas(): Promise<ConsultasListResponse> {
      const cs = await consultaRepo.find({
        order: { consultadoEm: 'DESC' },
        relations: ['cliente'],
        take: 50,
      });
      return { itens: cs.map(toConsulta) };
    },

    async negativar(args: { body: NegativarBody; usuarioId: string }): Promise<SerasaNegativacaoResponse> {
      const cr = await crRepo.findOne({
        where: { id: args.body.contaReceberId },
        relations: ['cliente'],
      });
      if (!cr) throw fastify.httpErrors.notFound('CR não encontrado');
      if (cr.excluidoEm || cr.status === 'cancelado' || cr.status === 'pago') {
        throw fastify.httpErrors.conflict('CR cancelado/pago/excluído não pode ser negativado');
      }

      // Verifica idempotência: já foi negativado?
      const ja = await negativacaoRepo.findOne({
        where: { contaReceberId: cr.id, status: 'enviado' },
      });
      if (ja) {
        throw fastify.httpErrors.conflict('CR já tem negativação ativa');
      }

      const protocolo = `SERASA-MOCK-${Date.now()}`;

      const nova = negativacaoRepo.create({
        contaReceberId: cr.id,
        clienteId: cr.cliente?.id ?? null,
        protocoloSerasa: protocolo,
        motivo: args.body.motivo,
        valorCents: cr.valorBrutoCents,
        status: 'enviado',
        modo: 'mock',
        enviadoPorId: args.usuarioId,
        observacao: 'Negativação em modo MOCK — nenhuma chamada feita a SERASA real.',
      });
      await negativacaoRepo.save(nova);
      nova.contaReceber = cr;
      if (cr.cliente) nova.cliente = cr.cliente;
      fastify.log.info({ negId: nova.id, crId: cr.id, protocolo }, '[serasa] negativação MOCK criada');
      return toNegativacao(nova);
    },

    async baixar(negativacaoId: string): Promise<SerasaNegativacaoResponse> {
      const n = await negativacaoRepo.findOne({
        where: { id: negativacaoId },
        relations: ['contaReceber', 'cliente'],
      });
      if (!n) throw fastify.httpErrors.notFound('Negativação não encontrada');
      if (n.status === 'baixado') {
        throw fastify.httpErrors.conflict('Negativação já foi baixada');
      }
      n.status = 'baixado';
      n.baixadoEm = new Date();
      await negativacaoRepo.save(n);
      return toNegativacao(n);
    },

    async listarNegativacoes(): Promise<NegativacoesListResponse> {
      const ns = await negativacaoRepo.find({
        order: { enviadoEm: 'DESC' },
        relations: ['contaReceber', 'cliente'],
        take: 100,
      });
      return { itens: ns.map(toNegativacao), total: ns.length };
    },

    async listarCandidatos(): Promise<CandidatosResponse> {
      const hoje = new Date();
      const dataLimite = new Date(hoje);
      dataLimite.setDate(dataLimite.getDate() - DIAS_CANDIDATO_MIN);
      const dataLimiteIso = dataLimite.toISOString().slice(0, 10);

      // CRs vencidos há pelo menos 30 dias, status aberto/renegociado, sem negativação ativa
      const crs = await crRepo
        .createQueryBuilder('cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where("cr.status IN ('aberto','renegociado')")
        .andWhere('cr.excluido_em IS NULL')
        .andWhere('cr.data_vencimento <= :limite', { limite: dataLimiteIso })
        // PROPERTY name no orderBy (não coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('cr.dataVencimento', 'ASC')
        .limit(200)
        .getMany();

      const jaNegativados = await negativacaoRepo
        .createQueryBuilder('n')
        .select('DISTINCT n.conta_receber_id', 'cr_id')
        .where("n.status IN ('enviado','efetivado')")
        .getRawMany<{ cr_id: string }>();
      const idsNegativados = new Set(jaNegativados.map((r) => r.cr_id));

      const itens: CandidatoNegativacao[] = crs
        .filter((cr) => !idsNegativados.has(cr.id))
        .map((cr) => {
          const venc = new Date(`${cr.dataVencimento}T00:00:00Z`);
          const hojeUtc = new Date(hoje.toISOString().slice(0, 10) + 'T00:00:00Z');
          const dias = Math.round((hojeUtc.getTime() - venc.getTime()) / 86_400_000);
          return {
            contaReceberId: cr.id,
            numeroDocumento: cr.numeroDocumento,
            dataVencimento: cr.dataVencimento,
            valorCents: Number(cr.valorBrutoCents),
            diasVencidos: dias,
            cliente: cr.cliente
              ? {
                  id: cr.cliente.id,
                  razaoSocial: cr.cliente.razaoSocial,
                  cnpjCpf: cr.cliente.numeroInscricao,
                }
              : null,
          };
        });

      return { itens };
    },
  };
}

export type SerasaService = ReturnType<typeof buildSerasaService>;
