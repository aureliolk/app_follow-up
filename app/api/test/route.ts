import { type NextRequest, NextResponse } from 'next/server';
import { sequenceStepQueue } from '@/lib/queues/sequenceStepQueue'; // Importar a fila
import { z } from 'zod';

// Schema para validar o corpo da requisição POST
const testJobSchema = z.object({
  followUpId: z.string().uuid({ message: "followUpId inválido (deve ser UUID)" }),
  stepRuleId: z.string().uuid({ message: "stepRuleId inválido (deve ser UUID)" }),
  workspaceId: z.string().uuid({ message: "workspaceId inválido (deve ser UUID)" }),
  delayMs: z.number().int().min(0).optional().default(0), // Delay em milissegundos, padrão 0
});

export async function POST(request: NextRequest) {
  console.log('[API TEST] Recebida requisição POST para /api/test');

  try {
    const body = await request.json();
    console.log('[API TEST] Corpo da requisição:', body);

    // Validar o corpo
    const validationResult = testJobSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[API TEST] Erro de validação:', validationResult.error.flatten());
      return NextResponse.json(
        { success: false, message: "Dados inválidos", errors: validationResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { followUpId, stepRuleId, workspaceId, delayMs } = validationResult.data;

    // Preparar dados e opções do job
    const jobData = { followUpId, stepRuleId, workspaceId };
    const jobOptions = {
        delay: delayMs, 
        jobId: `test_seq_${followUpId}_step_${stepRuleId}_${Date.now()}`, // ID único para teste
        removeOnComplete: true, // Limpar job após sucesso
        removeOnFail: 10,       // Manter por 10 segundos se falhar
        // Tentar apenas 1 vez para teste? Ou usar padrão da fila?
        // attempts: 1 
    };

    console.log(`[API TEST] Adicionando job à sequenceStepQueue com dados:`, jobData, `e opções:`, jobOptions);
    
    // Adicionar job à fila
    await sequenceStepQueue.add('processSequenceStep', jobData, jobOptions);

    console.log(`[API TEST] Job adicionado com sucesso para FollowUp ${followUpId}, Regra ${stepRuleId}.`);

    return NextResponse.json({ 
      success: true, 
      message: 'Job de teste adicionado à fila sequenceStepQueue com sucesso!', 
      jobData: jobData, 
      jobOptions: jobOptions
    });

  } catch (error: any) {
    console.error('[API TEST] Erro ao processar requisição /api/test:', error);
    let errorMessage = 'Erro interno do servidor.';
    if (error instanceof SyntaxError) { // Erro de parse do JSON
        errorMessage = 'Corpo da requisição inválido (não é JSON válido).';
        return NextResponse.json({ success: false, message: errorMessage }, { status: 400 });
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}

// Você pode adicionar um handler GET para simplesmente verificar se a rota está funcionando
export async function GET() {
    return NextResponse.json({ message: 'Endpoint de teste está ativo. Use POST para adicionar jobs.' });
}




// export async function POST(req: NextRequest) {
//     try {
//       let userMessageContent = "Me diga uma curiosidade sobre o Brasil."; // Mensagem padrão
  
//       try {
//         const body = await req.json();
//         if (body && typeof body.message === 'string') {
//           userMessageContent = body.message;
//         }
//       } catch (error) {
//         // Se não houver corpo ou não for JSON, usa a mensagem padrão
//         console.log("Nenhuma mensagem válida encontrada no corpo da requisição, usando padrão.");
//       }
  
//       // Monta as mensagens no formato esperado
//       const messages: CoreMessage[] = [{ role: 'user', content: "" }];
      
//       // Chama o modelo diretamente
//       const aiResponseText = await generateChatCompletion({
//           messages,
//           systemPrompt: "Vc e uma especialista em marketing digital e precisa reengajar o cliente para que ele compre o produto, o dono do comercio pediu deixou a seguinte instruçåo ==> ${Primeiro contato do cliente depois de 30 minutos}",
//           modelId: "gpt-4o",
//           nameIa: "Lumibot",
//           conversationId: "31fa7093-6590-4d02-8137-7d22a8c1dbbc", // Usar Non-null assertion pois verificamos activeConversation
//           workspaceId: "31fa7093-6590-4d02-8137-7d22a8c1dbbc",
//           clientName: "Nebs"
//         });
  
//       // Retorna a resposta da IA
//       return NextResponse.json({ response: aiResponseText }, { status: 200 });
  
//     } catch (error) {
//       console.error('Erro na rota /api/ai:', error);
//       const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido';
//       return NextResponse.json(
//         { error: 'Falha ao gerar a conclusão do chat', details: errorMessage },
//         { status: 500 }
//       );
//     }
//   }
