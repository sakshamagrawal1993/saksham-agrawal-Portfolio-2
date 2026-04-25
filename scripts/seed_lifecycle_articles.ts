
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VAULT_DIR = '/Users/sakshamagrawal/Documents/Obsidian/Artificial Intelligence';

interface ArticleConfig {
  filename: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  phase: string;
  tags: string[];
}

const articles: ArticleConfig[] = [
  {
    filename: '1 FRAMEWORK FOR AI PRODUCT LIFECYCLE.md',
    slug: 'framework-ai-product-lifecycle',
    title: 'Architecting Intelligence: A Framework for the AI Product Lifecycle',
    excerpt: 'The master framework for building AI products that work. A four-phase lifecycle — Define, Build, Monitor, Improve — that treats AI systems as living, probabilistic systems rather than deterministic software. The central thesis: stop architecting for correctness; start architecting for contingency.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Overview',
    tags: ['AI', 'Product Management', 'Framework'],
  },
  {
    filename: '1.0 The Gating Decision — Should You Build with AI.md',
    slug: 'gating-decision-should-you-build-with-ai',
    title: 'The Gating Decision: Should You Build with AI?',
    excerpt: 'Phase 0 of the AI Product Lifecycle. A rigorous decision framework — the DICE model and problem taxonomy — for determining whether AI is the right tool for your problem before writing a single line of model code. With a deep analysis of the Jivi Health diagnostic platform case study.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 0',
    tags: ['AI', 'Product Management', 'Decision Framework'],
  },
  {
    filename: '1.1 Defining Success Criteria for Probabilistic AI Systems.md',
    slug: 'defining-success-criteria-probabilistic-ai-systems',
    title: 'Defining Success Criteria for Probabilistic AI Systems',
    excerpt: 'Phase 1 of the AI Product Lifecycle. How to define measurable success criteria for systems that produce probabilistic outputs — covering golden dataset construction, inter-rater reliability (Cohen\'s and Fleiss\' Kappa), LLM-as-Judge evaluation, and the Jivi Diagnostics Benchmark methodology.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 1',
    tags: ['AI', 'Evaluation', 'Benchmarking'],
  },
  {
    filename: '1.2 Building AI Systems — The Complexity Ladder and Architecture Selection.md',
    slug: 'building-ai-systems-complexity-ladder-architecture-selection',
    title: 'Building AI Systems: The Complexity Ladder and Architecture Selection',
    excerpt: 'Phase 2 of the AI Product Lifecycle. A six-tier Complexity Ladder for AI architecture — from Direct LLM Calls to Pre-Training — with evidence-based escalation protocols, RAG pipeline decision frameworks, vector store selection guides, and cost-latency-quality frontier analysis.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 2',
    tags: ['AI', 'Architecture', 'RAG', 'Agents'],
  },
  {
    filename: '1.2.1 Anatomy of an AI Agent — The Harness Architecture.md',
    slug: 'anatomy-ai-agent-harness-architecture',
    title: 'Anatomy of an AI Agent: The Harness Architecture',
    excerpt: 'A deep-dive into the six pillars of a production-grade AI agent — Orchestration, Context Engineering, Memory Systems, Tool Integration (MCP), Guardrails, and Observability. The central insight: the model is a commodity; the harness is the competitive moat.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 2 (Supplement)',
    tags: ['AI Agents', 'Architecture', 'LangGraph', 'MCP'],
  },
  {
    filename: '1.3 Monitoring AI in Production — The Immune System Framework.md',
    slug: 'monitoring-ai-production-immune-system-framework',
    title: 'Monitoring AI in Production: The Immune System Framework',
    excerpt: 'Phase 3 of the AI Product Lifecycle. A four-layer defense model for AI monitoring — Innate (operational), Adaptive (quality/drift), Specialized (safety/compliance), and Systemic (deep evaluation). Covers RAGAS, the observability tooling landscape, and the hidden technical debt of AI systems.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 3',
    tags: ['AI', 'Monitoring', 'Observability', 'Production'],
  },
  {
    filename: '1.4 Closing the Loop — Continuous Improvement for AI Systems.md',
    slug: 'closing-the-loop-continuous-improvement-ai-systems',
    title: 'Closing the Loop: Continuous Improvement for AI Systems',
    excerpt: 'Phase 4 of the AI Product Lifecycle. The Improvement Hierarchy — from prompt refinement and DSPy/MIPROv2 optimization through DPO preference learning to production fine-tuning. Includes the production data flywheel, competitive moat analysis, and Jivi Health\'s improvement cycles.',
    coverImage: '/journal/ai-lifecycle.png',
    phase: 'Phase 4',
    tags: ['AI', 'Fine-tuning', 'DPO', 'Improvement'],
  },
];

/**
 * Converts markdown content to styled HTML for the blog posts table.
 * Handles headers, paragraphs, lists, code blocks, tables, blockquotes,
 * Obsidian wiki-links [[...]], and Obsidian callouts > [!NOTE].
 */
