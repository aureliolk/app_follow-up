"use client";
import React, { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StickyNote, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";

// Import server actions
import { createQuickNote, deleteQuickNote, getAllQuickNotes } from "@/lib/actions/quickNoteActions";

interface QuickNotesPopoverProps {
  workspaceId: string;
  onInsertNote?: (content: string) => void;
  disabled?: boolean;
  open: boolean; // Add open prop
  onOpenChange: (open: boolean) => void; // Add onOpenChange prop
}

export default function QuickNotesPopover({ workspaceId, onInsertNote, disabled, open, onOpenChange }: QuickNotesPopoverProps) {
  // Remove local 'open' state as it's now controlled by props
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Carrega as notas ao abrir o popover
  useEffect(() => {
    async function fetchNotes() {
      if (open) {
        setLoading(true);
        try {
          const result = await getAllQuickNotes(workspaceId);
          if (result.success) {
            setNotes(result.data || []);
          } else {
            toast.error(result.error || "Erro ao buscar notas rápidas");
          }
        } catch (error) {
          console.error("Failed to fetch quick notes:", error);
          toast.error("Erro ao buscar notas rápidas");
        } finally {
          setLoading(false);
        }
      }
    }
    fetchNotes();
  }, [open, workspaceId]);

  async function handleSaveNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const data = await createQuickNote(workspaceId, newNote);
      if (data.success) {
        setNotes([data.data, ...notes]);
        setNewNote("");
        toast.success("Nota salva!");
      } else {
        toast.error(data.error || "Erro ao salvar nota");
      }
    } catch (err) {
      console.error("Erro ao salvar nota:", err);
      toast.error("Erro ao salvar nota");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm("Tem certeza que deseja excluir esta nota?")) return;
    setLoading(true); // Use loading state for the whole component during deletion
    try {
      // Call the new deleteQuickNote action (to be implemented)
      const result = await deleteQuickNote(noteId);
      if (result.success) {
        setNotes(notes.filter(note => note.id !== noteId));
        toast.success("Nota excluída!");
      } else {
        toast.error(result.error || "Erro ao excluir nota");
      }
    } catch (error) {
      console.error("Erro ao excluir nota:", error);
      toast.error("Erro ao excluir nota");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9" disabled={disabled} title="Notas rápidas">
          <StickyNote className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 border-0 shadow-xl" side="top" align="start">
        <div className="p-3 border-b font-semibold text-sm">Notas rápidas</div>
        <div className="p-2">
          <div className="mb-2">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await handleSaveNote();
              }}
            >
              <Textarea
                placeholder="Criar nova nota rápida..."
                rows={2}
                className="mb-1"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                disabled={saving}
              />
              <Button size="sm" className="w-full" type="submit" disabled={saving || !newNote.trim()}>
                {saving ? "Salvando..." : "Salvar nota"}
              </Button>
            </form>
          </div>
          <ScrollArea className="max-h-[300px]">
            {loading ? (
              <div className="text-center text-xs text-muted-foreground py-4">Carregando...</div>
            ) : notes.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">Nenhuma nota rápida encontrada.</div>
            ) : (
              notes.map(note => (
                <div
                  key={note.id}
                  className="border rounded p-2 mb-2 flex justify-between items-center group text-sm"
                >
                  <div
                    className="flex-grow cursor-pointer hover:text-foreground transition"
                    onClick={() => {
                      if (onInsertNote) onInsertNote(note.content);
                      onOpenChange(false); // Use onOpenChange to close the popover
                    }}
                    title="Clique para inserir esta nota"
                  >
                    {note.content}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteNote(note.id)}
                    title="Excluir nota"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
