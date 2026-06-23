
import React, { useEffect, useMemo, useRef } from 'react';
import {
  containsMarkdownTable,
  isMarkdownTableRow,
  isMarkdownTableSeparator,
  looksLikeHtmlContent,
  markdownInlineFormat,
  markdownTableRowsToHtml,
  markdownToHtml,
} from '../../lib/markdownToHtml';

interface PostViewerProps {
  content: any;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyMarks(text: string, marks?: Array<{ type: string; attrs?: Record<string, any> }>): string {
  if (!marks || marks.length === 0) return text;
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${acc}</strong>`;
      case 'italic':
        return `<em>${acc}</em>`;
      case 'underline':
        return `<u>${acc}</u>`;
      case 'strike':
        return `<s>${acc}</s>`;
      case 'code':
        return `<code>${acc}</code>`;
      case 'link': {
        const href = escapeHtml(mark.attrs?.href || '#');
        return `<a href="${href}" target="_blank" rel="noopener">${acc}</a>`;
      }
      default:
        return acc;
    }
  }, text);
}

function getNodePlainText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!node.content || !Array.isArray(node.content)) return '';
  return node.content.map(getNodePlainText).join('');
}

function renderSingleLegacyNode(node: any): string {
  const children = renderLegacyNodes(node.content);
  switch (node.type) {
    case 'text':
      return applyMarks(escapeHtml(node.text || ''), node.marks);
    case 'paragraph':
      return `<p class="mb-5 text-[#5D5A53] leading-relaxed">${children || ''}</p>`;
    case 'heading': {
      const level = Number(node.attrs?.level || 2);
      const safeLevel = Math.min(4, Math.max(1, level));
      return `<h${safeLevel}>${children || ''}</h${safeLevel}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList':
      return `<ol>${children}</ol>`;
    case 'listItem':
      return `<li>${children}</li>`;
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`;
    case 'hardBreak':
      return '<br />';
    case 'horizontalRule':
      return '<hr class="my-10 border-[#D4C5A9]" />';
    case 'codeBlock':
      return `<pre><code>${escapeHtml(
        (node.content || []).map((n: any) => n.text || '').join('')
      )}</code></pre>`;
    case 'image': {
      const src = escapeHtml(node.attrs?.src || '');
      const alt = escapeHtml(node.attrs?.alt || '');
      if (!src) return '';
      return `<img src="${src}" alt="${alt}" loading="lazy" />`;
    }
    case 'table':
      return `<div class="overflow-x-auto mb-8 rounded-lg border border-[#D4C5A9]"><table class="min-w-full text-sm text-[#5D5A53]"><tbody>${children}</tbody></table></div>`;
    case 'tableRow':
      return `<tr class="hover:bg-[#F5F2EC]">${children}</tr>`;
    case 'tableHeader': {
      const colspan = node.attrs?.colspan > 1 ? ` colspan="${node.attrs.colspan}"` : '';
      const rowspan = node.attrs?.rowspan > 1 ? ` rowspan="${node.attrs.rowspan}"` : '';
      return `<th class="font-semibold text-[#2C2A26] px-4 py-3 text-left text-xs uppercase tracking-wider bg-[#EBE7DE]"${colspan}${rowspan}>${children}</th>`;
    }
    case 'tableCell': {
      const colspan = node.attrs?.colspan > 1 ? ` colspan="${node.attrs.colspan}"` : '';
      const rowspan = node.attrs?.rowspan > 1 ? ` rowspan="${node.attrs.rowspan}"` : '';
      return `<td class="px-4 py-3 border-t border-[#E8E0D0] align-top"${colspan}${rowspan}>${children}</td>`;
    }
    default:
      return children;
  }
}

function collectMarkdownTableRows(nodes: any[], startIndex: number): { rows: string[]; nextIndex: number } {
  const rows: string[] = [];
  let i = startIndex;

  while (i < nodes.length) {
    const node = nodes[i];
    if (node.type !== 'paragraph') break;

    const text = getNodePlainText(node).trim();
    if (!text) {
      i++;
      continue;
    }
    if (isMarkdownTableSeparator(text)) {
      i++;
      continue;
    }
    if (!isMarkdownTableRow(text)) break;

    rows.push(text);
    i++;
  }

  return { rows, nextIndex: i };
}

function renderLegacyNodes(nodes?: any[]): string {
  if (!nodes || !Array.isArray(nodes)) return '';

  let html = '';
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];

    if (node.type === 'paragraph') {
      const text = getNodePlainText(node).trim();
      if (isMarkdownTableRow(text)) {
        const { rows, nextIndex } = collectMarkdownTableRows(nodes, i);
        if (rows.length > 0) {
          html += markdownTableRowsToHtml(rows);
          i = nextIndex;
          continue;
        }
      }
    }

    html += renderSingleLegacyNode(node);
    i++;
  }

  return html;
}

function normalizePostContent(content: any): string {
  if (typeof content === 'string') {
    if (content.trim().startsWith('"') || content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        return normalizePostContent(parsed);
      } catch {
        // Fall through to plain string handling.
      }
    }

    if (!looksLikeHtmlContent(content) && containsMarkdownTable(content)) {
      return markdownToHtml(content);
    }

    return content;
  }

  if (content && typeof content === 'object') {
    if (content?.type === 'doc') {
      return renderLegacyNodes(content.content);
    }
    if (typeof content?.html === 'string') {
      return content.html;
    }
    if (typeof content?.content === 'string') {
      const nested = content.content;
      if (!looksLikeHtmlContent(nested) && containsMarkdownTable(nested)) {
        return markdownToHtml(nested);
      }
      return nested;
    }
    return `<p class="text-[#5D5A53] italic">Unsupported content format.</p>`;
  }

  return '';
}

/**
 * PostViewer renders article content stored in the `posts` table.
 * Supports HTML strings, TipTap JSON (including pasted markdown tables),
 * and raw markdown with GFM pipe tables.
 */
const PostViewer: React.FC<PostViewerProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const htmlString = useMemo(() => normalizePostContent(content), [content]);

  useEffect(() => {
    const renderMermaid = async () => {
      if (!containerRef.current) return;

      const legacyCodeBlocks = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>('pre > code')
      );

      legacyCodeBlocks.forEach((codeNode) => {
        const code = codeNode.textContent?.trim() ?? '';
        const preNode = codeNode.parentElement;
        if (!preNode) return;

        const wrapper = preNode.parentElement;
        const previous = preNode.previousElementSibling;
        const langHint =
          previous?.tagName.toLowerCase() === 'span'
            ? (previous.textContent || '').trim().toLowerCase()
            : '';

        const looksLikeMermaid =
          langHint === 'mermaid' ||
          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|requirementDiagram|gitGraph|block-beta)\b/m.test(
            code
          );

        if (!looksLikeMermaid) return;

        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid mb-8';
        mermaidDiv.textContent = code;

        if (wrapper && wrapper.tagName.toLowerCase() === 'div') {
          wrapper.replaceWith(mermaidDiv);
        } else {
          preNode.replaceWith(mermaidDiv);
        }
      });

      const paragraphs = Array.from(
        containerRef.current.querySelectorAll<HTMLParagraphElement>('p')
      );
      paragraphs.forEach((p) => {
        const raw = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (raw.startsWith('graph TD A[User Problem]')) {
          const img = document.createElement('img');
          img.src = '/images/golden_hammer_decision_flow.svg';
          img.alt = 'Golden Hammer Decision Flow';
          img.loading = 'lazy';
          p.replaceWith(img);
          return;
        }
        if (raw.startsWith('graph LR Input')) {
          const img = document.createElement('img');
          img.src = '/images/hybrid_first_fallback_flow.svg';
          img.alt = 'Hybrid First Fallback Flow';
          img.loading = 'lazy';
          p.replaceWith(img);
        }
      });

      const mermaidBlocks = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>('.mermaid')
      );

      if (mermaidBlocks.length === 0) return;

      const mermaid = (await import('mermaid')).default;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
      });

      mermaidBlocks.forEach((node) => node.removeAttribute('data-processed'));

      await mermaid.run({ nodes: mermaidBlocks });
    };

    renderMermaid().catch((err) => {
      console.error('Failed to render mermaid charts:', err);
    });
  }, [htmlString]);

  return (
    <div
      ref={containerRef}
      className="post-content"
      dangerouslySetInnerHTML={{ __html: htmlString }}
    />
  );
};

export default PostViewer;