function markdownToHtml(md: string): string {
  // Remove YAML frontmatter
  md = md.replace(/^---[\s\S]*?---\s*/, '');

  let html = '';
  const lines = md.split('\n');
  let i = 0;
  let inCodeBlock = false;
  let codeLang = '';
  let codeContent = '';
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let inOrderedList = false;
  let olItems: string[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      html += `<ul class="list-disc pl-6 mb-6 space-y-1 text-[#5D5A53]">\n${listItems.join('\n')}\n</ul>\n`;
      listItems = [];
      inList = false;
    }
    if (inOrderedList && olItems.length > 0) {
      html += `<ol class="list-decimal pl-6 mb-6 space-y-1 text-[#5D5A53]">\n${olItems.join('\n')}\n</ol>\n`;
      olItems = [];
      inOrderedList = false;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0];
      const dataRows = tableRows.slice(1);
      html += `<div class="overflow-x-auto mb-8 rounded-lg border border-[#D4C5A9]">\n`;
      html += `<table class="min-w-full text-sm text-[#5D5A53]">\n`;
      html += `<thead class="bg-[#EBE7DE]"><tr>${headerRow}</tr></thead>\n`;
      html += `<tbody>\n${dataRows.join('\n')}\n</tbody>\n`;
      html += `</table></div>\n`;
      tableRows = [];
      inTable = false;
    }
  };

  const inlineFormat = (text: string): string => {
    // Strip Obsidian wiki-links [[Article Name|Display Text]] or [[Article Name]]
    text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="text-[#8B7644] font-medium">$2</span>');
    text = text.replace(/\[\[([^\]]+)\]\]/g, '<span class="text-[#8B7644] font-medium">$1</span>');
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#2C2A26]">$1</strong>');
    // Italic (avoid matching lone asterisks in tables)
    text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="bg-[#F5F0E8] border border-[#D4C5A9] px-1.5 py-0.5 rounded text-sm font-mono text-[#8B4513]">$1</code>');
    // Standard markdown links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#8B7644] underline underline-offset-2 hover:text-[#5C4F2A]" target="_blank" rel="noopener">$1</a>');
    return text;
  };

  while (i < lines.length) {
    const line = lines[i];

    // ── Code blocks ──────────────────────────────────────────────────────────
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        if (codeLang.toLowerCase() === 'mermaid') {
          // Renderable by Mermaid runtime in PostViewer.
          html += `<div class="mermaid mb-8">${codeContent.trim()}</div>\n`;
        } else {
          const langLabel = codeLang ? `<span class="text-xs font-mono text-[#A0998C] mb-1 block">${codeLang}</span>` : '';
          html += `<div class="mb-8 rounded-lg overflow-hidden border border-[#3C3A36]">${langLabel}<pre class="bg-[#1E1C1A] text-[#E8E2D8] p-5 overflow-x-auto text-sm leading-relaxed"><code>${codeContent}</code></pre></div>\n`;
        }
        codeContent = '';
        codeLang = '';
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        codeLang = line.trim().replace('```', '').trim();
        inCodeBlock = true;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeContent += line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n';
      i++;
      continue;
    }

    // ── Table rows ────────────────────────────────────────────────────────────
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      // Skip separator rows (|:---|:---|)
      if (/^\|[\s:|,-]+\|$/.test(line.trim())) {
        i++;
        continue;
      }
      if (!inTable) inTable = true;
      const cells = line.split('|').filter(c => c.trim() !== '');
      const isHeader = tableRows.length === 0;
      const tag = isHeader ? 'th' : 'td';
      const cellClass = isHeader
        ? 'font-semibold text-[#2C2A26] px-4 py-3 text-left text-xs uppercase tracking-wider'
        : 'px-4 py-3 border-t border-[#E8E0D0] align-top';
      const row = `<tr class="${isHeader ? '' : 'hover:bg-[#F5F2EC]'}">${cells.map(c => `<${tag} class="${cellClass}">${inlineFormat(c.trim())}</${tag}>`).join('')}</tr>`;
      tableRows.push(row);
      i++;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // ── Obsidian callouts > [!NOTE] / [!IMPORTANT] / [!WARNING] / [!TIP] ────
    if (line.trim().startsWith('> [!')) {
      flushList();
      const calloutMatch = line.match(/^>\s*\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]/i);
      const calloutType = calloutMatch ? calloutMatch[1].toUpperCase() : 'NOTE';
      const calloutStyles: Record<string, string> = {
        NOTE: 'border-blue-400 bg-blue-50 text-blue-900',
        IMPORTANT: 'border-amber-500 bg-amber-50 text-amber-900',
        WARNING: 'border-orange-500 bg-orange-50 text-orange-900',
        TIP: 'border-green-500 bg-green-50 text-green-900',
        CAUTION: 'border-red-500 bg-red-50 text-red-900',
      };
      const calloutStyle = calloutStyles[calloutType] || calloutStyles.NOTE;
      let calloutBody = '';
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const bodyLine = lines[i].replace(/^>\s*/, '').trim();
        if (bodyLine) calloutBody += `<p class="mb-1">${inlineFormat(bodyLine)}</p>`;
        i++;
      }
      html += `<div class="border-l-4 ${calloutStyle} pl-4 pr-4 py-3 rounded-r-lg mb-6">\n<p class="text-xs font-bold uppercase tracking-wider mb-2 opacity-70">${calloutType}</p>${calloutBody}</div>\n`;
      continue;
    }

    // ── Regular blockquotes ───────────────────────────────────────────────────
    if (line.trim().startsWith('> ')) {
      flushList();
      let fullQuote = line.replace(/^>\s*/, '').trim();
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++;
        const nextLine = lines[i].replace(/^>\s*/, '').trim();
        if (nextLine) fullQuote += ' ' + nextLine;
      }
      html += `<blockquote class="border-l-4 border-[#8B7644] pl-5 my-6 italic text-[#5D5A53] text-lg leading-relaxed">${inlineFormat(fullQuote)}</blockquote>\n`;
      i++;
      continue;
    }

    // ── Headers ───────────────────────────────────────────────────────────────
    if (/^# (?!#)/.test(line)) {
      flushList(); flushTable();
      html += `<h1 class="text-3xl font-serif text-[#2C2A26] mb-6 mt-12 leading-tight">${inlineFormat(line.replace(/^# /, ''))}</h1>\n`;
      i++; continue;
    }
    if (line.startsWith('## ')) {
      flushList(); flushTable();
      html += `<h2 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-10 pb-2 border-b border-[#E8E0D0] leading-tight">${inlineFormat(line.replace(/^## /, ''))}</h2>\n`;
      i++; continue;
    }
    if (line.startsWith('### ')) {
      flushList(); flushTable();
      html += `<h3 class="text-xl font-serif text-[#2C2A26] mb-3 mt-8 leading-snug">${inlineFormat(line.replace(/^### /, ''))}</h3>\n`;
      i++; continue;
    }
    if (line.startsWith('#### ')) {
      flushList(); flushTable();
      html += `<h4 class="text-base font-bold text-[#2C2A26] mb-2 mt-6 uppercase tracking-wide">${inlineFormat(line.replace(/^#### /, ''))}</h4>\n`;
      i++; continue;
    }

    // ── Unordered list items ──────────────────────────────────────────────────
    if (/^\s*[-*]\s/.test(line)) {
      flushTable();
      if (inOrderedList) { flushList(); }
      inList = true;
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const item = line.replace(/^\s*[-*]\s/, '').replace(/\[[ x/]\]\s*/, '').trim();
      const indentClass = indent >= 4 ? 'ml-4' : '';
      listItems.push(`  <li class="mb-1 ${indentClass}">${inlineFormat(item)}</li>`);
      i++; continue;
    }

    // ── Ordered list items ────────────────────────────────────────────────────
    if (/^\s*\d+\.\s/.test(line)) {
      flushTable();
      if (inList) { flushList(); }
      inOrderedList = true;
      const item = line.replace(/^\s*\d+\.\s/, '').trim();
      olItems.push(`  <li class="mb-1">${inlineFormat(item)}</li>`);
      i++; continue;
    }

    // ── Horizontal rules ──────────────────────────────────────────────────────
    if (line.trim() === '---' || line.trim() === '***') {
      flushList(); flushTable();
      html += `<hr class="my-10 border-[#D4C5A9]" />\n`;
      i++; continue;
    }

    // ── Empty lines ───────────────────────────────────────────────────────────
    if (line.trim() === '') {
      flushList();
      i++; continue;
    }

    // ── Regular paragraphs ────────────────────────────────────────────────────
    flushList(); flushTable();
    html += `<p class="mb-5 text-[#5D5A53] leading-relaxed">${inlineFormat(line.trim())}</p>\n`;
    i++;
  }

  flushList();
  flushTable();

  return html;
}

