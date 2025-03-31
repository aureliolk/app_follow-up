// app/test-tailwind/page.tsx
export default function TestTailwindPage() {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-10 bg-background">
        <h1 className="text-2xl text-foreground mb-4">Página de Teste Tailwind</h1>
  
        <div className="space-y-4">
          {/* Teste com bg-primary */}
          <div className="p-4 border border-border rounded bg-primary text-primary-foreground">
            Este div deve ter fundo LARANJA (bg-primary).
          </div>
  
          {/* Teste com bg-secondary */}
          <div className="p-4 border border-border rounded bg-secondary text-secondary-foreground">
            Este div deve ter fundo CINZA (bg-secondary).
          </div>
  
          {/* Teste com cor padrão */}
          <div className="p-4 border border-border rounded bg-blue-500 text-white">
            Este div deve ter fundo AZUL (bg-blue-500).
          </div>
        </div>
      </div>
    );
  }