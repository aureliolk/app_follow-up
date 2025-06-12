import { task } from "@trigger.dev/sdk/v3";
import { sendAIResponse } from "@/lib/services/new_sendAiResponse";



// Task individual para enviar lembrete via WhatsApp
export const sendMsgForIa = task({
  id: "send-msg-for-ia",
  run: async (payload: {
    aiResponse: string;
    workspaceId: string;
    newMessageId: string;
  }) => {
    const { aiResponse,newMessageId, workspaceId } = payload;

    try {
      const response = await sendAIResponse({
        aiResponse,
        newMessageId,
        workspaceId
      })



      return { success: true };
    } catch (error) {
      console.error(`Failed to send WhatsApp`, error);
      throw error;
    }
  },
});
