import type { FastifyInstance } from 'fastify';
import type {
  FeriadoItem,
  FeriadosListResponse,
  CriarFeriadoBody,
  AtualizarFeriadoBody,
  FeriadoMutacaoResponse,
} from '@pioneira/shared';
import { Feriado } from '@/entities/feriado.entity.js';

function toItem(f: Feriado): FeriadoItem {
  return { id: f.id, data: f.data, nome: f.nome, tipo: f.tipo, recorrente: f.recorrente };
}

export function buildFeriadosService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(Feriado);

  return {
    async listar(): Promise<FeriadosListResponse> {
      const itens = await repo.find({ order: { recorrente: 'DESC', data: 'ASC' } });
      return { itens: itens.map(toItem) };
    },

    async criar(body: CriarFeriadoBody, usuarioId: string): Promise<FeriadoMutacaoResponse> {
      const nome = body.nome.trim();
      const existente = await repo.findOne({ where: { data: body.data, nome } });
      if (existente) throw fastify.httpErrors.conflict('Já existe um feriado com essa data e nome.');
      const f = repo.create({
        data: body.data,
        nome,
        tipo: body.tipo ?? 'nacional',
        recorrente: body.recorrente ?? false,
        criadoPor: usuarioId,
      });
      await repo.save(f);
      return { ok: true, item: toItem(f) };
    },

    async atualizar(id: string, body: AtualizarFeriadoBody): Promise<FeriadoMutacaoResponse> {
      const f = await repo.findOne({ where: { id } });
      if (!f) throw fastify.httpErrors.notFound('Feriado não encontrado');
      if (body.data !== undefined) f.data = body.data;
      if (body.nome !== undefined) f.nome = body.nome.trim();
      if (body.tipo !== undefined) f.tipo = body.tipo;
      if (body.recorrente !== undefined) f.recorrente = body.recorrente;
      await repo.save(f);
      return { ok: true, item: toItem(f) };
    },

    async remover(id: string): Promise<FeriadoMutacaoResponse> {
      const r = await repo.delete({ id });
      if (!r.affected) throw fastify.httpErrors.notFound('Feriado não encontrado');
      return { ok: true };
    },
  };
}

export type FeriadosService = ReturnType<typeof buildFeriadosService>;
