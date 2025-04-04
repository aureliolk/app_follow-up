import { CoreMessage } from 'ai';
interface ChatRequestPayload {
    messages: CoreMessage[];
    systemPrompt?: string;
}
export declare function generateChatCompletion({ messages, systemPrompt }: ChatRequestPayload): Promise<string>;
export declare function generateChatCompletionGoogle({ messages, systemPrompt }: ChatRequestPayload): Promise<string>;
export {};
//# sourceMappingURL=chatService.d.ts.map