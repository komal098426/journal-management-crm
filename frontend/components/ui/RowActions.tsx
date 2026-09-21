"use client";

import { Pencil, Trash2 } from "lucide-react";
import { FormModal } from "./Modal";

export function RowActions({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete?: () => void; label: string }) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="row-actions" onClick={event => event.stopPropagation()}>
      {onEdit ? <button className="icon-button" onClick={onEdit} aria-label={`Edit ${label}`} title="Edit"><Pencil size={13} /></button> : null}
      {onDelete ? <button className="icon-button" onClick={onDelete} aria-label={`Delete ${label}`} title="Delete"><Trash2 size={13} /></button> : null}
    </div>
  );
}

export function ConfirmDelete({ title, message, onClose, onConfirm }: { title: string; message: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <FormModal danger eyebrow="Delete" title={title} description={message} submitLabel="Delete" onClose={onClose} onSubmit={onConfirm}>
      <div />
    </FormModal>
  );
}
