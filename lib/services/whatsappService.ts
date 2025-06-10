export interface WhatsAppMessage {
  to: string;
  message: string;
}

export const sendWhatsAppMessage = async (message: WhatsAppMessage): Promise<void> => {
  // TODO: Implement actual WhatsApp integration
  console.log(`Sending WhatsApp message to ${message.to}: ${message.message}`);
  return Promise.resolve();
};