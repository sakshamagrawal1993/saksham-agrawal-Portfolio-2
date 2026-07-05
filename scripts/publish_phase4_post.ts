/**
 * Publish Phase 4 lifecycle article to Supabase posts table.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/publish_phase4_post.ts
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { markdownToHtml } from '../lib/markdownToHtml';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const POST_ID = 'c69f1db4-b41c-4171-86fc-efc196a7cace';
const ARTICLE_PATH =
  '/Users/sakshamagrawal/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/Artificial Intelligence/1.4 Closing the Loop — Continuous Improvement for AI Systems.md';
const VAULT_ROOT =
  '/Users/sakshamagrawal/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian';
const IMAGES_DIR = path.join(VAULT_ROOT, 'attachments/images/ai');
const BLOG_MEDIA_FOLDER = 'improvement-loop';
const PUBLIC_STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

const extensions = [
  StarterKit,
  Image,
  Link.configure({ openOnClick: false }),
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table,
  TableRow,
  TableCell,
  TableHeader,
];

function extractAbstract(markdown: string): string {
  const match = markdown.match(/^>\s*\[!ABSTRACT\]\s*\n(?:>\s*.+\n?)+/m);
  if (!match) return '';

  return match[0]
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^>\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\*\*(.+?)\*\*/g, '$1');
}

function stripPublishHeader(markdown: string): string {
  let md = markdown.replace(/^---[\s\S]*?---\s*/, '');

  const firstSection = md.search(/^##\s+1\./m);
  if (firstSection >= 0) {
    md = md.slice(firstSection);
  }

  return md.trim();
}

function resolveObsidianImage(relativePath: string): string {
  const normalized = relativePath.replace(/^attachments\/images\/ai\//, '');
  return path.join(IMAGES_DIR, normalized);
}

async function uploadImage(
  supabase: ReturnType<typeof createClient>,
  localPath: string,
  bucket: string,
  storagePath: string
): Promise<string> {
  const fileBuffer = fs.readFileSync(localPath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, {
    contentType: 'image/png',
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
  }

  return `${PUBLIC_STORAGE_BASE}/${bucket}/${storagePath}`;
}

function replaceObsidianImages(markdown: string, urlMap: Map<string, string>): string {
  return markdown.replace(/!\[\[([^\]]+)\]\]/g, (_match, rawPath: string) => {
    const filename = path.basename(rawPath);
    const publicUrl = urlMap.get(filename);
    if (!publicUrl) {
      console.warn(`Missing uploaded URL for ${filename}`);
      return '';
    }
    const alt = filename.replace(/\.[^.]+$/, '');
    return `![${alt}](${publicUrl})`;
  });
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }

  if (!fs.existsSync(ARTICLE_PATH)) {
    throw new Error(`Article not found: ${ARTICLE_PATH}`);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const rawMarkdown = fs.readFileSync(ARTICLE_PATH, 'utf-8');
  const excerpt = extractAbstract(rawMarkdown);

  const imageRefs = [...rawMarkdown.matchAll(/!\[\[attachments\/images\/ai\/([^\]]+)\]\]/g)].map(
    (match) => match[1]
  );

  const urlMap = new Map<string, string>();
  let coverUrl = '';

  for (const filename of imageRefs) {
    const localPath = resolveObsidianImage(filename);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local image not found: ${localPath}`);
    }

    if (filename === 'phase4-v3-00-cover.png') {
      const coverPath = `${POST_ID}/cover-${Date.now()}.png`;
      coverUrl = await uploadImage(supabase, localPath, 'journal-media', coverPath);
      continue;
    }

    const storagePath = `${BLOG_MEDIA_FOLDER}/${filename}`;
    const publicUrl = await uploadImage(supabase, localPath, 'blog-media', storagePath);
    urlMap.set(filename, publicUrl);
    console.log(`Uploaded ${filename}`);
  }

  if (!coverUrl) {
    throw new Error('Cover image phase4-v3-00-cover.png was not uploaded');
  }

  let bodyMarkdown = stripPublishHeader(rawMarkdown);
  bodyMarkdown = replaceObsidianImages(bodyMarkdown, urlMap);

  const html = markdownToHtml(bodyMarkdown);
  const tiptapDoc = generateJSON(html, extensions);

  const { data, error } = await supabase
    .from('posts')
    .update({
      title: '6.0 Closing the Loop — Continuous Improvement for AI Systems',
      excerpt,
      cover_image_url: coverUrl,
      content: tiptapDoc,
      is_published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', POST_ID)
    .select('id, slug, title, is_published, excerpt, cover_image_url')
    .single();

  if (error) {
    throw error;
  }

  console.log('\nPublished post:');
  console.log(JSON.stringify(data, null, 2));
  console.log(`Content nodes: ${Array.isArray(tiptapDoc.content) ? tiptapDoc.content.length : 0}`);
  console.log(`Excerpt length: ${excerpt.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