async function seedLifecycleArticles() {
  console.log('🚀 Seeding AI Product Lifecycle articles to posts table…\n');

  for (const config of articles) {
    const filepath = path.join(VAULT_DIR, config.filename);

    if (!fs.existsSync(filepath)) {
      console.error(`❌  File not found: ${config.filename}`);
      continue;
    }

    const markdown = fs.readFileSync(filepath, 'utf-8');
    const htmlContent = markdownToHtml(markdown);
    const wordCount = markdown.split(/\s+/).length;

    console.log(`📄 Processing: ${config.title}`);
    console.log(`   Words: ${wordCount} | Slug: ${config.slug}`);

    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('slug', config.slug)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('posts')
        .update({
          title: config.title,
          content: htmlContent,
          excerpt: config.excerpt,
          cover_image_url: config.coverImage,
          is_published: true,
        })
        .eq('slug', config.slug)
        .select()
        .single();

      if (error) console.error(`   ❌ Error updating: ${error.message}`);
      else console.log(`   ✅ Updated (id: ${data.id})`);
    } else {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          slug: config.slug,
          title: config.title,
          content: htmlContent,
          excerpt: config.excerpt,
          cover_image_url: config.coverImage,
          is_published: true,
        })
        .select()
        .single();

      if (error) console.error(`   ❌ Error inserting: ${error.message}`);
      else console.log(`   ✅ Inserted (id: ${data.id})`);
    }

    console.log('');
  }

  console.log('✨ Done. All 7 articles are published (is_published: true).');
}

seedLifecycleArticles();
