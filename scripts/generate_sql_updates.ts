/**
 * generate_sql_updates.ts
 * 
 * Generates a SQL file with UPDATE statements to populate post content
 * and excerpts. The SQL can be pasted into the Supabase Dashboard
 * SQL Editor, which runs as the service role and bypasses RLS.
 * 
 * Run: npx tsx scripts/generate_sql_updates.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const VAULT_DIR = '/Users/sakshamagrawal/Documents/Obsidian/Artificial Intelligence';
const OUTPUT_FILE = path.join(process.cwd(), 'tmp', 'update_posts.sql');

// Maps vault filename → existing post slug in the DB
const articles = [
  {
    filename: '1 FRAMEWORK FOR AI PRODUCT LIFECYCLE.md',
    slug: 'framework-for-ai-product-lifecycle',        // exact slug from DB
    excerpt: 'The master framework for building AI products that work. A four-phase lifecycle — Define, Build, Monitor, Improve — that treats AI systems as living, probabilistic systems rather than deterministic software. The central thesis: stop architecting for correctness; start architecting for contingency.',
  },
  {
    filename: '1.0 The Gating Decision — Should You Build with AI.md',
    slug: 'the-gating-decision-should-you-build-with-ai',
    excerpt: 'Phase 0 of the AI Product Lifecycle. A rigorous decision framework — the DICE model and problem taxonomy — for determining whether AI is the right tool before writing a single line of model code. With a deep analysis of the Jivi Health diagnostic platform case study.',
  },
  {
    filename: '1.1 Defining Success Criteria for Probabilistic AI Systems.md',
    slug: 'defining-success-criteria-for-probabilistic-ai-systems',
    excerpt: 'Phase 1 of the AI Product Lifecycle. How to define measurable success criteria for systems that produce probabilistic outputs — covering golden dataset construction, inter-rater reliability (Cohen\'s and Fleiss\' Kappa), LLM-as-Judge evaluation, and the Jivi Diagnostics Benchmark methodology.',
  },
  {
    filename: '1.2 Building AI Systems — The Complexity Ladder and Architecture Selection.md',
    slug: 'building-ai-systems-the-complexity-ladder-and-architecture-selection',
    excerpt: 'Phase 2 of the AI Product Lifecycle. A six-tier Complexity Ladder for AI architecture — from Direct LLM Calls to Pre-Training — with evidence-based escalation protocols, RAG pipeline decision frameworks, vector store selection guides, and cost-latency-quality frontier analysis.',
  },
  {
    filename: '1.2.1 Anatomy of an AI Agent — The Harness Architecture.md',
    slug: 'anatomy-of-an-ai-agent-the-harness-architecture',
    excerpt: 'A deep-dive into the six pillars of a production-grade AI agent — Orchestration, Context Engineering, Memory Systems, Tool Integration (MCP), Guardrails, and Observability. The central insight: the model is a commodity; the harness is the competitive moat.',
  },
  {
    filename: '1.3 Monitoring AI in Production — The Immune System Framework.md',
    slug: 'monitoring-ai-in-production-the-immune-system-framework',
    excerpt: 'Phase 3 of the AI Product Lifecycle. A four-layer defense model for AI monitoring — Innate (operational), Adaptive (quality/drift), Specialized (safety/compliance), and Systemic (deep evaluation). Covers RAGAS, the observability tooling landscape, and the hidden technical debt of AI systems.',
  },
  {
    filename: '1.4 Closing the Loop — Continuous Improvement for AI Systems.md',
    slug: 'closing-the-loop-continuous-improvement-for-ai-systems',
    excerpt: 'Phase 4 of the AI Product Lifecycle. The Improvement Hierarchy — from prompt refinement and DSPy/MIPROv2 optimization through DPO preference learning to production fine-tuning. Includes the production data flywheel, competitive moat analysis, and improvement cycles delivering measurable gains.',
  },
];

// ── Markdown → HTML converter ────────────────────────────────────────────────

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
      html += `<ul>\n${listItems.join('\n')}\n</ul>\n`;
      listItems = []; inList = false;
    }
    if (inOrderedList && olItems.length > 0) {
      html += `<ol>\n${olItems.join('\n')}\n</ol>\n`;
      olItems = []; inOrderedList = false;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const header = tableRows[0];
      const body = tableRows.slice(1);
      html += `<div class="table-wrapper"><table><thead><tr>${header}</tr></thead><tbody>\n${body.join('\n')}\n</tbody></table></div>\n`;
      tableRows = []; inTable = false;
    }
  };

  const inlineFormat = (text: string): string => {
    // Obsidian wiki-links [[Page|Label]] and [[Page]]
    text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="wiki-link">$2</span>');
    text = text.replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link">$1</span>');
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic (not inside asterisk tables)
    text = text.replace(/\*([^*\n|]+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  };

  while (i < lines.length) {
    const line = lines[i];

    // ── Code blocks ────────────────────────────────────────
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        const label = codeLang ? `<div class="code-lang">${codeLang}</div>` : '';
        html += `<div class="code-block">${label}<pre><code>${codeContent}</code></pre></div>\n`;
        codeContent = ''; codeLang = ''; inCodeBlock = false;
      } else {
        flushList(); flushTable();
        codeLang = line.trim().replace(/^```/, '').trim();
        inCodeBlock = true;
      }
      i++; continue;
    }
    if (inCodeBlock) {
      codeContent += line.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '\n';
      i++; continue;
    }

    // ── Table rows ─────────────────────────────────────────
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      if (/^\|[\s:|,-]+\|$/.test(line.trim())) { i++; continue; }
      inTable = true;
      const cells = line.split('|').filter(c => c.trim() !== '');
      const isHeader = tableRows.length === 0;
      const tag = isHeader ? 'th' : 'td';
      const trClass = isHeader ? '' : ' class="data-row"';
      const row = `<tr${trClass}>${cells.map(c => `<${tag}>${inlineFormat(c.trim())}</${tag}>`).join('')}</tr>`;
      tableRows.push(row);
      i++; continue;
    } else if (inTable) { flushTable(); }

    // ── Obsidian callouts > [!TYPE] ────────────────────────
    if (line.trim().startsWith('> [!')) {
      flushList();
      const typeMatch = line.match(/^>\s*\[!(NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]/i);
      const type = typeMatch ? typeMatch[1].toUpperCase() : 'NOTE';
      let body = '';
      i++;
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const bl = lines[i].replace(/^>\s*/, '').trim();
        if (bl) body += `<p>${inlineFormat(bl)}</p>`;
        i++;
      }
      html += `<div class="callout callout-${type.toLowerCase()}"><p class="callout-label">${type}</p>${body}</div>\n`;
      continue;
    }

    // ── Regular blockquotes ────────────────────────────────
    if (line.trim().startsWith('> ')) {
      flushList();
      let q = line.replace(/^>\s*/, '').trim();
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++;
        const nl = lines[i].replace(/^>\s*/, '').trim();
        if (nl) q += ' ' + nl;
      }
      html += `<blockquote>${inlineFormat(q)}</blockquote>\n`;
      i++; continue;
    }

    // ── Headers ────────────────────────────────────────────
    if (/^# (?!#)/.test(line)) {
      flushList(); flushTable();
      html += `<h1>${inlineFormat(line.replace(/^# /, ''))}</h1>\n`;
      i++; continue;
    }
    if (line.startsWith('## ')) {
      flushList(); flushTable();
      html += `<h2>${inlineFormat(line.replace(/^## /, ''))}</h2>\n`;
      i++; continue;
    }
    if (line.startsWith('### ')) {
      flushList(); flushTable();
      html += `<h3>${inlineFormat(line.replace(/^### /, ''))}</h3>\n`;
      i++; continue;
    }
    if (line.startsWith('#### ')) {
      flushList(); flushTable();
      html += `<h4>${inlineFormat(line.replace(/^#### /, ''))}</h4>\n`;
      i++; continue;
    }

    // ── Lists ──────────────────────────────────────────────
    if (/^\s*[-*]\s/.test(line)) {
      flushTable();
      if (inOrderedList) { flushList(); }
      inList = true;
      const item = line.replace(/^\s*[-*]\s/, '').replace(/\[[ x/]\]\s*/, '').trim();
      listItems.push(`<li>${inlineFormat(item)}</li>`);
      i++; continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      flushTable();
      if (inList) { flushList(); }
      inOrderedList = true;
      const item = line.replace(/^\s*\d+\.\s/, '').trim();
      olItems.push(`<li>${inlineFormat(item)}</li>`);
      i++; continue;
    }

    // ── HR ─────────────────────────────────────────────────
    if (line.trim() === '---' || line.trim() === '***') {
      flushList(); flushTable();
      html += `<hr />\n`;
      i++; continue;
    }

    // ── Empty lines ────────────────────────────────────────
    if (line.trim() === '') { flushList(); i++; continue; }

    // ── Paragraphs ─────────────────────────────────────────
    flushList(); flushTable();
    html += `<p>${inlineFormat(line.trim())}</p>\n`;
    i++;
  }

  flushList(); flushTable();
  return html;
}

