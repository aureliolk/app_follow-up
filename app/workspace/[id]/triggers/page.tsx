// app/workspace/[id]/triggers/page.tsx
import { redirect } from 'next/navigation';
// import { getServerSession } from 'next-auth'; // REMOVED
// import { authOptions } from '@/lib/auth/auth-options'; // REMOVED
import { createClient } from '@/lib/supabase/server'; // ADDED
import { cookies } from 'next/headers'; // ADDED
import { prisma } from '@/lib/db'; // Restore prisma import
import { checkPermission } from '@/lib/permissions';
// import TriggerList from './components/TriggerList'; // Remove old import
import AiFollowUpRulesClient from './components/ai-followup-rules-client'; // Import the new client component

// Define type matching the serialized data passed to client
interface SerializedRule {
    id: string;
    workspace_id: string;
    delay_milliseconds: string; // BigInt is serialized to string
    message_content: string;
    created_at: Date;
    updated_at: Date;
}

export default async function WorkspaceTriggersPage({ params }: { params: { id: string } }) {
    const workspaceId = params.id;
    // const session = await getServerSession(authOptions); // REMOVED
    const cookieStore = cookies(); // ADDED
    const supabase = createClient(); // Changed from createClient(cookieStore)
    const { data: { user }, error: authError } = await supabase.auth.getUser(); // ADDED

    // if (!session?.user?.id) { // REMOVED
    if (authError || !user) { // UPDATED
        redirect('/login'); // Redirect to login if not authenticated
    }
    // const userId = session.user.id; // REMOVED
    const userId = user.id; // UPDATED

    // Check permission to view this page (e.g., MEMBER)
    const hasPermission = await checkPermission(workspaceId, userId, 'MEMBER');
    if (!hasPermission) {
        redirect('/'); // Redirect to home or an unauthorized page
    }

    // Restore data fetching logic
    let serializedRules: SerializedRule[] = [];
    try {
        const rules = await prisma.workspaceAiFollowUpRule.findMany({
            where: { workspace_id: workspaceId },
            orderBy: { created_at: 'asc' },
        });

        // Convert BigInt to string for serialization
        serializedRules = rules.map(rule => ({
            ...rule,
            delay_milliseconds: rule.delay_milliseconds.toString(),
        }));

    } catch (error) {
        console.error("Error fetching AI follow-up rules for workspace page:", error);
        // Render page with error message if fetching fails
        return (
            <div className="p-6">
                <h1 className="text-2xl font-semibold mb-4">AI Follow-up Triggers</h1>
                <p className="text-red-500">Error loading rules. Please try again later.</p>
            </div>
        );
    }

    // Render the client component with initial data
    return (
        <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">AI Follow-up Triggers</h1>
             <AiFollowUpRulesClient initialRules={serializedRules} workspaceId={workspaceId} /> 
        </div>
    );
}