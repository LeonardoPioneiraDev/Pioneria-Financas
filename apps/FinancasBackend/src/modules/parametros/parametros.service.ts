import type { FastifyInstance } from 'fastify';
import type {
  Configuracao as ConfiguracaoDTO,
  ConfiguracaoBranding,
  AtualizarConfiguracaoBody,
} from '@pioneira/shared';
import { Configuracao } from '@/entities/configuracao.entity.js';

const EMPRESA_ID = 1;
const MIME_PERMITIDOS = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
const LOGO_MAX_BYTES = 512 * 1024; // 512 KB

function toDTO(c: Configuracao): ConfiguracaoDTO {
  return {
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia,
    cnpj: c.cnpj,
    endereco: c.endereco,
    telefone: c.telefone,
    logoDataUri: c.logoDataUri,
    minutosValidacaoFuncionalidade: c.minutosValidacaoFuncionalidade ?? 120,
    atualizadoEm: c.atualizadoEm.toISOString(),
  };
}

export function buildParametrosService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(Configuracao);

  /** Carrega a linha única; cria com defaults se (por algum motivo) faltar. */
  async function carregar(): Promise<Configuracao> {
    let c = await repo.findOne({ where: { empresaId: EMPRESA_ID } });
    if (!c) {
      c = repo.create({ empresaId: EMPRESA_ID, razaoSocial: 'Viação Pioneira Ltda', nomeFantasia: 'Viação Pioneira' });
      await repo.save(c);
    }
    return c;
  }

  /** Valida o data-URI do logo (formato, mime e tamanho). Lança 400 se inválido. */
  function validarLogo(dataUri: string): void {
    const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri);
    if (!m) throw fastify.httpErrors.badRequest('Logo inválido: envie uma imagem em data-URI base64.');
    const mime = m[1]!.toLowerCase();
    if (!MIME_PERMITIDOS.includes(mime)) {
      throw fastify.httpErrors.badRequest('Formato não suportado — use PNG, JPG, SVG ou WebP.');
    }
    const bytes = Math.floor((m[2]!.length * 3) / 4);
    if (bytes > LOGO_MAX_BYTES) throw fastify.httpErrors.badRequest('Logo acima do limite de 512 KB.');
  }

  return {
    async obter(): Promise<ConfiguracaoDTO> {
      return toDTO(await carregar());
    },

    /** Subconjunto público (branding) — usado sem auth em login/header. */
    async branding(): Promise<ConfiguracaoBranding> {
      const c = await carregar();
      return {
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        logoDataUri: c.logoDataUri,
        minutosValidacaoFuncionalidade: c.minutosValidacaoFuncionalidade ?? 120,
      };
    },

    async atualizar(body: AtualizarConfiguracaoBody, usuarioId: string): Promise<ConfiguracaoDTO> {
      const c = await carregar();
      if (body.razaoSocial !== undefined) c.razaoSocial = body.razaoSocial.trim();
      if (body.nomeFantasia !== undefined) c.nomeFantasia = body.nomeFantasia?.trim() || null;
      if (body.cnpj !== undefined) c.cnpj = body.cnpj?.trim() || null;
      if (body.endereco !== undefined) c.endereco = body.endereco?.trim() || null;
      if (body.telefone !== undefined) c.telefone = body.telefone?.trim() || null;
      if (body.minutosValidacaoFuncionalidade !== undefined) c.minutosValidacaoFuncionalidade = body.minutosValidacaoFuncionalidade;
      c.atualizadoPor = usuarioId;
      await repo.save(c);
      fastify.log.info({ usuarioId }, '[parametros] dados da empresa atualizados');
      return toDTO(c);
    },

    /** Define ou remove (null) o logo. */
    async atualizarLogo(logoDataUri: string | null, usuarioId: string): Promise<ConfiguracaoDTO> {
      if (logoDataUri !== null) validarLogo(logoDataUri);
      const c = await carregar();
      c.logoDataUri = logoDataUri;
      c.atualizadoPor = usuarioId;
      await repo.save(c);
      fastify.log.info({ usuarioId, removido: logoDataUri === null }, '[parametros] logo atualizado');
      return toDTO(c);
    },
  };
}

export type ParametrosService = ReturnType<typeof buildParametrosService>;
