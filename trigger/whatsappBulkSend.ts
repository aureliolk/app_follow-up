import { task } from "@trigger.dev/sdk/v3";
import { sendWhatsappMessage } from "@/lib/channel/whatsappSender";
import { decrypt } from "@/lib";

export const sendWhatsappBulk = task({
  id: "send-whatsapp-bulk",
  run: async (
    payload: {
      contacts: { phone: string; name: string }[];
      message: string;
      intervalMs: number;
      phoneNumberId: string;
      accessToken: string;
    }
  ) => {
    console.log("payload", payload);

    const decryptedAccessToken = decrypt(payload.accessToken);

    
    for (const contact of payload.contacts) {
      const personalized = payload.message.replace("{{nome}}", contact.name);
      await sendWhatsappMessage(
        payload.phoneNumberId,
        contact.phone,
        decryptedAccessToken,
        personalized
      );
      await new Promise((res) => setTimeout(res, payload.intervalMs));
    }
  },
});