/**
 * Markdown → HTML converter for journal posts.
 * Used by PostViewer (runtime) and seed scripts (batch import).
 */

export function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  return (trimmed.match(/\|/g) || []).length >= 2;
}

export function isMarkdownTableSeparator(line: string): boolean {
  return /^\|[\s:|,-]+\|$/.test(line.trim());
}

export function markdownInlineFormat(text: string): string {
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="text-[#8B7644] font-medium">$2</span>');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '<span class="text-[#8B7644] font-medium">$1</span>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#2C2A26]">$1</strong>');
  text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  text = text.replace(
    /`([^`]+)`/g,
    '<code class="bg-[#F5F0E8] border border-[#D4C5A9] px-1.5 py-0.5 rounded text-sm font-mono text-[#8B4513]">$1</code>'
  );
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-[#8B7644] underline underline-offset-2 hover:text-[#5C4F2A]" target="_blank" rel="noopener">$1</a>'
  );
  return text;
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return withoutTrailing.split('|').map((cell) => cell.trim());
}

function tableRowHtml(cells: string[], isHeader: boolean): string {
  const tag = isHeader ? 'th' : 'td';
  const cellClass = isHeader
    ? 'font-semibold text-[#2C2A26] px-4 py-3 text-left text-xs uppercase tracking-wider'
    : 'px-4 py-3 border-t border-[#E8E0D0] align-top';
  const rowClass = isHeader ? '' : 'hover:bg-[#F5F2EC]';
  return `<tr class="${rowClass}">${cells
    .map((cell) => `<${tag} class="${cellClass}">${markdownInlineFormat(cell)}</${tag}>`)
    .join('')}</tr>`;
}

/** Convert markdown table row strings (no separator rows) into a styled HTML table. */
export function markdownTableRowsToHtml(rows: string[]): string {
  if (rows.length === 0) return '';

  const headerCells = parseTableCells(rows[0]);
  const headerRow = tableRowHtml(headerCells, true);
  const bodyRows = rows.slice(1).map((row) => tableRowHtml(parseTableCells(row), false));

  return `<div class="overflow-x-auto mb-8 rounded-lg border border-[#D4C5A9]">
<table class="min-w-full text-sm text-[#5D5A53]">
<thead class="bg-[#EBE7DE]">${headerRow}</thead>
<tbody>
${bodyRows.join('\n')}
</tbody>
</table></div>`;
}

export function markdownToHtml(md: string): string {
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
      html += `${markdownTableRowsToHtml(tableRows)}\n`;
      tableRows = [];
      inTable = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        if (codeLang.toLowerCase() === 'mermaid') {
          html += `<div class="mermaid mb-8">${codeContent.trim()}</div>\n`;
        } else {
          const langLabel = codeLang
            ? `<span class="text-xs font-mono text-[#A0998C] mb-1 block">${codeLang}</span>`
            : '';
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

    if (isMarkdownTableRow(line)) {
      flushList();
      if (isMarkdownTableSeparator(line)) {
        i++;
        continue;
      }
      if (!inTable) inTable = true;
      tableRows.push(line.trim());
      i++;
      continue;
    } else if (inTable) {
      flushTable();
    }

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
        if (bodyLine) calloutBody += `<p class="mb-1">${markdownInlineFormat(bodyLine)}</p>`;
        i++;
      }
      html += `<div class="border-l-4 ${calloutStyle} pl-4 pr-4 py-3 rounded-r-lg mb-6">\n<p class="text-xs font-bold uppercase tracking-wider mb-2 opacity-70">${calloutType}</p>${calloutBody}</div>\n`;
      continue;
    }

    if (line.trim().startsWith('> ')) {
      flushList();
      let fullQuote = line.replace(/^>\s*/, '').trim();
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++;
        const nextLine = lines[i].replace(/^>\s*/, '').trim();
        if (nextLine) fullQuote += ' ' + nextLine;
      }
      html += `<blockquote class="border-l-4 border-[#8B7644] pl-5 my-6 italic text-[#5D5A53] text-lg leading-relaxed">${markdownInlineFormat(fullQuote)}</blockquote>\n`;
      i++;
      continue;
    }

    if (/^# (?!#)/.test(line)) {
      flushList();
      flushTable();
      html += `<h1 class="text-3xl font-serif text-[#2C2A26] mb-6 mt-12 leading-tight">${markdownInlineFormat(line.replace(/^# /, ''))}</h1>\n`;
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      flushTable();
      html += `<h2 class="text-2xl font-serif text-[#2C2A26] mb-4 mt-10 pb-2 border-b border-[#E8E0D0] leading-tight">${markdownInlineFormat(line.replace(/^## /, ''))}</h2>\n`;
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      flushTable();
      html += `<h3 class="text-xl font-serif text-[#2C2A26] mb-3 mt-8 leading-snug">${markdownInlineFormat(line.replace(/^### /, ''))}</h3>\n`;
      i++;
      continue;
    }
    if (line.startsWith('#### ')) {
      flushList();
      flushTable();
      html += `<h4 class="text-base font-bold text-[#2C2A26] mb-2 mt-6 uppercase tracking-wide">${markdownInlineFormat(line.replace(/^#### /, ''))}</h4>\n`;
      i++;
      continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      flushTable();
      if (inOrderedList) flushList();
      inList = true;
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const item = line.replace(/^\s*[-*]\s/, '').replace(/\[[ x/]\]\s*/, '').trim();
      const indentClass = indent >= 4 ? 'ml-4' : '';
      listItems.push(`  <li class="mb-1 ${indentClass}">${markdownInlineFormat(item)}</li>`);
      i++;
      continue;
    }

    if (/^\s*\d+\.\s/.test(line)) {
      flushTable();
      if (inList) flushList();
      inOrderedList = true;
      const item = line.replace(/^\s*\d+\.\s/, '').trim();
      olItems.push(`  <li class="mb-1">${markdownInlineFormat(item)}</li>`);
      i++;
      continue;
    }

    if (line.trim() === '---' || line.trim() === '***') {
      flushList();
      flushTable();
      html += `<hr class="my-10 border-[#D4C5A9]" />\n`;
      i++;
      continue;
    }

    if (line.trim() === '') {
      flushList();
      i++;
      continue;
    }

    flushList();
    flushTable();
    html += `<p class="mb-5 text-[#5D5A53] leading-relaxed">${markdownInlineFormat(line.trim())}</p>\n`;
    i++;
  }

  flushList();
  flushTable();

  return html;
}

export function looksLikeHtmlContent(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

export function containsMarkdownTable(text: string): boolean {
  return text.split('\n').some((line) => isMarkdownTableRow(line));
}
