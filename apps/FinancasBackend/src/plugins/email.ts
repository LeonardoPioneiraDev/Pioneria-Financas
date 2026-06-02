import fp from 'fastify-plugin';
import nodemailer, { type Transporter } from 'nodemailer';
import { buildEmailTemplates, type EmailTemplate } from '@/shared/email/templates.js';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailService {
  enviar: (params: SendEmailParams) => Promise<void>;
  enviarConvitePrimeiroAcesso: (params: { to: string; nomeCompleto: string; linkAtivacao: string }) => Promise<void>;
  enviarRecuperacaoSenha: (params: { to: string; nomeCompleto: string; linkRecuperacao: string }) => Promise<void>;
  verificar: () => Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    email: EmailService;
  }
}

export const emailPlugin = fp(
  async (fastify) => {
    const { smtp } = fastify.config;
    const transporter: Transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user && smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
    });

    try {
      await transporter.verify();
      fastify.log.info({ host: smtp.host, port: smtp.port }, 'Conexao SMTP verificada');
    } catch (err) {
      fastify.log.warn({ err, host: smtp.host, port: smtp.port }, 'Falha ao verificar SMTP - envio de email pode falhar');
    }

    const templates = buildEmailTemplates(fastify.config);
    const from = `"${smtp.fromName}" <${smtp.fromEmail}>`;

    const send = async ({ to, subject, html, text }: SendEmailParams): Promise<void> => {
      const info = await transporter.sendMail({ from, to, subject, html, text });
      fastify.log.info({ to, subject, messageId: info.messageId }, 'Email enviado');
    };

    const enviarTemplate = async (to: string, nomeCompleto: string, template: EmailTemplate): Promise<void> => {
      await send({
        to,
        subject: template.subject,
        html: template.html.replace(/{{nomeCompleto}}/g, nomeCompleto),
        text: template.text?.replace(/{{nomeCompleto}}/g, nomeCompleto),
      });
    };

    const service: EmailService = {
      enviar: send,
      async enviarConvitePrimeiroAcesso({ to, nomeCompleto, linkAtivacao }) {
        const template = templates.convitePrimeiroAcesso(linkAtivacao);
        await enviarTemplate(to, nomeCompleto, template);
      },
      async enviarRecuperacaoSenha({ to, nomeCompleto, linkRecuperacao }) {
        const template = templates.recuperacaoSenha(linkRecuperacao);
        await enviarTemplate(to, nomeCompleto, template);
      },
      async verificar() {
        await transporter.verify();
      },
    };

    fastify.decorate('email', service);

    fastify.addHook('onClose', async () => {
      transporter.close();
    });
  },
  { name: 'email', dependencies: ['config'] },
);
