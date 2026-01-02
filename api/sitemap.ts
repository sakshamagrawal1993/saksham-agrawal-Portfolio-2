import { createClient } from '@supabase/supabase-js';

export default async function handler(request: Request) {
  try {
    const host = request.headers.get('host') || 'saksham-experiments.com';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
        // Return a basic sitemap to avoid 404/500 if env vars are missing
        return new Response(getStaticSitemap(baseUrl), {
            headers: { 'Content-Type': 'application/xml' },
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch all blog posts
    const { data: posts, error } = await supabase
        .from('posts')
        .select('slug, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Supabase error:', error);
        throw error;
    }

    // 2. Define static routes
    const staticRoutes = [
        '',
        '/journal',
        '/portfolio',
    ];

    // 3. Generate XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- Static Pages -->
${staticRoutes
    .map((route) => {
    return `
<url>
<loc>${baseUrl}${route}</loc>
<changefreq>weekly</changefreq>
<priority>${route === '' ? '1.0' : '0.8'}</priority>
</url>`;
    })
    .join('')}

<!-- Dynamic Blog Posts -->
${(posts || [])
    .map((post) => {
    return `
<url>
<loc>${baseUrl}/journal/${post.slug}</loc>
<lastmod>${new Date(post.created_at).toISOString()}</lastmod>
<changefreq>monthly</changefreq>
<priority>0.7</priority>
</url>`;
    })
    .join('')}
</urlset>`;

    return new Response(sitemap, {
        headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=59',
        },
    });

  } catch (e) {
      console.error('Sitemap generation error:', e);
      return new Response('Error generating sitemap', { status: 500 });
  }
}

function getStaticSitemap(baseUrl: string) {
     return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/journal</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
}
