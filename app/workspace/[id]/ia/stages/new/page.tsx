'use client';

import { useParams, useRouter } from 'next/navigation';
import StageForm from '../components/StageForm'; // Adjust path if necessary

export default function NewAIStagePage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const router = useRouter();

    // Function to handle successful stage creation
    const handleSuccess = () => {
        // Navigate back to the stages list page after successful creation
        router.push(`/workspace/${workspaceId}/ia/stages`);
    };

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold mb-6">Adicionar Novo Estágio de IA</h1>
            {/* Render the StageForm component */}
            <StageForm workspaceId={workspaceId} onSuccess={handleSuccess} />
        </div>
    );
} 