// ── SQL escaping ─────────────────────────────────────────────────────────────

function sqlEscape(str: string): string {
  return str.replace(/'/g, "''");
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  let sql = `-- ============================================================
-- AI Product Lifecycle — Post Content Update Script
-- Generated: ${new Date().toISOString()}
-- Paste this entire file into the Supabase SQL Editor and run.
-- The SQL Editor bypasses RLS so no auth is required.
-- ============================================================

`;

  for (const config of articles) {
    const filepath = path.join(VAULT_DIR, config.filename);

    if (!fs.existsSync(filepath)) {
      console.error(`❌ File not found: ${config.filename}`);
      sql += `-- ⚠️  SKIPPED (file not found): ${config.filename}\n\n`;
      continue;
    }

    const markdown = fs.readFileSync(filepath, 'utf-8');
    const htmlContent = markdownToHtml(markdown);
    const wordCount = markdown.split(/\s+/).length;

    console.log(`✅ Processed: ${config.slug} (${wordCount} words → ${Math.round(htmlContent.length / 1024)}KB HTML)`);

    sql += `-- ── ${config.slug} ──\n`;
    sql += `UPDATE public.posts\n`;
    sql += `SET\n`;
    sql += `  content = '${sqlEscape(htmlContent)}',\n`;
    sql += `  excerpt = '${sqlEscape(config.excerpt)}',\n`;
    sql += `  cover_image_url = '/journal/ai-lifecycle.png',\n`;
    sql += `  is_published = true,\n`;
    sql += `  updated_at = NOW()\n`;
    sql += `WHERE slug = '${config.slug}';\n\n`;
  }

  sql += `-- ── Verify ──\n`;
  sql += `SELECT slug, title, is_published, length(content::text) AS content_bytes FROM public.posts ORDER BY created_at;\n`;

  fs.writeFileSync(OUTPUT_FILE, sql, 'utf-8');
  console.log(`\n📄 SQL written to: ${OUTPUT_FILE}`);
  console.log(`   File size: ${Math.round(fs.statSync(OUTPUT_FILE).size / 1024)}KB`);
  console.log(`\n👉 Next step: Open the Supabase Dashboard → SQL Editor`);
  console.log(`   URL: https://supabase.com/dashboard/project/ralhkmpbslsdkwnqzqen/sql/new`);
  console.log(`   Paste and run the generated SQL file.`);
}

main();
