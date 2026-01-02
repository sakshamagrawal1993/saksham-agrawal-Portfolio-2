import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  // Assuming url is like /api/social-card?slug=my-post or rewritten from /journal/my-post
  // If rewritten, we need to extract slug.
  
  // Let's assume we pass slug as query param for simplicity in the beginning,
  // OR we extract it if this is a rewrite.
  // The rewrite in vercel.json will map /journal/:slug -> /api/social-card?slug=:slug
  
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  // Fetch the blog post
  const { data: post } = await supabase
    .from('posts')
    .select('title, excerpt, cover_image_url')
    .eq('slug', slug)
    .single();

  if (!post) {
     // Fallback to default
     return new Response(getDefaultHTML(), {
        headers: { 'Content-Type': 'text/html' },
     });
  }

  // Generate HTML with Meta Tags
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${post.title} | Saksham Agrawal</title>
      <meta name="description" content="${post.excerpt || 'Read this article on Saksham Agrawal Portfolio'}">
      
      <!-- Open Graph / Facebook -->
      <meta property="og:type" content="article">
      <meta property="og:url" content="https://saksham.io/journal/${slug}">
      <meta property="og:title" content="${post.title}">
      <meta property="og:description" content="${post.excerpt || ''}">
      <meta property="og:image" content="${post.cover_image_url || 'https://saksham.io/og-image.png'}">

      <!-- Twitter -->
      <meta property="twitter:card" content="summary_large_image">
      <meta property="twitter:url" content="https://saksham.io/journal/${slug}">
      <meta property="twitter:title" content="${post.title}">
      <meta property="twitter:description" content="${post.excerpt || ''}">
      <meta property="twitter:image" content="${post.cover_image_url || 'https://saksham.io/og-image.png'}">
    </head>
    <body>
      <h1>${post.title}</h1>
      <img src="${post.cover_image_url}" alt="${post.title}" style="max-width: 100%;" />
      <p>${post.excerpt}</p>
      <p>Redirecting to full article...</p>
      <script>window.location.href = '/journal/${slug}';</script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function getDefaultHTML() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Saksham Agrawal - Portfolio</title>
        <meta property="og:title" content="Saksham Agrawal - Product Leader">
        <meta property="og:description" content="Senior Product Manager building AI and Fintech solutions.">
        <meta property="og:image" content="https://saksham.io/og-image.png">
    </head>
    <body>
        <p>Redirecting...</p>
        <script>window.location.href = '/';</script>
    </body>
    </html>
    `
}
