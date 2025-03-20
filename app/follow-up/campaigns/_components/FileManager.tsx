"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileIcon, Trash2, Download, RefreshCw, Loader2 } from "lucide-react"
import storageService from "../../_services/storageService"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface FileInfo {
  name: string
  path: string
  size: number
}

interface FileManagerProps {
  bucket: string
  folder?: string
  title?: string
  description?: string
  onFileSelect?: (filePath: string) => void
  refreshTrigger?: number
}

export function FileManager({
  bucket,
  folder,
  title = "Arquivos",
  description = "Gerenciar arquivos armazenados",
  onFileSelect,
  refreshTrigger = 0,
}: FileManagerProps) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)
  const { toast } = useToast()

  const loadFiles = async () => {
    setIsLoading(true)
    try {
      const fileList = await storageService.listFiles(bucket, folder)
      setFiles(fileList)
    } catch (err: any) {
      console.error("Error loading files:", err)
      toast({
        variant: "destructive",
        title: "Erro ao carregar arquivos",
        description: err.message || "Não foi possível carregar a lista de arquivos",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [bucket, folder, refreshTrigger])

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      let url: string

      switch (bucket) {
        case "csv-imports":
          url = await storageService.getCsvImportUrl(filePath)
          break
        case "campaign-templates":
          url = await storageService.getCampaignTemplateUrl(filePath)
          break
        case "message-attachments":
          url = await storageService.getMessageAttachmentUrl(filePath)
          break
        default:
          throw new Error("Bucket não suportado")
      }

      // Create a temporary anchor element to trigger download
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      toast({
        title: "Download iniciado",
        description: `O arquivo ${fileName} está sendo baixado`,
      })
    } catch (err: any) {
      console.error("Error downloading file:", err)
      toast({
        variant: "destructive",
        title: "Erro ao baixar arquivo",
        description: err.message || "Não foi possível baixar o arquivo",
      })
    }
  }

  const handleDelete = async () => {
    if (!fileToDelete) return

    try {
      await storageService.deleteFile(bucket, fileToDelete)

      // Remove file from list
      setFiles(files.filter((f) => f.path !== fileToDelete))

      toast({
        title: "Arquivo excluído",
        description: "O arquivo foi excluído com sucesso",
      })
    } catch (err: any) {
      console.error("Error deleting file:", err)
      toast({
        variant: "destructive",
        title: "Erro ao excluir arquivo",
        description: err.message || "Não foi possível excluir o arquivo",
      })
    } finally {
      setFileToDelete(null)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={loadFiles} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {isLoading ? "Carregando arquivos..." : "Nenhum arquivo encontrado"}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.path}>
                  <TableCell className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </span>
                  </TableCell>
                  <TableCell>{formatFileSize(file.size)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onFileSelect && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onFileSelect(file.path)}
                          title="Selecionar arquivo"
                        >
                          <FileIcon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(file.path, file.name)}
                        title="Baixar arquivo"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setFileToDelete(file.path)}
                            title="Excluir arquivo"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir o arquivo "{file.name}"? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setFileToDelete(null)}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

