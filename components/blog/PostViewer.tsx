
import React, { useEffect, useMemo, useRef } from 'react';

interface PostViewerProps {
  content: any;
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
          normalized = typeof parsed === 'string' ? parsed : content;
        } catch {
          normalized = content;
        }
      } else {
        normalized = content;
      }
    } else if (content && typeof content === 'object') {
      // Legacy Tiptap JSON — convert to readable placeholder
      normalized = `<p class="text-[#5D5A53] italic">Content is in legacy format. Please re-seed this article.</p>`;
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
