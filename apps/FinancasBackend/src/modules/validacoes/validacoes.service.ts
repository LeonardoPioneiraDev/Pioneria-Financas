import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { In } from 'typeorm';
import type {
  AvalBody, ConferirBody, ConferirResponse, MinhasValidacoesResponse,
  RegistroValidacao, RelatorioValidacoesQuery, RelatorioValidacoesResponse,
  UserRole, ValidacoesResumoResponse,
} from '@pioneira/shared';
import {
  ANEXO_MAX_ARQUIVOS, ANEXO_MAX_BYTES, ANEXO_MIME_PERMITIDOS,
  FUNCIONALIDADES, FUNCIONALIDADE_LABEL, OBSERVACOES_MIN, USER_ROLE_LABELS,
  VALIDACAO_STATUS_LABELS, VALIDACAO_TIPO_LABELS,
  funcionalidadesLiberadas, proximaAValidar,
} from '@pioneira/shared';
import { Configuracao } from '@/entities/configuracao.entity.js';
import { User } from '@/entities/user.entity.js';
import { ValidacaoFuncionalidade } from '@/entities/validacao-funcionalidade.entity.js';
import { buildNotificacoesService } from '@/modules/notificacoes/notificacoes.service.js';

/** Dados mínimos do autor de um registro (para montar a resposta). */
interface AutorInfo { nomeCompleto: string; email: string; role: UserRole }

const CATALOGO = new Map(FUNCIONALIDADES.map((f) => [f.chave, f]));

