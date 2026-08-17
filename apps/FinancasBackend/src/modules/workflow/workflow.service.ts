import type { FastifyInstance } from 'fastify';
import { In } from 'typeorm';
import type {
  WorkflowAtribuir,
  WorkflowAvancar,
  WorkflowCancelar,
  WorkflowComentar,
  WorkflowCreateInstance,
  WorkflowEventoResponse,
  WorkflowInstanceResponse,
  WorkflowTemplateCreate,
  WorkflowTemplateResponse,
  WorkflowTemplateUpdate,
  WorkflowTimelineResponse,
  WorkflowVoltar,
} from '@pioneira/shared';
import { WorkflowTemplate } from '@/entities/workflow-template.entity.js';
import { WorkflowInstance } from '@/entities/workflow-instance.entity.js';
import { WorkflowEvento } from '@/entities/workflow-evento.entity.js';
import { User } from '@/entities/user.entity.js';

interface ActorContext {
  usuarioId: string | null;
  role: string;
}

function templateToResponse(t: WorkflowTemplate): WorkflowTemplateResponse {
  return {
    id: t.id,
    nome: t.nome,
    documentoTipo: t.documentoTipo,
    descricao: t.descricao,
    ativo: t.ativo,
    etapas: t.etapas,
    criadoEm: t.criadoEm.toISOString(),
    atualizadoEm: t.atualizadoEm.toISOString(),
  };
}

function instanceToResponse(i: WorkflowInstance): WorkflowInstanceResponse {
  return {
    id: i.id,
    templateId: i.templateId,
    documentoTipo: i.documentoTipo,
    documentoId: i.documentoId,
    etapaAtual: i.etapaAtual,
    etapaAtualIdx: i.etapaAtualIdx,
    status: i.status,
    criadoPor: i.criadoPor,
    responsavelId: i.responsavelId,
    criadoEm: i.criadoEm.toISOString(),
    concluidoEm: i.concluidoEm ? i.concluidoEm.toISOString() : null,
    atualizadoEm: i.atualizadoEm.toISOString(),
  };
}

function eventoToResponse(
  e: WorkflowEvento,
  userMap: Map<string, { id: string; nomeCompleto: string; email: string }>,
): WorkflowEventoResponse {
  const u = e.usuarioId ? userMap.get(e.usuarioId) : null;
  return {
    id: String(e.id),
    etapaChave: e.etapaChave,
    etapaIdx: e.etapaIdx,
    acao: e.acao,
    usuario: u ? { id: u.id, nome: u.nomeCompleto, email: u.email } : null,
    comentario: e.comentario,
    anexoUrl: e.anexoUrl,
    anexoNome: e.anexoNome,
    paraEtapa: e.paraEtapa,
    paraUsuarioId: e.paraUsuarioId,
    meta: e.meta,
    criadoEm: e.criadoEm.toISOString(),
  };
}

