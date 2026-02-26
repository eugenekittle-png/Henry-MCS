export interface ParsedDocument {
  name: string;
  content: string;
  type: string;
  size: number;
}

export interface FileValidationError {
  file: string;
  error: string;
}

export interface UploadedFile {
  file: File;
  id: string;
}

export interface Client {
  id: number;
  client_number: string;
  name: string;
}

export interface Matter {
  id: number;
  client_id: number;
  matter_number: string;
  description: string;
}
