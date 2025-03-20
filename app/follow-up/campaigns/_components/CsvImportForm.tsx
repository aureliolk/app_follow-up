"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, FileUp, Loader2 } from "lucide-react"
import storageService from "../../_services/storageService"
import { useToast } from "@/components/ui/use-toast"

interface CsvImportFormProps {
  onImportSuccess?: (filePath: string) => void
  title?: string
  description?: string
}

export function CsvImportForm({
  onImportSuccess,
  title = "Importar CSV",
  description = "Faça upload de um arquivo CSV para importar dados",
}: CsvImportFormProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith(".csv")) {
        setError("O arquivo deve ser do tipo CSV")
        setFile(null)
        return
      }

      // Validate file size (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError("O arquivo deve ter no máximo 5MB")
        setFile(null)
        return
      }

      setFile(selectedFile)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      setError("Selecione um arquivo para fazer upload")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      console.log("Iniciando upload do CSV no componente CsvImportForm...");
      
      // Verificar se o arquivo ainda é válido
      if (!file) {
        throw new Error("Arquivo não selecionado");
      }
      
      console.log("Arquivo para upload:", {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      // Tentar upload
      const filePath = await storageService.uploadCsvImport(file);
      console.log("Upload retornou sucesso com filePath:", filePath);

      toast({
        title: "Upload concluído",
        description: "O arquivo CSV foi importado com sucesso",
      });

      if (onImportSuccess) {
        console.log("Chamando callback onImportSuccess com filePath:", filePath);
        onImportSuccess(filePath);
      }

      // Reset form
      setFile(null);
      const fileInput = document.getElementById("csvFile") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
    } catch (err: any) {
      console.error("Erro detalhado durante upload CSV no componente:", err);
      
      // Tentar obter mensagem de erro mais detalhada
      let errorMessage = "Erro ao fazer upload do arquivo";
      if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        errorMessage = JSON.stringify(err);
      }
      
      console.error("Mensagem de erro formatada:", errorMessage);
      setError(errorMessage);

      toast({
        variant: "destructive",
        title: "Erro no upload",
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="csvFile">Arquivo CSV</Label>
            <Input id="csvFile" type="file" accept=".csv" onChange={handleFileChange} disabled={isUploading} />
            {file && (
              <p className="text-sm text-muted-foreground">
                Arquivo selecionado: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={!file || isUploading} className="w-full">
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <FileUp className="mr-2 h-4 w-4" />
                Importar CSV
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

