import { getAIStageById } from '@/lib/actions/aiStageActions';
import StageForm from '../../components/StageForm';
import { notFound, redirect } from 'next/navigation'; // Import redirect

interface EditAIStagePageProps {
    params: { id: string; stageId: string };
}

export default async function EditAIStagePage({ params }: EditAIStagePageProps) {
    // Await params to access properties like id and stageId
    const { id: workspaceId, stageId } = await params;

    // Fetch the stage data
    const stage = await getAIStageById(stageId, workspaceId);

    // If stage not found, render a 404 page
    if (!stage) {
        notFound();
    }

    // Pass stage data to StageForm for initial values.
    // The success redirect logic will be handled inside StageForm (Client Component).
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-6">Editar Estágio: {stage.name}</h1>
            {/* Pass stage data to StageForm for initial values. Remove onSuccess prop */}
            <StageForm workspaceId={workspaceId} initialData={stage} />
        </div>
    );
} 