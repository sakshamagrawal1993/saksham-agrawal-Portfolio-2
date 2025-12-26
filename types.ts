/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  longDescription?: string;
  role: string;
  category: string;
  imageUrl: string;
  gallery?: string[];
  techStack: string[];
  repoUrl?: string;
  demoUrl?: string;

}

export interface JournalArticle {
  id: string; // Changed from number to string (UUID)
  title: string;
  date: string;
  excerpt: string;
  image: string;
  content: string; // Changed from ReactNode to string (HTML)
  author_id?: string;
  created_at?: string;
}

export interface JournalComment {
  id: string;
  article_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user?: { // Joined profile data
    full_name: string;
    avatar_url: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type ViewState =
  | { type: 'home' }
  | { type: 'project', project: Project }
  | { type: 'journal', article: JournalArticle }
  | { type: 'ticketflow' };

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
}