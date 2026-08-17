import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type {
  PerguntasListResponse,
  PerguntaItem,
  ResponderPerguntaBody,
  CriarPerguntaBody,
  PerguntaMutacaoResponse,
} from '@pioneira/shared/schemas/perguntas';
import { PerguntaFinanceiro } from '@/entities/pergunta-financeiro.entity.js';
import { User } from '@/entities/user.entity.js';

function toItem(p: PerguntaFinanceiro): PerguntaItem {
  return {
    id: p.id,
    chave: p.chave,
    modulo: p.modulo,
    moduloNome: p.moduloNome,
    categoria: p.categoria,
    pergunta: p.pergunta,
    contexto: p.contexto,
    resposta: p.resposta,
    status: p.status,
    prioridade: p.prioridade,
    respondidoPorNome: p.respondidoPorNome,
    respondidoEm: p.respondidoEm ? p.respondidoEm.toISOString() : null,
    criadoEm: p.criadoEm.toISOString(),
  };
}

export function buildPerguntasService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(PerguntaFinanceiro);
  const userRepo = fastify.db.getRepository(User);

  return {
    /**
     * Lista todas as linhas do banco: respostas de perguntas do roadmap + as
     * perguntas avulsas. O frontend mescla isto com as perguntas do roadmap
     * (module-status), casando pela `chave`.
     */
    async listar(): Promise<PerguntasListResponse> {
      const itens = await repo.find({ order: { prioridade: 'ASC', criadoEm: 'ASC' } });
      return { itens: itens.map(toItem) };
    },

    /**
     * Registra/atualiza a resposta de uma pergunta (upsert por `chave`). A
     * pergunta vem do roadmap; a linha é criada na primeira resposta.
     */
    async responder(body: ResponderPerguntaBody, usuarioId: string): Promise<PerguntaMutacaoResponse> {
      const u = await userRepo.findOne({ where: { id: usuarioId } });
      const nome = u?.nomeCompleto ?? null;

      let p = await repo.findOne({ where: { chave: body.chave } });
      if (!p) {
        p = repo.create({
          chave: body.chave,
          modulo: body.modulo ?? null,
          moduloNome: body.moduloNome ?? null,
          pergunta: body.pergunta,
          contexto: body.contexto ?? null,
          criadoPor: usuarioId,
        });
      }
      const respostaAntes = p.resposta ?? null;
      const statusAntes = p.status ?? 'aberta';
      p.resposta = body.resposta;
      p.status = 'respondida';
      p.respondidoPor = usuarioId;
      p.respondidoPorNome = nome;
      p.respondidoEm = new Date();
      await repo.save(p);

      await fastify.auditoria.registrarAlteracao({
        usuarioId,
        recurso: 'pergunta-financeiro',
        recursoId: body.chave,
        descricao: `Resposta ao financeiro — ${body.pergunta.slice(0, 80)}`,
        antes: { resposta: respostaAntes, status: statusAntes },
        depois: { resposta: body.resposta, status: 'respondida' },
      });

      return { ok: true, item: toItem(p) };
    },

    /** Cria uma pergunta avulsa (fora do roadmap), com chave própria. */
    async criar(body: CriarPerguntaBody, usuarioId: string): Promise<PerguntaMutacaoResponse> {
      const p = repo.create({
        chave: `avulsa-${randomUUID()}`,
        pergunta: body.pergunta,
        contexto: body.contexto ?? null,
        moduloNome: body.moduloNome ?? null,
        status: 'aberta',
        criadoPor: usuarioId,
      });
      await repo.save(p);
      return { ok: true, item: toItem(p) };
    },

    /** Arquiva a resposta/pergunta (por chave). */
    async arquivar(chave: string): Promise<PerguntaMutacaoResponse> {
      const p = await repo.findOne({ where: { chave } });
      if (!p) throw fastify.httpErrors.notFound('Pergunta não encontrada');
      p.status = 'arquivada';
      await repo.save(p);
      return { ok: true, item: toItem(p) };
    },
  };
}

export type PerguntasService = ReturnType<typeof buildPerguntasService>;
