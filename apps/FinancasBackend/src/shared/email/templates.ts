import type { EnvironmentConfig } from '@/config/environment.js';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

const wrapper = (content: string, appUrl: string): string => `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>Pioneira Financas</title>
</head>
<body style="margin:0;padding:0;background:linear-gradient(135deg,#fffdf5,#fef0d4 50%,#feeccc);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px -10px rgba(251,204,44,0.25);border:2px solid rgba(251,204,44,0.2);">
        <tr><td style="padding:32px 40px;background:linear-gradient(135deg,#fbcc2c,#ecd43c);text-align:center;">
          <h1 style="margin:0;color:#3a3110;font-size:22px;letter-spacing:.5px;">Viacao Pioneira</h1>
          <p style="margin:6px 0 0;color:#5a4e1f;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Sistema Financeiro</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">${content}</td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:12px;">
          Esta mensagem foi enviada automaticamente. Em caso de duvida, fale com o TI.<br/>
          <a href="${appUrl}" style="color:#a89642;">${appUrl}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const botao = (href: string, label: string): string => `
<p style="text-align:center;margin:28px 0;">
  <a href="${href}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#fbcc2c,#ecd43c);color:#3a3110;font-weight:600;text-decoration:none;border-radius:12px;box-shadow:0 4px 12px rgba(251,204,44,0.4);">
    ${label}
  </a>
</p>`;

export function buildEmailTemplates(config: EnvironmentConfig): {
  convitePrimeiroAcesso: (link: string) => EmailTemplate;
  recuperacaoSenha: (link: string) => EmailTemplate;
} {
  return {
    convitePrimeiroAcesso(link) {
      const content = `
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Bem-vindo(a), {{nomeCompleto}}</h2>
        <p style="line-height:1.6;color:#374151;">Sua conta foi criada no <strong>Sistema Financeiro Pioneira</strong>. Para acessar, defina sua senha clicando no botao abaixo:</p>
        ${botao(link, 'Definir minha senha')}
        <p style="color:#6b7280;font-size:13px;line-height:1.6;">O link expira em 48 horas. Se voce nao reconhece este convite, ignore esta mensagem.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">Caso o botao nao funcione, copie e cole este endereco no navegador:<br/><span style="word-break:break-all;color:#a89642;">${link}</span></p>
      `;
      return {
        subject: '[Pioneira Financas] Defina sua senha de acesso',
        html: wrapper(content, config.app.url),
        text: `Ola, {{nomeCompleto}}.\n\nSua conta foi criada no Sistema Financeiro Pioneira. Defina sua senha pelo link:\n${link}\n\nO link expira em 48 horas.`,
      };
    },
    recuperacaoSenha(link) {
      const content = `
        <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">Recuperacao de senha</h2>
        <p style="line-height:1.6;color:#374151;">Ola, {{nomeCompleto}}. Recebemos uma solicitacao para redefinir sua senha no <strong>Sistema Financeiro Pioneira</strong>.</p>
        ${botao(link, 'Redefinir senha')}
        <p style="color:#6b7280;font-size:13px;line-height:1.6;">O link expira em 1 hora. Se voce nao solicitou a redefinicao, ignore esta mensagem - sua senha permanece inalterada.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">Caso o botao nao funcione, copie e cole este endereco no navegador:<br/><span style="word-break:break-all;color:#a89642;">${link}</span></p>
      `;
      return {
        subject: '[Pioneira Financas] Redefinir senha',
        html: wrapper(content, config.app.url),
        text: `Ola, {{nomeCompleto}}.\n\nUma redefinicao de senha foi solicitada. Acesse: ${link}\nO link expira em 1 hora.`,
      };
    },
  };
}
