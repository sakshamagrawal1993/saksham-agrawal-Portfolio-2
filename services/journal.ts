
import { supabase } from '../lib/supabaseClient';

import { JournalArticle, JournalComment } from '../types';

// supabase client is imported from lib


export const journalService = {
  async getArticles(): Promise<JournalArticle[]> {
    const { data, error } = await supabase
      .from('journal_articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching articles:', error);
      throw error;
    }

    return data || [];
  },

  async getArticle(id: string): Promise<JournalArticle | null> {
    const { data, error } = await supabase
      .from('journal_articles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching article:', error);
      return null;
    }

    return data;
  },

  async getComments(articleId: string): Promise<JournalComment[]> {
    const { data, error } = await supabase
      .from('journal_comments')
      .select(`
        *,
        user:profiles(full_name, avatar_url)
      `)
      .eq('article_id', articleId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }

    // Map the joined profile to a simpler user object if needed, 
    // but the type definition I added expects user: { full_name... } which matches select result structure roughly
    // Supabase returns user as an object or array depending on relation. 
    // Here it's many-to-one (comment -> user), so it returns an object.
    return data as any as JournalComment[]; 
  },

  async createComment(articleId: string, userId: string, content: string): Promise<JournalComment | null> {
    const { data, error } = await supabase
      .from('journal_comments')
      .insert({
        article_id: articleId,
        user_id: userId,
        content: content
      })
      .select(`
        *,
        user:profiles(full_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error('Error creating comment:', error);
      throw error;
    }

    return data as any as JournalComment;
  },

  async updateComment(commentId: string, content: string): Promise<JournalComment | null> {
    const { data, error } = await supabase
      .from('journal_comments')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .select(`
        *,
        user:profiles(full_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error('Error updating comment:', error);
      throw error;
    }

    return data as any as JournalComment;
  },

  async deleteComment(commentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('journal_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      return false;
    }

    return true;
  }
};
