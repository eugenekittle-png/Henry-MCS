export interface NetDocTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in ms
}

export interface NDCabinet {
  id: string;
  name: string;
  repositoryId: string;
}

export interface NDSearchResult {
  id: string;
  name: string;
  extension: string;
  version: number;
  createdDate: string;
  modifiedDate: string;
  size: number;
  envId: string;
}

export interface NDDocumentInfo {
  id: string;
  name: string;
  extension: string;
  size: number;
  version: number;
}
