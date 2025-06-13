import { task } from "@trigger.dev/sdk/v3";
import { sendAIResponse } from "@/lib/services/new_sendAiResponse";



// Task individual para enviar lembrete via WhatsApp
export const sendMsgForIa = task({
  id: "send-msg-for-ia",
  run: async (payload: {
    messageContentOutput: string;
    workspaceId: string;
    newMessageId: string;
    aiModel: string
  }) => {
    const { messageContentOutput,newMessageId, workspaceId, aiModel } = payload;

    try {
      const response = await sendAIResponse({
        messageContentOutput,
        newMessageId,
        workspaceId,
        aiModel
      })



      return { success: true };
    } catch (error) {
      console.error(`Failed to send WhatsApp`, error);
      throw error;
    }
  },
});
