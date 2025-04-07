import nodemailer from 'nodemailer';

// Configuração do transporter Nodemailer usando variáveis de ambiente
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_ADDRESS, // br.brasil104-1070.com.br
  port: parseInt(process.env.SMTP_PORT || '587'), // 587
  secure: process.env.SMTP_SSL === 'true', // false (porque a porta é 587 e usamos STARTTLS)
  requireTLS: true, // Força STARTTLS
  auth: {
    user: process.env.SMTP_USERNAME, // contato@lumibot.com.br
    pass: process.env.SMTP_PASSWORD, // Sua senha
  },
  // Adicionar isto se o servidor tiver certificado auto-assinado ou inválido (menos seguro, evite se possível)
  // tls: {
  //   rejectUnauthorized: false 
  // }
});

interface SendInvitationEmailParams {
  to: string;
  token: string;
  workspaceName: string;
  // Adicionar role se quiser incluí-la no email:
  // role: string;
}

/**
 * Envia um email de convite estilizado para um workspace.
 */
export async function sendInvitationEmail({
  to,
  token,
  workspaceName,
  // role // Descomentar se adicionar
}: SendInvitationEmailParams): Promise<boolean> {
  const inviteLink = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/invite/${token}`;
  const senderEmail = process.env.MAILER_SENDER_EMAIL || 'contato@lumibot.com.br';

  // <<< Template HTML com Estilos Inline >>>
  const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite para ${workspaceName}</title>
  <style>
    /* Estilos básicos para garantir a leitura */
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #111827; color: #F9FAFB; }
    .container { max-width: 600px; margin: 20px auto; background-color: #1F2937; border: 1px solid #374151; border-radius: 8px; overflow: hidden; }
    .content { padding: 30px; color: #F9FAFB; }
    .header { text-align: center; margin-bottom: 20px; font-size: 24px; font-weight: bold; }
    .text-muted { color: #9CA3AF; font-size: 14px; }
    .button { display: inline-block; background-color: #F54900; color: #FFFFFF; padding: 12px 25px; text-align: center; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; font-size: 12px; color: #6B7280; padding: 20px; border-top: 1px solid #374151; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #111827; color: #F9FAFB;">
  <div class="container" style="max-width: 600px; margin: 20px auto; background-color: #1F2937; border: 1px solid #374151; border-radius: 8px; overflow: hidden;">
    <div class="content" style="padding: 30px; color: #F9FAFB;">
      <div class="header" style="text-align: center; margin-bottom: 20px; font-size: 24px; font-weight: bold;">
        Convite para Workspace
      </div>
      <p style="font-size: 16px; line-height: 1.5;">
        Olá,
      </p>
      <p style="font-size: 16px; line-height: 1.5;">
        Você foi convidado para participar do workspace <strong>${workspaceName}</strong>.
        ${/* Adicionar a role aqui se for passada: ` como <strong>${role}</strong>.` */ ''}
      </p>
      <p style="text-align: center;">
        <a href="${inviteLink}" class="button" style="display: inline-block; background-color: #F54900; color: #FFFFFF !important; padding: 12px 25px; text-align: center; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">Aceitar Convite</a>
      </p>
      <p class="text-muted" style="color: #9CA3AF; font-size: 14px; line-height: 1.5;">
        Este link de convite é válido por 7 dias. Se você não esperava este convite, pode ignorar este email com segurança.
      </p>
    </div>
    <div class="footer" style="text-align: center; font-size: 12px; color: #6B7280; padding: 20px; border-top: 1px solid #374151;">
      Enviado por ${workspaceName}
    </div>
  </div>
</body>
</html>
`;

  // <<< Texto simples como fallback >>>
  const emailText = `Olá,\n\nVocê foi convidado para participar do workspace "${workspaceName}".\n\nClique no link abaixo para aceitar o convite (válido por 7 dias):\n${inviteLink}\n\nSe você não esperava este convite, pode ignorar este email.\n\nAtenciosamente,\nA Equipe ${workspaceName}`;

  const mailOptions = {
    from: `"${workspaceName}" <${senderEmail}>`, // Remetente com nome
    to: to,
    subject: `Convite para participar do workspace ${workspaceName}`,
    text: emailText, // Fallback de texto simples
    html: emailHtml, // <<< Usar o template HTML
  };

  try {
    console.log(`[Email] Tentando enviar convite HTML para ${to} via ${senderEmail}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Convite HTML enviado com sucesso. Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Email] Erro ao enviar convite HTML:', error);
    return false;
  }
} 