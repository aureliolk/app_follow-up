import { getAIStages } from '@/lib/actions/aiStageActions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import StageList from './components/StageList';

interface AIStagesPageProps {
    params: { id: string };
}

export default async function AIStagesPage({ params }: AIStagesPageProps) {
    // Await params to access properties like id
    const { id: workspaceId } = await params;
    const stages = await getAIStages(workspaceId);

    return (
        <div className="container mx-auto py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Estágios de IA</h1>
                <Button asChild>
                    <Link href={`/workspace/${workspaceId}/ia/stages/new`}>Criar Novo Estágio</Link>
                </Button>
            </div>

            <StageList stages={stages} workspaceId={workspaceId} />
        </div>
    );
} 