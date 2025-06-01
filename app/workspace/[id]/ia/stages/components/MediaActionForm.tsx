'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AIStageActionTypeEnum, SendTextMessageConfig, SendMediaConfig, SendDocumentConfig } from '@/lib/types/ai-stages';

interface MediaActionFormProps {
    actionType: AIStageActionTypeEnum;
    config: SendTextMessageConfig | SendMediaConfig | SendDocumentConfig;
    onUpdate: (newConfig: SendTextMessageConfig | SendMediaConfig | SendDocumentConfig) => void;
}

export default function MediaActionForm({ actionType, config, onUpdate }: MediaActionFormProps) {
    const handleConfigChange = (key: string, value: string) => {
        onUpdate({ ...config, [key]: value });
    };

    return (
        <div className="space-y-4">
            {actionType === AIStageActionTypeEnum.SEND_TEXT_MESSAGE && (
                <div>
                    <Label htmlFor="message">Mensagem de Texto</Label>
                    <Textarea
                        id="message"
                        value={(config as SendTextMessageConfig).message || ''}
                        onChange={(e) => handleConfigChange('message', e.target.value)}
                        placeholder="Digite a mensagem de texto a ser enviada."
                        rows={3}
                    />
                </div>
            )}

            {(actionType === AIStageActionTypeEnum.SEND_VIDEO || 
              actionType === AIStageActionTypeEnum.SEND_IMAGE || 
              actionType === AIStageActionTypeEnum.SEND_DOCUMENT) && (
                <>
                    <div>
                        <Label htmlFor="mediaUrl">URL da Mídia</Label>
                        <Input
                            id="mediaUrl"
                            value={(config as SendMediaConfig).mediaUrl || ''}
                            onChange={(e) => handleConfigChange('mediaUrl', e.target.value)}
                            placeholder="Ex: https://example.com/media.mp4"
                        />
                    </div>
                    <div>
                        <Label htmlFor="caption">Legenda (Opcional)</Label>
                        <Input
                            id="caption"
                            value={(config as SendMediaConfig).caption || ''}
                            onChange={(e) => handleConfigChange('caption', e.target.value)}
                            placeholder="Ex: Confira nosso novo produto!"
                        />
                    </div>
                </>
            )}

            {actionType === AIStageActionTypeEnum.SEND_DOCUMENT && (
                <div>
                    <Label htmlFor="fileName">Nome do Arquivo (para Documentos)</Label>
                    <Input
                        id="fileName"
                        value={(config as SendDocumentConfig).fileName || ''}
                        onChange={(e) => handleConfigChange('fileName', e.target.value)}
                        placeholder="Ex: relatorio_vendas.pdf"
                    />
                </div>
            )}
        </div>
    );
}
