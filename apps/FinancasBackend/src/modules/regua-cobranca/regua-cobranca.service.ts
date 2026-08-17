import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import type {
  ReguaCanal,
  ReguaEnvio,
  ReguaEnviosListResponse,
  ReguaSimularResponse,
  ReguaTemplate,
  ReguaTemplateCreate,
  ReguaTemplateUpdate,
  ReguaTemplatesListResponse,
} from '@pioneira/shared';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { ReguaCobrancaTemplate, type ReguaTom } from '@/entities/regua-cobranca-template.entity.js';
import { ReguaCobrancaEnvio } from '@/entities/regua-cobranca-envio.entity.js';

function toTemplate(t: ReguaCobrancaTemplate): ReguaTemplate {
  return {
    id: t.id,
    nome: t.nome,
    canal: t.canal,
    gatilhoDiasVencimento: t.gatilhoDiasVencimento,
    assunto: t.assunto,
    corpoTemplate: t.corpoTemplate,
    ativo: t.ativo,
    tom: t.tom as ReguaTom,
    criadoEm: t.criadoEm.toISOString(),
    atualizadoEm: t.atualizadoEm.toISOString(),
  };
}

function moeda(cents: number | string): string {
  const v = typeof cents === 'string' ? Number(cents) : cents;
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderizar(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function diasEntre(d1: string, d2: Date): number {
  const t1 = new Date(`${d1}T00:00:00Z`).getTime();
  const t2 = new Date(d2.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((t2 - t1) / 86_400_000);
}

export function buildReguaCobrancaService(fastify: FastifyInstance) {
  const templateRepo = fastify.db.getRepository(ReguaCobrancaTemplate);
  const envioRepo = fastify.db.getRepository(ReguaCobrancaEnvio);
  const crRepo = fastify.db.getRepository(ContaReceber);

  return {
    async listarTemplates(): Promise<ReguaTemplatesListResponse> {
      const ts = await templateRepo.find({ order: { gatilhoDiasVencimento: 'ASC' } });
      return { itens: ts.map(toTemplate) };
    },

    async criarTemplate(body: ReguaTemplateCreate): Promise<ReguaTemplate> {
      const novo = templateRepo.create({
        nome: body.nome,
        canal: body.canal,
        gatilhoDiasVencimento: body.gatilhoDiasVencimento,
        assunto: body.assunto ?? null,
        corpoTemplate: body.corpoTemplate,
        ativo: body.ativo ?? true,
        tom: body.tom ?? 'cordial',
      });
      await templateRepo.save(novo);
      return toTemplate(novo);
    },

    async atualizarTemplate(id: string, body: ReguaTemplateUpdate): Promise<ReguaTemplate> {
      const t = await templateRepo.findOne({ where: { id } });
      if (!t) throw fastify.httpErrors.notFound('Template não encontrado');
      if (body.nome !== undefined) t.nome = body.nome;
      if (body.canal !== undefined) t.canal = body.canal;
      if (body.gatilhoDiasVencimento !== undefined) t.gatilhoDiasVencimento = body.gatilhoDiasVencimento;
      if (body.assunto !== undefined) t.assunto = body.assunto ?? null;
      if (body.corpoTemplate !== undefined) t.corpoTemplate = body.corpoTemplate;
      if (body.ativo !== undefined) t.ativo = body.ativo;
      if (body.tom !== undefined) t.tom = body.tom;
      await templateRepo.save(t);
      return toTemplate(t);
    },

    async listarEnvios(): Promise<ReguaEnviosListResponse> {
      const envios = await envioRepo
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.contaReceber', 'cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .leftJoinAndSelect('e.template', 't')
        // PROPERTY name no orderBy (não coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('e.enviadoEm', 'DESC')
        .limit(200)
        .getMany();

      const itens: ReguaEnvio[] = envios.map((e) => ({
        id: e.id,
        contaReceberId: e.contaReceberId,
        numeroDocumentoCr: e.contaReceber?.numeroDocumento ?? null,
        fornecedorClienteRazaoSocial: e.contaReceber?.cliente?.razaoSocial ?? null,
        templateId: e.templateId,
        templateNome: e.template?.nome ?? '?',
        canal: e.canal as ReguaCanal,
        destinatario: e.destinatario,
        assunto: e.assunto,
        corpoRendered: e.corpoRendered,
        modo: e.modo,
        status: e.status,
        mensagemErro: e.mensagemErro,
        enviadoEm: e.enviadoEm.toISOString(),
        diasVencidosNoEnvio: e.diasVencidosNoEnvio,
      }));

      return { itens, total: itens.length };
    },

    /**
     * Simula execução da régua HOJE — pra cada CR aberto, dispara templates
     * cujo gatilho bate com dias_vencidos. Idempotente: pula se já foi enviado
     * mesma combinação (cr, template, dia).
     *
     * MVP: modo='simulado'. Envio real (email/whatsapp) virá quando confirmarmos
     * provedor com o financeiro.
     */
    async simularExecucao(): Promise<ReguaSimularResponse> {
      const inicio = Date.now();
      const hoje = new Date();
      const diaIso = hoje.toISOString().slice(0, 10);

      const templates = await templateRepo.find({ where: { ativo: true } });
      const crs = await crRepo
        .createQueryBuilder('cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where("cr.status IN ('aberto','renegociado')")
        .andWhere('cr.excluido_em IS NULL')
        .limit(2000)
        .getMany();

      let gerados = 0;
      let pulados = 0;

      for (const cr of crs) {
        const dias = diasEntre(cr.dataVencimento, hoje);

        for (const t of templates) {
          if (t.gatilhoDiasVencimento !== dias) continue;

          // Verifica idempotência: já enviou esse template pra esse CR hoje?
          // Usa range de timestamp (em vez de DATE_TRUNC) pra aproveitar índice.
          const ja = await envioRepo
            .createQueryBuilder('e')
            .where('e.conta_receber_id = :crId', { crId: cr.id })
            .andWhere('e.template_id = :tId', { tId: t.id })
            .andWhere('e.enviado_em >= :diaIni::timestamptz', { diaIni: `${diaIso} 00:00:00` })
            .andWhere('e.enviado_em <  :diaFim::timestamptz', { diaFim: `${diaIso} 23:59:59.999` })
            .getCount();
          if (ja > 0) {
            pulados++;
            continue;
          }

          const vars: Record<string, string> = {
            nome_cliente: cr.cliente?.razaoSocial ?? 'Cliente',
            numero_documento: cr.numeroDocumento ?? '-',
            valor: moeda(cr.valorBrutoCents),
            data_vencimento: dataBr(cr.dataVencimento),
            dias_vencidos: String(dias),
            link_pix: '#',
            link_boleto: '#',
          };

          const corpoRendered = renderizar(t.corpoTemplate, vars);
          const assuntoRendered = t.assunto ? renderizar(t.assunto, vars) : null;

          const destinatario = cr.cliente?.email ?? `cliente-${cr.cliente?.codCli ?? 'sem-id'}@simulado.local`;

          const novoEnvio = envioRepo.create({
            contaReceberId: cr.id,
            templateId: t.id,
            canal: t.canal,
            destinatario,
            assunto: assuntoRendered,
            corpoRendered,
            modo: 'simulado',
            status: 'enviado',
            mensagemErro: null,
            diasVencidosNoEnvio: dias,
          });
          await envioRepo.save(novoEnvio);
          gerados++;
        }
      }

      return {
        diaReferencia: diaIso,
        modo: 'simulado',
        crsAnalisados: crs.length,
        templatesAtivos: templates.length,
        enviosGerados: gerados,
        enviosPulados: pulados,
        duracaoMs: Date.now() - inicio,
      };
    },
  };
}

export type ReguaCobrancaService = ReturnType<typeof buildReguaCobrancaService>;

void IsNull; // disponível pra usos futuros
