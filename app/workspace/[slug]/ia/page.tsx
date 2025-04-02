import AISettingsForm from "./components/AISettingsForm";

export default function Ia() {
    return (
        <div className="p-4 md:p-6">
            <div className="flex flex-col justify-between items-start mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">IA</h1>
                    <p className="text-muted-foreground text-sm">Gerencie sua IA</p>
                </div>

                <AISettingsForm />
            </div>
        </div>
    )
}