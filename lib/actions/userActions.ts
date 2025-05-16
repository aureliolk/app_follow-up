'use server';

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { hash, compare } from 'bcryptjs'; // Importar bcryptjs para lidar com senhas
import { z } from 'zod'; // Importar Zod para validação (recomendado)

// Define a interface para os dados que podem ser atualizados no perfil geral
interface UpdateUserProfileData {
  name?: string | null;
  image?: string | null; // Adicionar image como exemplo de outro campo
}

// Schema Zod para validar dados de atualização de perfil
const UpdateUserProfileSchema = z.object({
  name: z.string().min(1, "O nome não pode ser vazio.").max(255).nullable().optional(),
  image: z.string().url("URL de imagem inválida.").nullable().optional(),
  // Adicionar validação para outros campos aqui
});

export async function updateUserProfile(data: UpdateUserProfileData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false, message: 'Não autenticado.' };
  }

  const userId = session.user.id;

  try {
    // Validar os dados de entrada com Zod
    const validatedData = UpdateUserProfileSchema.safeParse(data);

    if (!validatedData.success) {
      // Retorna os erros de validação
      return { success: false, message: 'Dados inválidos.', errors: validatedData.error.formErrors.fieldErrors };
    }

    const updateData = validatedData.data;

    if (Object.keys(updateData).length === 0) {
       return { success: false, message: 'Nenhum dado para atualizar.' };
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData as any, // Zod garante que os dados são seguros para o schema Prisma, mas TS pode precisar de `as any` dependendo da versão
      select: { id: true, name: true, email: true, image: true }, // Incluir imagem no retorno
    });

    // Opcional: Revalidar caminhos que exibem o nome ou imagem do usuário
    // revalidatePath('/');
    // revalidatePath('/dashboard'); 

    console.log(`Perfil do usuário ${userId} atualizado:`, updatedUser);

    return { success: true, message: 'Perfil atualizado com sucesso!', user: updatedUser };

  } catch (error) {
    console.error('Erro ao atualizar perfil do usuário:', error);
    // Tratar erros específicos do Prisma se necessário
    return { success: false, message: 'Erro interno ao atualizar perfil.' };
  }
}

// Define a interface para os dados de alteração de senha
interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

// Schema Zod para validar dados de alteração de senha
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "A senha atual não pode ser vazia."),
  newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
  // Não validar confirmNewPassword aqui, apenas na UI antes de chamar a action
});

export async function changePassword(data: ChangePasswordData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { success: false, message: 'Não autenticado.' };
  }

  const userId = session.user.id;

  try {
    // Validar os dados de entrada com Zod
    const validatedData = ChangePasswordSchema.safeParse(data);

    if (!validatedData.success) {
      // Retorna os erros de validação
      return { success: false, message: 'Dados inválidos.', errors: validatedData.error.formErrors.fieldErrors };
    }

    const { currentPassword, newPassword } = validatedData.data;

    // 1. Buscar o usuário para verificar a senha atual
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true }, // Seleciona apenas a senha hash
    });

    if (!user || !user.password) {
      // Cenário improvável se o usuário estiver autenticado via credentials, mas seguro
       return { success: false, message: 'Usuário ou senha atual não encontrada no sistema.' };
    }

    // 2. Comparar a senha atual fornecida com a senha hash no DB
    const isPasswordValid = await compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return { success: false, message: 'Senha atual incorreta.' };
    }

    // 3. Gerar hash da nova senha
    const hashedNewPassword = await hash(newPassword, 10); // Use um salt round adequado (10 é um bom padrão)

    // 4. Atualizar a senha no banco de dados
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    // Opcional: Invalidar sessões antigas ou emitir evento de segurança

    console.log(`Senha do usuário ${userId} alterada com sucesso.`);

    return { success: true, message: 'Senha alterada com sucesso!' };

  } catch (error) {
    console.error('Erro ao alterar senha do usuário:', error);
    // Tratar erros específicos do Prisma ou bcrypt
    return { success: false, message: 'Erro interno ao alterar senha.' };
  }
}

// TODO: Adicionar outras Server Actions relacionadas a usuários aqui 