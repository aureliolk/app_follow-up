import { WhatsappTemplate, WhatsappTemplateCategory, WhatsappTemplateStatus } from '../types/whatsapp';
import axios from 'axios'; // Assuming axios is available for HTTP requests

const GRAPH_API_VERSION = 'v23.0'; // Or the latest version you are targeting
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class WhatsappServiceManageTemplate {
  private wabaId: string;
  private accessToken: string;

  constructor(wabaId: string, accessToken: string) {
    this.wabaId = wabaId;
    this.accessToken = accessToken;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  /**
   * Submits a new WhatsApp template for approval.
   * @param templateData The data for the new template.
   * @returns A promise that resolves with the result of the submission.
   */
  async createTemplate(templateData: WhatsappTemplate): Promise<any> {
    const url = `${BASE_URL}/${this.wabaId}/message_templates`;
    try {
      const response = await axios.post(url, templateData, { headers: this.getHeaders() });
      console.log('Template submission response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error submitting template:', error.response?.data || error.message);
      throw new Error(`Failed to create template: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Retrieves a list of existing WhatsApp templates.
   * @param filters Optional filters for category, language, name, status.
   * @returns A promise that resolves with an array of WhatsappTemplate objects.
   */
  async getTemplates(filters?: {
    category?: WhatsappTemplateCategory;
    language?: string;
    name?: string;
    status?: WhatsappTemplateStatus;
  }): Promise<WhatsappTemplate[]> {
    const url = `${BASE_URL}/${this.wabaId}/message_templates`;
    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        params: filters,
      });
      console.log('Retrieved templates:', response.data);
      return response.data.data;
    } catch (error: any) {
      console.error('Error retrieving templates:', error.response?.data || error.message);
      throw new Error(`Failed to retrieve templates: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Updates an existing WhatsApp template.
   * NOTE: The WhatsApp Business Management API does not directly support updating templates via this endpoint.
   * Updates typically involve deleting the old template and creating a new one, or using the Meta Business Manager UI.
   * This method will throw an error to indicate this limitation.
   * @param templateId The ID of the template to update.
   * @param updates The updates to apply to the template.
   * @returns A promise that resolves with the result of the update.
   */
  async updateTemplate(templateId: string, updates: Partial<WhatsappTemplate>): Promise<any> {
    console.warn(`Direct update of WhatsApp templates via API is not supported by this endpoint.
    Consider deleting and recreating the template, or using the Meta Business Manager UI.
    Attempted to update template ID: ${templateId} with data:`, updates);
    throw new Error('Direct update of WhatsApp templates via API is not supported by this endpoint.');
  }

  /**
   * Deletes a WhatsApp template.
   * @param templateName The name of the template to delete.
   * @returns A promise that resolves with the result of the deletion.
   */
  async deleteTemplate(templateName: string): Promise<any> {
    const url = `${BASE_URL}/${this.wabaId}/message_templates`;
    try {
      const response = await axios.delete(url, {
        headers: this.getHeaders(),
        params: { name: templateName },
      });
      console.log('Template deletion response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error deleting template:', error.response?.data || error.message);
      throw new Error(`Failed to delete template: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}