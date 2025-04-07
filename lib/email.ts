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
}

/**
 * Envia um email de convite para um workspace.
 */
export async function sendInvitationEmail({
  to,
  token,
  workspaceName,
}: SendInvitationEmailParams): Promise<boolean> {
  // Construir o link de convite - Certifique-se que NEXT_PUBLIC_APP_URL está no seu .env!
  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${token}`;
  const senderEmail = process.env.MAILER_SENDER_EMAIL || 'contato@lumibot.com.br';

  const mailOptions = {
    from: `"${workspaceName}" <${senderEmail}>`, // Remetente com nome
    to: to, // Destinatário
    subject: `Convite para participar do workspace ${workspaceName}`, // Assunto
    text: `Olá,\n\nVocê foi convidado para participar do workspace "${workspaceName}".\n\nClique no link abaixo para aceitar o convite (válido por 7 dias):\n${inviteLink}\n\nSe você não esperava este convite, pode ignorar este email.\n\nAtenciosamente,\nA Equipe ${workspaceName}`,
    // Alternativamente, use HTML para um email mais formatado:
    // html: `<p>Olá,</p><p>Você foi convidado para participar do workspace <strong>${workspaceName}</strong>.</p><p>Clique no botão abaixo para aceitar o convite (válido por 7 dias):</p><a href="${inviteLink}" style="...">Aceitar Convite</a><p>Se você não esperava este convite, pode ignorar este email.</p><p>Atenciosamente,<br/>A Equipe ${workspaceName}</p>`
  };

  try {
    console.log(`[Email] Tentando enviar convite para ${to} via ${senderEmail}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Convite enviado com sucesso. Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Email] Erro ao enviar convite:', error);
    return false; // Retorna false em caso de erro
  }
} 