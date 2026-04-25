
import React, { useEffect, useMemo, useRef } from 'react';

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

function renderLegacyNodes(nodes?: any[]): string {
  if (!nodes || !Array.isArray(nodes)) return '';

  return nodes
    .map((node) => {
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
        default:
          return children;
      }
    })
    .join('');
}

/**
 * PostViewer renders article content stored in the `posts` table.
 * Content is stored as an HTML string produced by the seed script's
 * markdownToHtml converter. We render it with dangerouslySetInnerHTML
 * inside a styled prose container.
 */
const PostViewer: React.FC<PostViewerProps> = ({ content }) => {
  // Normalise: content may be a plain HTML string or accidentally
  // double-serialised JSON. Handle both gracefully.
  const containerRef = useRef<HTMLDivElement>(null);

  const htmlString = useMemo(() => {
    let normalized = '';

    if (typeof content === 'string') {
      // Check if it's a JSON-stringified string (legacy)
      if (content.trim().startsWith('"') || content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'string') {
            normalized = parsed;
          } else if (parsed?.type === 'doc') {
            normalized = renderLegacyNodes(parsed.content);
          } else if (typeof parsed?.html === 'string') {
            normalized = parsed.html;
          } else {
            normalized = content;
          }
        } catch {
          normalized = content;
        }
      } else {
        normalized = content;
      }
    } else if (content && typeof content === 'object') {
      if (content?.type === 'doc') {
        normalized = renderLegacyNodes(content.content);
      } else if (typeof content?.html === 'string') {
        normalized = content.html;
      } else if (typeof content?.content === 'string') {
        normalized = content.content;
      } else {
        normalized = `<p class="text-[#5D5A53] italic">Unsupported content format.</p>`;
      }
    } else {
      normalized = '';
    }

    return normalized;
  }, [content]);

  useEffect(() => {
    const renderMermaid = async () => {
      if (!containerRef.current) return;

      // Backward compatibility: older published posts stored Mermaid as
      // generic code blocks. Convert those blocks on the fly.
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

        // Replace the entire wrapper when possible (includes language label).
        if (wrapper && wrapper.tagName.toLowerCase() === 'div') {
          wrapper.replaceWith(mermaidDiv);
        } else {
          preNode.replaceWith(mermaidDiv);
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

      // Mermaid marks rendered nodes; clear for re-renders/content updates.
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
