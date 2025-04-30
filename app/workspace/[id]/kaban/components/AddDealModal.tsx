'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DealForm } from './DealForm';
import type { PipelineStageBasic, ClientBasic } from '@/lib/types/pipeline';

interface AddDealModalProps {
  workspaceId: string;
  stages: PipelineStageBasic[];
  clients: ClientBasic[];
  children: React.ReactNode;
}

export function AddDealModal({ workspaceId, stages, clients, children }: AddDealModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Criar Nova Negociação</DialogTitle>
          <DialogDescription>
            Preencha os detalhes abaixo para adicionar uma nova negociação ao seu pipeline.
          </DialogDescription>
        </DialogHeader>
        
        <DealForm
          workspaceId={workspaceId}
          stages={stages}
          clients={clients}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
} 