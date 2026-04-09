import {
  Connection,
  ExportRecord,
  FormRecord,
  FormSectionRecord,
  FormStructureRecord,
  SharingRecord,
  SyncJob,
} from '../../shared/models/domain.models';

export interface ConnectionDto {
  id: string;
  type: 'google' | 'microsoft';
  syncStatus: 'idle' | 'syncing' | 'error';
  ownerId: string;
  updatedAt: string;
}

export interface FormDto {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: string;
}

export interface FormQuestionDto {
  id: string;
  label: string;
  description?: string;
  type: 'single_choice' | 'multi_choice' | 'text' | 'rating' | 'date' | 'number';
  required?: boolean;
  order: number;
}

export interface FormSectionDto {
  id: string;
  title: string;
  description?: string;
  order: number;
  questions: FormQuestionDto[];
}

export interface FormStructureDto {
  form: {
    id: string;
    ownerId: string;
    title: string;
    description?: string;
    responseCount: number;
    updatedAt: string;
    lastSyncedAt?: string;
  };
  sections: FormSectionDto[];
  questionCount: number;
}

export interface JobDto {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at?: string;
  createdAt?: string;
  source?: string;
}

export interface ExportDto {
  id: string;
  format: 'csv' | 'excel' | 'json';
  status: 'queued' | 'ready' | 'succeeded' | 'failed';
  requested_at?: string;
  requestedAt?: string;
}

export interface ShareDto {
  id: string;
  form_id: string;
  grantee_user_id: string;
  permission_level: 'read' | 'write' | 'admin';
}

const CURRENT_USER_ID = 'user-one';

export function mapConnections(items: ConnectionDto[]): Connection[] {
  return items.map((item) => ({
    id: item.id,
    provider: item.type,
    status: item.syncStatus === 'error' ? 'attention' : 'connected',
    owner: item.ownerId,
    updatedAt: item.updatedAt,
  }));
}

export function mapForms(items: FormDto[]): FormRecord[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    owner: item.ownerId,
    visibility: item.ownerId === CURRENT_USER_ID ? 'owned' : 'shared',
    updatedAt: item.updatedAt,
  }));
}

export function mapFormStructure(input: FormStructureDto): FormStructureRecord {
  const sections: FormSectionRecord[] = input.sections
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      questions: section.questions
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((question) => ({
          id: question.id,
          label: question.label,
          description: question.description,
          type: question.type,
          required: question.required ?? false,
        })),
    }));

  return {
    formId: input.form.id,
    title: input.form.title,
    ownerId: input.form.ownerId,
    description: input.form.description,
    responseCount: input.form.responseCount,
    updatedAt: input.form.updatedAt,
    lastSyncedAt: input.form.lastSyncedAt,
    sections,
    questionCount: input.questionCount,
  };
}

export function mapJobs(items: JobDto[]): SyncJob[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
    source: item.source ?? 'manual_sync',
  }));
}

export function mapExports(items: ExportDto[]): ExportRecord[] {
  return items.map((item) => ({
    id: item.id,
    format: item.format === 'excel' ? 'xlsx' : 'csv',
    status: item.status === 'ready' || item.status === 'succeeded' ? 'ready' : 'queued',
    requestedAt: item.requested_at ?? item.requestedAt ?? new Date().toISOString(),
  }));
}

export function mapShares(items: ShareDto[]): SharingRecord[] {
  return items.map((item) => ({
    id: item.id,
    resource: item.form_id,
    principal: item.grantee_user_id,
    role: item.permission_level === 'read' ? 'viewer' : 'editor',
  }));
}
