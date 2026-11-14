// Types for the RequestDesk API. See domain-and-api.md in the repo root.

export type Category = 'hardware' | 'software' | 'access' | 'facilities';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'open' | 'in_progress' | 'blocked' | 'resolved';

export interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  assigneeId: string | null;
  requesterId: string;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  version: number;
}

export interface User {
  id: string;
  name: string;
  team: string;
}

export interface RequestComment {
  id: string;
  requestId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string>;
  current?: ServiceRequest;
}
