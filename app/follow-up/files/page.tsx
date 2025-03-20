"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CsvImportForm } from "../campaigns/_components/CsvImportForm"
import { FileManager } from "../campaigns/_components/FileManager"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function FilesPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleImportSuccess = () => {
    // Trigger refresh of file list
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Arquivos</CardTitle>
          <CardDescription>Importe, visualize e gerencie arquivos para suas campanhas de follow-up</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <CsvImportForm
            onImportSuccess={handleImportSuccess}
            title="Importar CSV"
            description="Faça upload de arquivos CSV para importar dados de campanhas ou clientes"
          />
        </div>

        <div className="md:col-span-2">
          <Tabs defaultValue="csv">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="csv">Arquivos CSV</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="attachments">Anexos</TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="mt-4">
              <FileManager
                bucket="csv-imports"
                title="Arquivos CSV"
                description="Gerenciar arquivos CSV importados"
                refreshTrigger={refreshTrigger}
              />
            </TabsContent>

            <TabsContent value="templates" className="mt-4">
              <FileManager
                bucket="campaign-templates"
                title="Templates de Campanha"
                description="Gerenciar templates de mensagens para campanhas"
                refreshTrigger={refreshTrigger}
              />
            </TabsContent>

            <TabsContent value="attachments" className="mt-4">
              <FileManager
                bucket="message-attachments"
                title="Anexos de Mensagens"
                description="Gerenciar arquivos anexados às mensagens"
                refreshTrigger={refreshTrigger}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

