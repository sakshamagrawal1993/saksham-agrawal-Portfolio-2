
import { supabase } from '../lib/supabaseClient';

export interface Post {
  id: string;
  slug: string;
  title: string;
  content: any; // JSON
  excerpt: string;
  cover_image_url: string;
  author_id: string;
  is_published: boolean;
  created_at: string;
  profiles?: {
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: {
    full_name?: string;
    avatar_url?: string;
  };
}

export const blogService = {
  async getPosts(publishedOnly = true) {
    let query = supabase
      .from('posts')
      // .select('*, profiles:author_id(full_name, avatar_url)') // Assuming profiles relation setup, otherwise basic select
       .select('*')
      .order('created_at', { ascending: false });

    if (publishedOnly) {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Post[];
  },

  async getPostBySlug(slug: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    return data as Post;
  },

  async getPostById(id: string) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Post;
  },

  async createPost(post: Partial<Post>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('posts')
      .insert({
        ...post,
        author_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePost(id: string, updates: Partial<Post>) {
    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePost(id: string) {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Comments
  async getComments(postId: string) {
     // Join with profiles if possible, for now just basic join approach or fetch users separately
     // Ideally: .select('*, profiles:user_id(full_name, avatar_url)')
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles:user_id(full_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    // Fallback if profiles relation not explicit in schema FK. 
    // But we defined REFERENCES auth.users. 
    // Supabase usually needs a view or proper FK to public.profiles for this to work seamlessly if referencing auth.users directly.
    // For now assuming public.profiles exists and we might need to link it.
    // Let's stick to basic select first to avoid errors.
    
    if (error) {
         // If relation error, fallback to simple select
         const { data: fallbackData, error: fallbackError } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
         if (fallbackError) throw fallbackError;
         return fallbackData as Comment[];
    }
    
    return data as Comment[];
  },

  async createComment(comment: { post_id: string; content: string }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('comments')
      .insert({
        ...comment,
        user_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