export function buildValidacoesService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(ValidacaoFuncionalidade);
  const userRepo = fastify.db.getRepository(User);
  const configRepo = fastify.db.getRepository(Configuracao);
  const notificacoes = buildNotificacoesService(fastify);

  /** Tempo mínimo (min) entre o 1º acesso e a validação. Fallback 120. */
  async function minutosMinimos(): Promise<number> {
    const cfg = await configRepo.findOne({
      where: { empresaId: 1 },
      select: { empresaId: true, minutosValidacaoFuncionalidade: true },
    });
    return cfg?.minutosValidacaoFuncionalidade ?? 120;
  }

  function toRegistro(v: ValidacaoFuncionalidade, autores: Map<string, AutorInfo>): RegistroValidacao {
    const autor = autores.get(v.usuarioId);
    const respondente = v.respondidoPor ? autores.get(v.respondidoPor) : undefined;
    return {
      id: v.id,
      funcionalidade: v.funcionalidade,
      tipo: v.tipo,
      status: v.status,
      observacoes: v.observacoes,
      anexosDataUri: v.anexosDataUri ?? [],
      usuarioId: v.usuarioId,
      usuarioNome: autor?.nomeCompleto ?? 'Usuário removido',
      usuarioEmail: autor?.email ?? '',
      usuarioRole: autor?.role ?? 'operacional',
      respostaAdmin: v.respostaAdmin,
      respondidoEm: v.respondidoEm ? v.respondidoEm.toISOString() : null,
      respondidoPorNome: respondente?.nomeCompleto ?? null,
      criadoEm: v.criadoEm.toISOString(),
    };
  }

  /** Carrega os autores citados nos registros (uma query só). */
  async function carregarAutores(registros: ValidacaoFuncionalidade[]): Promise<Map<string, AutorInfo>> {
    const ids = new Set<string>();
    for (const r of registros) {
      ids.add(r.usuarioId);
      if (r.respondidoPor) ids.add(r.respondidoPor);
    }
    if (ids.size === 0) return new Map();
    const users = await userRepo.find({
      where: { id: In([...ids]) },
      select: { id: true, nomeCompleto: true, email: true, role: true },
    });
    return new Map(users.map((u) => [u.id, { nomeCompleto: u.nomeCompleto, email: u.email, role: u.role }]));
  }

  /**
   * Último registro de cada usuário DENTRO de uma mesma funcionalidade.
   * Só use com a lista já filtrada por funcionalidade — para contar em várias,
   * use `ultimoPorUsuarioEFuncionalidade`.
   */
  function ultimoPorUsuario(registros: ValidacaoFuncionalidade[]): ValidacaoFuncionalidade[] {
    const porUsuario = new Map<string, ValidacaoFuncionalidade>();
    for (const r of registros) porUsuario.set(r.usuarioId, r); // registros vêm em ordem ASC
    return [...porUsuario.values()];
  }

  /**
   * Último registro por (usuário, funcionalidade). Usado quando a lista cruza
   * várias funcionalidades — agrupar só por usuário colapsaria tudo num registro
   * só e o contador do auditor mostraria no máximo 1.
   */
  function ultimoPorUsuarioEFuncionalidade(registros: ValidacaoFuncionalidade[]): ValidacaoFuncionalidade[] {
    const porChave = new Map<string, ValidacaoFuncionalidade>();
    for (const r of registros) porChave.set(`${r.usuarioId}|${r.funcionalidade}`, r);
    return [...porChave.values()];
  }

  function exigirObservacoes(observacoes: string | undefined, acao: string): string {
    const texto = observacoes?.trim() ?? '';
    if (texto.length < OBSERVACOES_MIN) {
      throw fastify.httpErrors.badRequest(
        `Descreva o que precisa ser ${acao} (mínimo ${OBSERVACOES_MIN} caracteres).`,
      );
    }
    return texto;
  }

  /** Valida o data-URI de UM anexo (formato, mime e tamanho). Lança 400 se inválido. */
  function validarAnexo(dataUri: string): void {
    const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri);
    if (!m) throw fastify.httpErrors.badRequest('Anexo inválido: envie uma imagem em data-URI base64.');
    const mime = m[1]!.toLowerCase();
    if (!ANEXO_MIME_PERMITIDOS.includes(mime as (typeof ANEXO_MIME_PERMITIDOS)[number])) {
      throw fastify.httpErrors.badRequest('Formato não suportado — use PNG, JPG ou WebP.');
    }
    const bytes = Math.floor((m[2]!.length * 3) / 4);
    if (bytes > ANEXO_MAX_BYTES) {
      throw fastify.httpErrors.badRequest(`Anexo acima do limite de ${Math.round(ANEXO_MAX_BYTES / 1024 / 1024)} MB.`);
    }
  }

  /** Valida a lista inteira de anexos (quantidade + cada arquivo). Lança 400 se inválida. */
  function validarAnexos(anexos: string[] | undefined): void {
    if (!anexos || anexos.length === 0) return;
    if (anexos.length > ANEXO_MAX_ARQUIVOS) {
      throw fastify.httpErrors.badRequest(`No máximo ${ANEXO_MAX_ARQUIVOS} anexos por registro.`);
    }
    for (const anexo of anexos) validarAnexo(anexo);
  }

  return {
    /**
     * Conferência do AUDITOR sobre a funcionalidade atual da trilha.
     *
     * - `validado`   → exige o tempo mínimo desde o 1º acesso; libera a próxima.
     * - `reprovado`  → exige observações; registra a ressalva e NÃO avança a
     *   trilha (o auditor pode validar depois, quando o problema for corrigido).
     */
    async conferir(usuarioId: string, body: ConferirBody): Promise<ConferirResponse> {
      const user = await userRepo.findOne({ where: { id: usuarioId } });
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');
      if (!user.liberacaoProgressiva) {
        throw fastify.httpErrors.badRequest('Você não está em trilha de conferência.');
      }
      if (!CATALOGO.has(body.chave)) {
        throw fastify.httpErrors.badRequest('Funcionalidade desconhecida.');
      }

      const atribuidas = user.funcionalidadesAtribuidas ?? [];
      const validadas = user.funcionalidadesValidadas ?? [];
      const proxima = proximaAValidar(atribuidas, validadas);
      if (!proxima || body.chave !== proxima) {
        throw fastify.httpErrors.badRequest('Só é possível conferir a funcionalidade atual da sua sequência.');
      }

      const prog = user.progressoFuncionalidades ?? {};
      const primeiroAcessoIso = prog[body.chave]?.primeiroAcessoEm ?? null;
      if (!primeiroAcessoIso) {
        throw fastify.httpErrors.badRequest('Abra a funcionalidade pelo menos uma vez antes de registrar a conferência.');
      }
      const primeiroAcesso = new Date(primeiroAcessoIso);

      // Ressalva: registra e para por aqui — a trilha não avança.
      if (body.status === 'reprovado') {
        const observacoes = exigirObservacoes(body.observacoes, 'corrigido');
        validarAnexos(body.anexosDataUri);
        await repo.save(repo.create({
          usuarioId, funcionalidade: body.chave, tipo: 'conferencia', status: 'reprovado',
          observacoes, anexosDataUri: body.anexosDataUri?.length ? body.anexosDataUri : null, primeiroAcessoEm: primeiroAcesso,
        }));
        fastify.log.info({ usuarioId, chave: body.chave }, '[validacoes] ressalva registrada pelo auditor');
        await notificacoes.registrarEvento({
          tipo: 'ressalva_registrada', atorId: usuarioId, funcionalidade: body.chave, detalhe: observacoes,
        });
        return {
          status: 'reprovado',
          funcionalidadesValidadas: validadas,
          funcionalidadesLiberadas: funcionalidadesLiberadas(atribuidas, validadas),
          proxima,
        };
      }

      // Validação: exige o tempo mínimo de análise desde o 1º acesso.
      const minutos = await minutosMinimos();
      const decorridoMs = Date.now() - primeiroAcesso.getTime();
      const minMs = minutos * 60_000;
      if (decorridoMs < minMs) {
        const faltamMin = Math.max(1, Math.ceil((minMs - decorridoMs) / 60_000));
        throw fastify.httpErrors.badRequest(
          `Ainda não pode validar — disponível em ~${faltamMin} min (mínimo ${minutos} min após o 1º acesso).`,
        );
      }

      const observacoes = body.observacoes?.trim() || null;
      const novasValidadas = [...validadas, body.chave];
      const agora = new Date();

      // Trilha (histórico) e espelho (menu/grant de API) na mesma transação.
      await fastify.db.transaction(async (manager) => {
        await manager.getRepository(ValidacaoFuncionalidade).save(
          manager.getRepository(ValidacaoFuncionalidade).create({
            usuarioId, funcionalidade: body.chave, tipo: 'conferencia', status: 'validado',
            observacoes, primeiroAcessoEm: primeiroAcesso,
          }),
        );
        await manager.getRepository(User).update({ id: usuarioId }, {
          funcionalidadesValidadas: novasValidadas,
          progressoFuncionalidades: {
            ...prog,
            [body.chave]: {
              primeiroAcessoEm: primeiroAcessoIso,
              validadoEm: agora.toISOString(),
              justificativa: observacoes,
            },
          },
        });
      });

      fastify.log.info({ usuarioId, chave: body.chave }, '[validacoes] funcionalidade validada pelo auditor');
      await notificacoes.registrarEvento({
        tipo: 'validacao_registrada', atorId: usuarioId, funcionalidade: body.chave, detalhe: observacoes,
      });
      return {
        status: 'validado',
        funcionalidadesValidadas: novasValidadas,
        funcionalidadesLiberadas: funcionalidadesLiberadas(atribuidas, novasValidadas),
        proxima: proximaAValidar(atribuidas, novasValidadas),
      };
    },

    /**
     * Aval do CFO sobre uma funcionalidade já validada por algum auditor.
     * `reprovado` = devolve com ressalva — registra, mas NÃO retrocede a trilha
     * do auditor (ninguém perde acesso já conquistado).
     */
    async avalizar(usuarioId: string, body: AvalBody): Promise<RegistroValidacao> {
      if (!CATALOGO.has(body.chave)) throw fastify.httpErrors.badRequest('Funcionalidade desconhecida.');

      const conferencias = await repo.find({
        where: { funcionalidade: body.chave, tipo: 'conferencia' },
        order: { criadoEm: 'ASC' },
      });
      const vigentes = ultimoPorUsuario(conferencias);
      if (!vigentes.some((c) => c.status === 'validado')) {
        throw fastify.httpErrors.badRequest('Esta funcionalidade ainda não foi validada por nenhum auditor.');
      }

      const observacoes = body.status === 'reprovado'
        ? exigirObservacoes(body.observacoes, 'revisto')
        : body.observacoes?.trim() || null;

      const salvo = await repo.save(repo.create({
        usuarioId, funcionalidade: body.chave, tipo: 'aval', status: body.status, observacoes,
      }));

      await fastify.auditoria.registrarAlteracao({
        usuarioId,
        recurso: 'validacao-funcionalidade',
        recursoId: body.chave,
        descricao: `Aval do CFO — ${CATALOGO.get(body.chave)?.nome ?? body.chave}`,
        antes: { aval: null },
        depois: { aval: body.status, observacoes },
        acao: body.status === 'validado' ? 'aprovou' : 'rejeitou',
      });

      // O auditor que validou precisa saber que o CFO avalizou o trabalho dele.
      const auditoresEnvolvidos = vigentes.filter((c) => c.status === 'validado').map((c) => c.usuarioId);
      await notificacoes.registrarEvento({
        tipo: body.status === 'validado' ? 'aval_registrado' : 'aval_devolvido',
        atorId: usuarioId,
        funcionalidade: body.chave,
        destinatariosExtras: auditoresEnvolvidos,
        detalhe: observacoes,
      });

      const autores = await carregarAutores([salvo]);
      fastify.log.info({ usuarioId, chave: body.chave, status: body.status }, '[validacoes] aval do CFO registrado');
      return toRegistro(salvo, autores);
    },

    /**
     * Consolidado por funcionalidade. Para o CFO mostra só o que já foi validado
     * por algum auditor (ou já avalizado); o admin enxerga a lista inteira.
     */
    async resumo(role: UserRole): Promise<ValidacoesResumoResponse> {
      const registros = await repo.find({ order: { criadoEm: 'ASC' } });
      const autores = await carregarAutores(registros);

      const emTrilha = await userRepo.find({
        where: { liberacaoProgressiva: true },
        select: {
          id: true, nomeCompleto: true, email: true, role: true,
          funcionalidadesAtribuidas: true, funcionalidadesValidadas: true,
          progressoFuncionalidades: true,
        },
        order: { nomeCompleto: 'ASC' },
      });

      // O que os auditores já alcançaram (validadas + a que estão conferindo).
      // Serve só para marcar "em conferência" na visão do ADMIN — o CFO não vê
      // trabalho em andamento.
      const escopoAuditoria = new Set<string>();
      for (const a of emTrilha) {
        if (a.role === 'admin') continue;
        for (const chave of funcionalidadesLiberadas(a.funcionalidadesAtribuidas ?? [], a.funcionalidadesValidadas ?? [])) {
          escopoAuditoria.add(chave);
        }
      }

      const funcionalidades = FUNCIONALIDADES.map((f) => {
        const doFunc = registros.filter((r) => r.funcionalidade === f.chave);
        const conferenciasVigentes = ultimoPorUsuario(doFunc.filter((r) => r.tipo === 'conferencia'));
        const avais = doFunc.filter((r) => r.tipo === 'aval');
        const aval = avais.length > 0 ? avais[avais.length - 1]! : null;

        const totalValidada = conferenciasVigentes.filter((c) => c.status === 'validado').length;
        const ressalvasAbertas = conferenciasVigentes
          .filter((c) => c.status === 'reprovado' && !c.respostaAdmin).length;
        const avalComRessalvaPosterior = aval !== null && doFunc.some(
          (r) => r.tipo === 'conferencia' && r.status === 'reprovado' && r.criadoEm > aval.criadoEm,
        );

        return {
          chave: f.chave,
          nome: f.nome,
          grupo: f.grupo,
          conferencias: conferenciasVigentes.map((c) => toRegistro(c, autores)),
          totalValidada,
          ressalvasAbertas,
          aval: aval ? toRegistro(aval, autores) : null,
          avalComRessalvaPosterior,
          // O aval só faz sentido depois que algum auditor validou.
          podeAvalizar: totalValidada > 0,
          /** Algum auditor está com esta tela aberta na trilha agora. */
          emConferencia: escopoAuditoria.has(f.chave) && totalValidada === 0,
        };
      });

      const totais = {
        funcionalidades: funcionalidades.length,
        validadas: funcionalidades.filter((f) => f.totalValidada > 0).length,
        avalizadas: funcionalidades.filter((f) => f.aval?.status === 'validado').length,
        ressalvasAbertas: funcionalidades.reduce((acc, f) => acc + f.ressalvasAbertas, 0),
      };

      // O CFO vê SÓ o que a auditoria já validou (e o que ele mesmo já avalizou).
      // Tela em análise não entra: ele avaliza o conferido, não acompanha o
      // trabalho em andamento. O admin acompanha tudo.
      const visiveis = role === 'admin'
        ? funcionalidades
        : funcionalidades.filter((f) => f.totalValidada > 0 || f.aval !== null);

      return {
        funcionalidades: visiveis,
        auditores: emTrilha
          .filter((u) => u.role !== 'admin')
          .map((u) => {
            const meus = registros.filter((r) => r.usuarioId === u.id && r.tipo === 'conferencia');
            // Cruza várias funcionalidades: agrupar por (usuário, funcionalidade).
            const vigentes = ultimoPorUsuarioEFuncionalidade(meus);

            // Onde ele está PARADO agora: a próxima a validar da trilha.
            const proxima = proximaAValidar(u.funcionalidadesAtribuidas ?? [], u.funcionalidadesValidadas ?? []);
            const prog = u.progressoFuncionalidades ?? {};
            const primeiroAcessoIso = proxima ? (prog[proxima]?.primeiroAcessoEm ?? null) : null;
            // Dias desde que abriu a tela atual sem validar. Null = ainda não abriu
            // (ou trilha concluída). É o "há X dias parado" que o gestor precisa ver.
            const diasNaAtual = primeiroAcessoIso
              ? Math.floor((Date.now() - new Date(primeiroAcessoIso).getTime()) / 86_400_000)
              : null;

            return {
              id: u.id,
              nome: u.nomeCompleto,
              email: u.email,
              atribuidas: (u.funcionalidadesAtribuidas ?? []).length,
              validadas: vigentes.filter((c) => c.status === 'validado').length,
              ressalvas: vigentes.filter((c) => c.status === 'reprovado').length,
              /** Funcionalidade em que está parado (a próxima a validar). Null = concluiu. */
              atualChave: proxima,
              atualNome: proxima ? (CATALOGO.get(proxima)?.nome ?? proxima) : null,
              /** Quando abriu a tela atual (null = nem abriu ainda). */
              atualDesde: primeiroAcessoIso,
              /** Dias parado na tela atual sem validar. */
              diasNaAtual,
            };
          }),
        totais,
      };
    },

    /** Histórico do próprio usuário (tela "Minhas funcionalidades"). */
    async minhas(usuarioId: string): Promise<MinhasValidacoesResponse> {
      const registros = await repo.find({ where: { usuarioId }, order: { criadoEm: 'DESC' } });
      const autores = await carregarAutores(registros);
      return { historico: registros.map((r) => toRegistro(r, autores)) };
    },

    /** Admin responde a uma ressalva (o que foi corrigido). */
    async responderRessalva(id: string, adminId: string, resposta: string): Promise<RegistroValidacao> {
      const registro = await repo.findOne({ where: { id } });
      if (!registro) throw fastify.httpErrors.notFound('Registro não encontrado');
      if (registro.status !== 'reprovado') {
        throw fastify.httpErrors.badRequest('Só é possível responder a um registro com ressalva.');
      }

      const antes = { respostaAdmin: registro.respostaAdmin };
      registro.respostaAdmin = resposta.trim();
      registro.respondidoPor = adminId;
      registro.respondidoEm = new Date();
      await repo.save(registro);

      await fastify.auditoria.registrarAlteracao({
        usuarioId: adminId,
        recurso: 'validacao-funcionalidade',
        recursoId: registro.funcionalidade,
        descricao: `Resposta à ressalva — ${CATALOGO.get(registro.funcionalidade)?.nome ?? registro.funcionalidade}`,
        antes,
        depois: { respostaAdmin: registro.respostaAdmin },
      });

      // Quem apontou o problema é quem precisa saber que foi corrigido.
      await notificacoes.registrarEvento({
        tipo: 'ressalva_respondida',
        atorId: adminId,
        funcionalidade: registro.funcionalidade,
        destinatariosExtras: [registro.usuarioId],
        detalhe: registro.respostaAdmin,
      });

      const autores = await carregarAutores([registro]);
      return toRegistro(registro, autores);
    },

    /**
     * Relatório da trilha: uma linha por evento, com quem, e-mail, quando, a
     * funcionalidade e o que foi escrito. Filtros opcionais; sem eles, tudo.
     */
    async relatorio(query: RelatorioValidacoesQuery): Promise<RelatorioValidacoesResponse> {
      const registros = await repo.find({ order: { criadoEm: 'DESC' } });
      const autores = await carregarAutores(registros);

      const de = query.de ? new Date(query.de) : null;
      // `ate` é inclusivo: 2026-07-22 pega o dia inteiro.
      const ate = query.ate ? new Date(`${query.ate.slice(0, 10)}T23:59:59.999`) : null;

      const filtrados = registros.filter((r) => {
        if (query.funcionalidade && r.funcionalidade !== query.funcionalidade) return false;
        if (query.usuarioId && r.usuarioId !== query.usuarioId) return false;
        if (query.tipo && r.tipo !== query.tipo) return false;
        if (query.status && r.status !== query.status) return false;
        if (de && r.criadoEm < de) return false;
        if (ate && r.criadoEm > ate) return false;
        return true;
      });

      const vistos = new Map<string, { id: string; nome: string; email: string }>();
      for (const r of registros) {
        const a = autores.get(r.usuarioId);
        if (a && !vistos.has(r.usuarioId)) {
          vistos.set(r.usuarioId, { id: r.usuarioId, nome: a.nomeCompleto, email: a.email });
        }
      }

      return {
        itens: filtrados.map((r) => toRegistro(r, autores)),
        totais: {
          eventos: filtrados.length,
          validacoes: filtrados.filter((r) => r.tipo === 'conferencia' && r.status === 'validado').length,
          ressalvas: filtrados.filter((r) => r.status === 'reprovado').length,
          avais: filtrados.filter((r) => r.tipo === 'aval' && r.status === 'validado').length,
        },
        usuarios: [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      };
    },

    /** Mesmo relatório, em XLSX, para anexar em ata/auditoria externa. */
    async exportarRelatorioXlsx(query: RelatorioValidacoesQuery): Promise<{ buffer: Buffer; filename: string }> {
      const { itens, totais } = await this.relatorio(query);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Pioneira Financas';
      const ws = wb.addWorksheet('Validações', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'Data/hora', key: 'quando', width: 20 },
        { header: 'Usuário', key: 'usuario', width: 28 },
        { header: 'E-mail', key: 'email', width: 32 },
        { header: 'Papel', key: 'papel', width: 16 },
        { header: 'Funcionalidade', key: 'funcionalidade', width: 26 },
        { header: 'Etapa', key: 'etapa', width: 16 },
        { header: 'Resultado', key: 'resultado', width: 16 },
        { header: 'Observações', key: 'observacoes', width: 60 },
        { header: 'Anexo', key: 'anexo', width: 10 },
        { header: 'Resposta do admin', key: 'resposta', width: 50 },
        { header: 'Respondido por', key: 'respondidoPor', width: 24 },
        { header: 'Respondido em', key: 'respondidoEm', width: 20 },
      ];

      for (const it of itens) {
        ws.addRow({
          quando: new Date(it.criadoEm).toLocaleString('pt-BR'),
          usuario: it.usuarioNome,
          email: it.usuarioEmail,
          papel: USER_ROLE_LABELS[it.usuarioRole] ?? it.usuarioRole,
          funcionalidade: FUNCIONALIDADE_LABEL[it.funcionalidade] ?? it.funcionalidade,
          etapa: VALIDACAO_TIPO_LABELS[it.tipo],
          resultado: VALIDACAO_STATUS_LABELS[it.status],
          observacoes: it.observacoes ?? '',
          anexo: it.anexosDataUri.length > 0 ? `Sim (${it.anexosDataUri.length})` : '',
          resposta: it.respostaAdmin ?? '',
          respondidoPor: it.respondidoPorNome ?? '',
          respondidoEm: it.respondidoEm ? new Date(it.respondidoEm).toLocaleString('pt-BR') : '',
        });
      }

      ws.getRow(1).font = { bold: true };
      ws.autoFilter = { from: 'A1', to: 'L1' };

      // Resumo em aba separada — o que a diretoria olha primeiro.
      const resumo = wb.addWorksheet('Resumo');
      resumo.columns = [{ header: 'Indicador', key: 'k', width: 34 }, { header: 'Valor', key: 'v', width: 14 }];
      resumo.addRows([
        { k: 'Eventos no período', v: totais.eventos },
        { k: 'Validações de auditor', v: totais.validacoes },
        { k: 'Ressalvas registradas', v: totais.ressalvas },
        { k: 'Avais do CFO', v: totais.avais },
        { k: 'Gerado em', v: new Date().toLocaleString('pt-BR') },
      ]);
      resumo.getRow(1).font = { bold: true };

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      return { buffer, filename: 'relatorio-validacoes.xlsx' };
    },
  };
}

export type ValidacoesService = ReturnType<typeof buildValidacoesService>;
