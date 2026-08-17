import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import type {
  AuditAcessosQuery,
  AuditAcessosResponse,
  AuditAcessoItem,
  AuditAlteracaoCampo,
  AuditAtividadeQuery,
  AuditAtividadeResponse,
  AuditAtividadeItem,
  AuditResumoQuery,
  AuditResumoResponse,
} from '@pioneira/shared/schemas/audit';
import { resumirUserAgent } from '@/shared/utils/user-agent.js';

/** Remove a máscara CIDR (/32, /128) que o cast inet::text agrega. */
function limparIp(ip: string | null): string | null {
  if (!ip) return ip;
  const semMascara = ip.split('/')[0] ?? ip;
  return semMascara.startsWith('::ffff:') ? semMascara.slice('::ffff:'.length) : semMascara;
}

interface RawAcesso {
  id: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  acao: string;
  recurso: string;
  recursoId: string | null;
  descricao: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  criadoEm: Date | string;
  valoresAntes: Record<string, unknown> | null;
  valoresDepois: Record<string, unknown> | null;
}

/** Valor de campo aceito no diff (primitivo). Objetos viram string legível. */
function coagirValor(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

/** Monta o diff [{campo, de, para}] a partir das colunas jsonb (só campos mudados). */
function montarAlteracoes(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): AuditAlteracaoCampo[] | null {
  if (!antes && !depois) return null;
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  if (chaves.size === 0) return null;
  const out: AuditAlteracaoCampo[] = [];
  for (const campo of chaves) {
    out.push({ campo, de: coagirValor(antes?.[campo]), para: coagirValor(depois?.[campo]) });
  }
  return out;
}

interface RawAtividade {
  id: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  activityType: string;
  ipAddress: string | null;
  userAgent: string | null;
  criadoEm: Date | string;
}

/** Auditoria — consulta dos logs que o sistema JÁ grava (audit.*). */
export function buildAuditService(fastify: FastifyInstance) {
  const db = fastify.db;

  return {
    async listarAcessos(q: AuditAcessosQuery): Promise<AuditAcessosResponse> {
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 50;
      const offset = (page - 1) * pageSize;

      const where: string[] = [];
      const p: unknown[] = [];
      if (q.usuarioId) { p.push(q.usuarioId); where.push(`a.usuario_id = $${p.length}`); }
      if (q.acao) { p.push(q.acao); where.push(`a.acao = $${p.length}`); }
      if (q.recurso) { p.push(q.recurso); where.push(`a.recurso = $${p.length}`); }
      if (q.somenteAlteracoes) where.push(`a.acao IN ('editou','aprovou','rejeitou','sincronizou')`);
      if (q.dtIni) { p.push(q.dtIni); where.push(`a.criado_em >= $${p.length}::date`); }
      if (q.dtFim) { p.push(q.dtFim); where.push(`a.criado_em < ($${p.length}::date + INTERVAL '1 day')`); }
      if (q.busca) {
        p.push(`%${q.busca}%`);
        const i = p.length;
        where.push(`(a.recurso ILIKE $${i} OR a.descricao ILIKE $${i} OR a.recurso_id ILIKE $${i})`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const totalRows = await db.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM audit.acesso_dados a ${whereSql}`,
        p,
      );
      const total = totalRows[0]?.total ?? 0;

      p.push(pageSize);
      const limIdx = p.length;
      p.push(offset);
      const offIdx = p.length;
      const rows = await db.query<RawAcesso[]>(
        `SELECT a.id, a.usuario_id AS "usuarioId", u.nome_completo AS "usuarioNome", u.email AS "usuarioEmail",
                a.acao, a.recurso, a.recurso_id AS "recursoId", a.descricao, a.ip_address::text AS "ipAddress",
                a.user_agent AS "userAgent",
                a.criado_em AS "criadoEm", a.valores_antes AS "valoresAntes", a.valores_depois AS "valoresDepois"
           FROM audit.acesso_dados a
           LEFT JOIN identity.usuarios u ON u.id = a.usuario_id
           ${whereSql}
          ORDER BY a.criado_em DESC
          LIMIT $${limIdx} OFFSET $${offIdx}`,
        p,
      );

      const itens: AuditAcessoItem[] = rows.map((r) => {
        const disp = resumirUserAgent(r.userAgent);
        return {
          id: r.id,
          usuarioId: r.usuarioId,
          usuarioNome: r.usuarioNome,
          usuarioEmail: r.usuarioEmail,
          acao: r.acao,
          recurso: r.recurso,
          recursoId: r.recursoId,
          descricao: r.descricao,
          ipAddress: limparIp(r.ipAddress),
          dispositivo: r.userAgent ? disp.rotulo : null,
          dispositivoTipo: r.userAgent ? disp.tipo : null,
          criadoEm: new Date(r.criadoEm).toISOString(),
          alteracoes: montarAlteracoes(r.valoresAntes, r.valoresDepois),
        };
      });
      return { itens, total, page, pageSize };
    },

    async listarAtividade(q: AuditAtividadeQuery): Promise<AuditAtividadeResponse> {
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 50;
      const offset = (page - 1) * pageSize;

      const where: string[] = [];
      const p: unknown[] = [];
      if (q.usuarioId) { p.push(q.usuarioId); where.push(`l.usuario_id = $${p.length}`); }
      if (q.activityType) { p.push(q.activityType); where.push(`l.activity_type = $${p.length}`); }
      if (q.dtIni) { p.push(q.dtIni); where.push(`l.criado_em >= $${p.length}::date`); }
      if (q.dtFim) { p.push(q.dtFim); where.push(`l.criado_em < ($${p.length}::date + INTERVAL '1 day')`); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const totalRows = await db.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM audit.user_activity_logs l ${whereSql}`,
        p,
      );
      const total = totalRows[0]?.total ?? 0;

      p.push(pageSize);
      const limIdx = p.length;
      p.push(offset);
      const offIdx = p.length;
      const rows = await db.query<RawAtividade[]>(
        `SELECT l.id, l.usuario_id AS "usuarioId", u.nome_completo AS "usuarioNome", u.email AS "usuarioEmail",
                l.activity_type AS "activityType", l.ip_address::text AS "ipAddress", l.user_agent AS "userAgent",
                l.criado_em AS "criadoEm"
           FROM audit.user_activity_logs l
           LEFT JOIN identity.usuarios u ON u.id = l.usuario_id
           ${whereSql}
          ORDER BY l.criado_em DESC
          LIMIT $${limIdx} OFFSET $${offIdx}`,
        p,
      );

      const itens: AuditAtividadeItem[] = rows.map((r) => {
        const disp = resumirUserAgent(r.userAgent);
        return {
          id: r.id,
          usuarioId: r.usuarioId,
          usuarioNome: r.usuarioNome,
          usuarioEmail: r.usuarioEmail,
          activityType: r.activityType,
          ipAddress: limparIp(r.ipAddress),
          dispositivo: r.userAgent ? disp.rotulo : null,
          dispositivoTipo: r.userAgent ? disp.tipo : null,
          criadoEm: new Date(r.criadoEm).toISOString(),
        };
      });
      return { itens, total, page, pageSize };
    },

    /** KPIs + opções de filtro (recursos/usuários distintos) numa chamada. */
    async resumo(q: AuditResumoQuery): Promise<AuditResumoResponse> {
      const dias = q.dias ?? 30;
      const kpis = await db.query<Array<{
        total_acessos: number; total_alteracoes: number; total_atividade: number; usuarios_ativos: number;
      }>>(
        `SELECT
           (SELECT COUNT(*)::int FROM audit.acesso_dados WHERE criado_em >= CURRENT_DATE - $1::int) AS total_acessos,
           (SELECT COUNT(*)::int FROM audit.acesso_dados WHERE criado_em >= CURRENT_DATE - $1::int
              AND acao IN ('editou','aprovou','rejeitou','sincronizou')) AS total_alteracoes,
           (SELECT COUNT(*)::int FROM audit.user_activity_logs WHERE criado_em >= CURRENT_DATE - $1::int) AS total_atividade,
           (SELECT COUNT(DISTINCT usuario_id)::int FROM audit.acesso_dados WHERE criado_em >= CURRENT_DATE - $1::int) AS usuarios_ativos`,
        [dias],
      );
      const k = kpis[0];
      const porAcao = await db.query<Array<{ acao: string; qtd: number }>>(
        `SELECT acao, COUNT(*)::int AS qtd
           FROM audit.acesso_dados WHERE criado_em >= CURRENT_DATE - $1::int
          GROUP BY acao ORDER BY qtd DESC`,
        [dias],
      );
      const recursos = await db.query<Array<{ recurso: string }>>(
        `SELECT DISTINCT recurso FROM audit.acesso_dados ORDER BY recurso`,
      );
      const usuarios = await db.query<Array<{ id: string; nome: string }>>(
        `SELECT DISTINCT u.id, u.nome_completo AS nome
           FROM audit.acesso_dados a JOIN identity.usuarios u ON u.id = a.usuario_id
          ORDER BY u.nome_completo`,
      );
      return {
        periodoDias: dias,
        totalAcessos: k?.total_acessos ?? 0,
        totalAlteracoes: k?.total_alteracoes ?? 0,
        totalAtividade: k?.total_atividade ?? 0,
        usuariosAtivos: k?.usuarios_ativos ?? 0,
        porAcao: porAcao.map((x) => ({ acao: x.acao, qtd: x.qtd })),
        recursos: recursos.map((x) => x.recurso),
        usuarios: usuarios.map((x) => ({ id: x.id, nome: x.nome })),
      };
    },

    /** Export XLSX dos acessos filtrados (auditoria externa). */
    async exportarAcessosXlsx(q: AuditAcessosQuery): Promise<{ buffer: Buffer; filename: string }> {
      const dados = await this.listarAcessos({ ...q, page: 1, pageSize: 10000 });
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Pioneira Financas';
      const ws = wb.addWorksheet('Trilha de auditoria', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'Data/hora', key: 'quando', width: 22 },
        { header: 'Usuário', key: 'usuario', width: 28 },
        { header: 'E-mail', key: 'email', width: 30 },
        { header: 'Ação', key: 'acao', width: 14 },
        { header: 'Recurso', key: 'recurso', width: 22 },
        { header: 'ID do registro', key: 'recursoId', width: 20 },
        { header: 'Descrição', key: 'descricao', width: 50 },
        { header: 'Alterações (campo: antes → depois)', key: 'alteracoes', width: 60 },
        { header: 'IP', key: 'ip', width: 18 },
        { header: 'Dispositivo', key: 'dispositivo', width: 24 },
      ];
      for (const it of dados.itens) {
        ws.addRow({
          quando: new Date(it.criadoEm).toLocaleString('pt-BR'),
          usuario: it.usuarioNome ?? it.usuarioId ?? '—',
          email: it.usuarioEmail ?? '',
          acao: it.acao,
          recurso: it.recurso,
          recursoId: it.recursoId ?? '',
          descricao: it.descricao ?? '',
          alteracoes: (it.alteracoes ?? [])
            .map((a) => `${a.campo}: ${a.de ?? '—'} → ${a.para ?? '—'}`)
            .join(' | '),
          ip: it.ipAddress ?? '',
          dispositivo: it.dispositivo ?? '',
        });
      }
      ws.getRow(1).font = { bold: true };
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      return { buffer, filename: 'auditoria-acessos.xlsx' };
    },
  };
}

export type AuditService = ReturnType<typeof buildAuditService>;
