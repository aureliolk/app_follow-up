import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

// Schema para validar o corpo da requisição
const emailCheckSchema = z.object({
  email: z.string().email('Formato de email inválido'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = emailCheckSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: 'Email inválido', errors: validation.error.errors },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Verificar se o usuário existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }, // Selecionar apenas o ID é suficiente
    });

    return NextResponse.json({ exists: !!existingUser }); // Retorna true se existir, false caso contrário

  } catch (error) {
    if (error instanceof SyntaxError) { // Erro ao parsear JSON
        return NextResponse.json({ message: 'Corpo da requisição inválido' }, { status: 400 });
    }
    console.error('[API Check Email] Erro ao verificar email:', error);
    return NextResponse.json(
      { message: 'Erro interno ao verificar email' },
      { status: 500 }
    );
  }
} 