export function buildWorkflowService(fastify: FastifyInstance) {
  const templateRepo = fastify.db.getRepository(WorkflowTemplate);
  const instanceRepo = fastify.db.getRepository(WorkflowInstance);
  const eventoRepo = fastify.db.getRepository(WorkflowEvento);
  const userRepo = fastify.db.getRepository(User);

  async function carregarTemplateOuFalhar(id: string): Promise<WorkflowTemplate> {
    const t = await templateRepo.findOne({ where: { id } });
    if (!t) throw fastify.httpErrors.notFound('Template de workflow não encontrado');
    if (!t.ativo) throw fastify.httpErrors.conflict('Template inativo');
    if (!Array.isArray(t.etapas) || t.etapas.length === 0) {
      throw fastify.httpErrors.unprocessableEntity('Template sem etapas');
    }
    return t;
  }

  async function carregarInstanceOuFalhar(id: string): Promise<{ instance: WorkflowInstance; template: WorkflowTemplate }> {
    const instance = await instanceRepo.findOne({ where: { id } });
    if (!instance) throw fastify.httpErrors.notFound('Workflow não encontrado');
    const template = await templateRepo.findOne({ where: { id: instance.templateId } });
    if (!template) throw fastify.httpErrors.notFound('Template do workflow não encontrado');
    return { instance, template };
  }

  async function registrarEvento(payload: {
    instanceId: string;
    etapaChave: string;
    etapaIdx: number;
    acao: WorkflowEvento['acao'];
    actor: ActorContext;
    comentario?: string | null;
    anexoUrl?: string | null;
    anexoNome?: string | null;
    paraEtapa?: string | null;
    paraUsuarioId?: string | null;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    const evento = eventoRepo.create({
      instanceId: payload.instanceId,
      etapaChave: payload.etapaChave,
      etapaIdx: payload.etapaIdx,
      acao: payload.acao,
      usuarioId: payload.actor.usuarioId,
      comentario: payload.comentario ?? null,
      anexoUrl: payload.anexoUrl ?? null,
      anexoNome: payload.anexoNome ?? null,
      paraEtapa: payload.paraEtapa ?? null,
      paraUsuarioId: payload.paraUsuarioId ?? null,
      meta: payload.meta ?? null,
    });
    await eventoRepo.save(evento);
  }

  return {
    // ============================ TEMPLATES ============================
    async listarTemplates(filtros: { documentoTipo?: string; ativo?: boolean }): Promise<WorkflowTemplateResponse[]> {
      const where: Record<string, unknown> = {};
      if (filtros.documentoTipo) where.documentoTipo = filtros.documentoTipo;
      if (typeof filtros.ativo === 'boolean') where.ativo = filtros.ativo;
      const rows = await templateRepo.find({ where, order: { documentoTipo: 'ASC', nome: 'ASC' } });
      return rows.map(templateToResponse);
    },

    async obterTemplate(id: string): Promise<WorkflowTemplateResponse> {
      const t = await templateRepo.findOne({ where: { id } });
      if (!t) throw fastify.httpErrors.notFound('Template não encontrado');
      return templateToResponse(t);
    },

    async criarTemplate(payload: WorkflowTemplateCreate): Promise<WorkflowTemplateResponse> {
      const dup = await templateRepo.findOne({
        where: { nome: payload.nome, documentoTipo: payload.documentoTipo },
      });
      if (dup) throw fastify.httpErrors.conflict('Já existe template com este nome para este tipo de documento');

      this.validarEtapas(payload.etapas);
      const t = templateRepo.create({
        nome: payload.nome,
        documentoTipo: payload.documentoTipo,
        descricao: payload.descricao ?? null,
        ativo: payload.ativo ?? true,
        etapas: payload.etapas,
      });
      await templateRepo.save(t);
      return templateToResponse(t);
    },

    async atualizarTemplate(id: string, payload: WorkflowTemplateUpdate): Promise<WorkflowTemplateResponse> {
      const t = await templateRepo.findOne({ where: { id } });
      if (!t) throw fastify.httpErrors.notFound('Template não encontrado');
      if (payload.nome !== undefined) t.nome = payload.nome;
      if (payload.documentoTipo !== undefined) t.documentoTipo = payload.documentoTipo;
      if (payload.descricao !== undefined) t.descricao = payload.descricao ?? null;
      if (payload.ativo !== undefined) t.ativo = payload.ativo;
      if (payload.etapas !== undefined) {
        this.validarEtapas(payload.etapas);
        t.etapas = payload.etapas;
      }
      await templateRepo.save(t);
      return templateToResponse(t);
    },

    validarEtapas(etapas: WorkflowTemplateCreate['etapas']): void {
      const chaves = new Set<string>();
      for (const e of etapas) {
        if (chaves.has(e.chave)) {
          throw fastify.httpErrors.unprocessableEntity(`Etapa duplicada: ${e.chave}`);
        }
        chaves.add(e.chave);
      }
    },

    // ============================ INSTANCES ============================
    async criarInstance(payload: WorkflowCreateInstance, actor: ActorContext): Promise<WorkflowInstanceResponse> {
      const template = await carregarTemplateOuFalhar(payload.templateId);
      if (template.documentoTipo !== payload.documentoTipo) {
        throw fastify.httpErrors.unprocessableEntity('Template não corresponde ao tipo de documento');
      }

      const existente = await instanceRepo.findOne({
        where: { documentoTipo: payload.documentoTipo, documentoId: payload.documentoId },
      });
      if (existente) throw fastify.httpErrors.conflict('Já existe workflow para este documento');

      const primeira = template.etapas[0];
      if (!primeira) throw fastify.httpErrors.unprocessableEntity('Template sem etapas');
      const instance = instanceRepo.create({
        templateId: template.id,
        documentoTipo: payload.documentoTipo,
        documentoId: payload.documentoId,
        etapaAtual: primeira.chave,
        etapaAtualIdx: 0,
        status: 'em_andamento',
        criadoPor: actor.usuarioId,
        responsavelId: payload.responsavelId ?? actor.usuarioId,
      });
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: primeira.chave,
        etapaIdx: 0,
        acao: 'criou',
        actor,
        comentario: payload.comentario ?? null,
      });

      return instanceToResponse(instance);
    },

    async obterPorDocumento(
      documentoTipo: string,
      documentoId: string,
    ): Promise<WorkflowTimelineResponse | null> {
      const instance = await instanceRepo.findOne({ where: { documentoTipo, documentoId } });
      if (!instance) return null;
      return this.obterTimeline(instance.id);
    },

    async obterTimeline(instanceId: string): Promise<WorkflowTimelineResponse> {
      const { instance, template } = await carregarInstanceOuFalhar(instanceId);
      const eventos = await eventoRepo.find({
        where: { instanceId: instance.id },
        order: { criadoEm: 'ASC', id: 'ASC' },
      });

      const userIds = Array.from(
        new Set(
          eventos
            .map((e) => e.usuarioId)
            .filter((v): v is string => Boolean(v)),
        ),
      );
      const users = userIds.length > 0 ? await userRepo.find({ where: { id: In(userIds) } }) : [];
      const userMap = new Map(users.map((u) => [u.id, { id: u.id, nomeCompleto: u.nomeCompleto, email: u.email }]));

      return {
        instance: instanceToResponse(instance),
        template: templateToResponse(template),
        eventos: eventos.map((e) => eventoToResponse(e, userMap)),
      };
    },

    async avancarEtapa(
      instanceId: string,
      payload: WorkflowAvancar,
      actor: ActorContext,
    ): Promise<WorkflowInstanceResponse> {
      const { instance, template } = await carregarInstanceOuFalhar(instanceId);
      if (instance.status !== 'em_andamento') {
        throw fastify.httpErrors.conflict('Workflow não está em andamento');
      }
      const etapaAtual = template.etapas[instance.etapaAtualIdx];
      if (!etapaAtual) throw fastify.httpErrors.unprocessableEntity('Etapa atual inválida');

      if (etapaAtual.exigeComentario && !payload.comentario) {
        throw fastify.httpErrors.unprocessableEntity(`Etapa "${etapaAtual.nome}" exige comentário`);
      }
      if (etapaAtual.exigeAnexo && !payload.anexoUrl) {
        throw fastify.httpErrors.unprocessableEntity(`Etapa "${etapaAtual.nome}" exige anexo`);
      }
      if (etapaAtual.papelResponsavel && actor.role !== 'admin' && actor.role !== etapaAtual.papelResponsavel) {
        throw fastify.httpErrors.forbidden(
          `Apenas o papel "${etapaAtual.papelResponsavel}" pode avançar esta etapa`,
        );
      }

      const proximoIdx = instance.etapaAtualIdx + 1;
      const ehUltima = proximoIdx >= template.etapas.length;

      if (ehUltima) {
        instance.status = 'concluido';
        instance.concluidoEm = new Date();
        await instanceRepo.save(instance);

        await registrarEvento({
          instanceId: instance.id,
          etapaChave: etapaAtual.chave,
          etapaIdx: instance.etapaAtualIdx,
          acao: 'aprovou',
          actor,
          comentario: payload.comentario ?? null,
          anexoUrl: payload.anexoUrl ?? null,
          anexoNome: payload.anexoNome ?? null,
        });
        return instanceToResponse(instance);
      }

      const proxima = template.etapas[proximoIdx];
      if (!proxima) throw fastify.httpErrors.unprocessableEntity('Próxima etapa inválida');
      instance.etapaAtual = proxima.chave;
      instance.etapaAtualIdx = proximoIdx;
      if (payload.proximoResponsavelId !== undefined) {
        instance.responsavelId = payload.proximoResponsavelId;
      }
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: etapaAtual.chave,
        etapaIdx: instance.etapaAtualIdx - 1,
        acao: 'avancou',
        actor,
        comentario: payload.comentario ?? null,
        anexoUrl: payload.anexoUrl ?? null,
        anexoNome: payload.anexoNome ?? null,
        paraEtapa: proxima.chave,
        paraUsuarioId: payload.proximoResponsavelId ?? null,
      });

      return instanceToResponse(instance);
    },

    async voltarEtapa(
      instanceId: string,
      payload: WorkflowVoltar,
      actor: ActorContext,
    ): Promise<WorkflowInstanceResponse> {
      const { instance, template } = await carregarInstanceOuFalhar(instanceId);
      if (instance.status !== 'em_andamento') {
        throw fastify.httpErrors.conflict('Workflow não está em andamento');
      }
      if (instance.etapaAtualIdx <= 0) {
        throw fastify.httpErrors.conflict('Já está na primeira etapa');
      }

      let novoIdx = instance.etapaAtualIdx - 1;
      if (payload.paraEtapa) {
        const idx = template.etapas.findIndex((e) => e.chave === payload.paraEtapa);
        if (idx < 0) throw fastify.httpErrors.unprocessableEntity('Etapa de destino não existe no template');
        if (idx >= instance.etapaAtualIdx) {
          throw fastify.httpErrors.unprocessableEntity('Etapa de destino deve ser anterior à atual');
        }
        novoIdx = idx;
      }

      const etapaOrigem = template.etapas[instance.etapaAtualIdx];
      const etapaDestino = template.etapas[novoIdx];
      if (!etapaOrigem || !etapaDestino) {
        throw fastify.httpErrors.unprocessableEntity('Índice de etapa inválido');
      }

      instance.etapaAtual = etapaDestino.chave;
      instance.etapaAtualIdx = novoIdx;
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: etapaOrigem.chave,
        etapaIdx: novoIdx + 1,
        acao: 'voltou',
        actor,
        comentario: payload.comentario,
        paraEtapa: etapaDestino.chave,
      });

      return instanceToResponse(instance);
    },

    async comentar(
      instanceId: string,
      payload: WorkflowComentar,
      actor: ActorContext,
    ): Promise<WorkflowEventoResponse> {
      const { instance } = await carregarInstanceOuFalhar(instanceId);
      const evento = eventoRepo.create({
        instanceId: instance.id,
        etapaChave: instance.etapaAtual,
        etapaIdx: instance.etapaAtualIdx,
        acao: payload.anexoUrl ? 'anexou' : 'comentou',
        usuarioId: actor.usuarioId,
        comentario: payload.comentario,
        anexoUrl: payload.anexoUrl ?? null,
        anexoNome: payload.anexoNome ?? null,
        paraEtapa: null,
        paraUsuarioId: null,
        meta: null,
      });
      await eventoRepo.save(evento);

      const userMap = new Map<string, { id: string; nomeCompleto: string; email: string }>();
      if (actor.usuarioId) {
        const u = await userRepo.findOne({ where: { id: actor.usuarioId } });
        if (u) userMap.set(u.id, { id: u.id, nomeCompleto: u.nomeCompleto, email: u.email });
      }
      return eventoToResponse(evento, userMap);
    },

    async atribuir(
      instanceId: string,
      payload: WorkflowAtribuir,
      actor: ActorContext,
    ): Promise<WorkflowInstanceResponse> {
      const { instance } = await carregarInstanceOuFalhar(instanceId);
      if (instance.status !== 'em_andamento') {
        throw fastify.httpErrors.conflict('Workflow não está em andamento');
      }
      const novoResp = await userRepo.findOne({ where: { id: payload.responsavelId } });
      if (!novoResp) throw fastify.httpErrors.notFound('Usuário destinatário não encontrado');

      instance.responsavelId = payload.responsavelId;
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: instance.etapaAtual,
        etapaIdx: instance.etapaAtualIdx,
        acao: 'atribuiu',
        actor,
        comentario: payload.comentario ?? null,
        paraUsuarioId: payload.responsavelId,
      });

      return instanceToResponse(instance);
    },

    async cancelar(
      instanceId: string,
      payload: WorkflowCancelar,
      actor: ActorContext,
    ): Promise<WorkflowInstanceResponse> {
      const { instance } = await carregarInstanceOuFalhar(instanceId);
      if (instance.status === 'cancelado') {
        throw fastify.httpErrors.conflict('Workflow já está cancelado');
      }
      if (instance.status === 'concluido') {
        throw fastify.httpErrors.conflict('Workflow já foi concluído');
      }
      instance.status = 'cancelado';
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: instance.etapaAtual,
        etapaIdx: instance.etapaAtualIdx,
        acao: 'cancelou',
        actor,
        comentario: payload.comentario,
      });

      return instanceToResponse(instance);
    },

    async retomar(instanceId: string, actor: ActorContext): Promise<WorkflowInstanceResponse> {
      const { instance } = await carregarInstanceOuFalhar(instanceId);
      if (instance.status === 'em_andamento') {
        throw fastify.httpErrors.conflict('Workflow já está em andamento');
      }
      if (instance.status === 'concluido') {
        throw fastify.httpErrors.conflict('Workflow concluído não pode ser retomado');
      }
      instance.status = 'em_andamento';
      await instanceRepo.save(instance);

      await registrarEvento({
        instanceId: instance.id,
        etapaChave: instance.etapaAtual,
        etapaIdx: instance.etapaAtualIdx,
        acao: 'retomou',
        actor,
      });

      return instanceToResponse(instance);
    },
  };
}

export type WorkflowService = ReturnType<typeof buildWorkflowService>;
