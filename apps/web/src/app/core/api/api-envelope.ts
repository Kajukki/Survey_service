export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface ApiMeta {
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: ApiMeta;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export function emptyEnvelope<T>(data: T): ApiSuccessEnvelope<T> {
  return {
    success: true,
    data,
  };
}
