import React from 'react';

/**
 * Converte texto com formatação WhatsApp para elementos React
 * Suporta: *negrito*, _itálico_, ~riscado~, ```monospace```
 * Também converte URLs em links clicáveis
 */
export function formatWhatsAppText(text: string): React.ReactNode {
  if (!text) return null;

  // Regex para detectar URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Primeiro, vamos dividir o texto em partes (URLs e não-URLs)
  const parts: React.ReactNode[] = [];

  // Processa URLs primeiro
  const textWithPlaceholders: { text: string; urls: string[] } = {
    text: text,
    urls: []
  };

  // Substitui URLs por placeholders temporários
  const urlMatches = text.match(urlRegex) || [];
  let processedText = text;
  urlMatches.forEach((url, index) => {
    textWithPlaceholders.urls.push(url);
    processedText = processedText.replace(url, `__URL_PLACEHOLDER_${index}__`);
  });

  // Agora processa a formatação WhatsApp
  const formattedParts = processWhatsAppFormatting(processedText);

  // Restaura URLs como links clicáveis
  return restoreUrls(formattedParts, textWithPlaceholders.urls);
}

function processWhatsAppFormatting(text: string): React.ReactNode {
  // Padrões de formatação WhatsApp (ordem importa!)
  const patterns = [
    { regex: /\*([^*]+)\*/g, tag: 'strong' },           // *negrito*
    { regex: /_([^_]+)_/g, tag: 'em' },                 // _itálico_
    { regex: /~([^~]+)~/g, tag: 's' },                  // ~riscado~
    { regex: /```([^`]+)```/g, tag: 'code' },           // ```código```
    { regex: /`([^`]+)`/g, tag: 'code' },               // `código inline`
  ];

  let result: React.ReactNode = text;
  let keyCounter = 0;

  // Aplica cada padrão
  for (const pattern of patterns) {
    if (typeof result === 'string') {
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      const regex = new RegExp(pattern.regex.source, 'g');
      
      while ((match = regex.exec(result)) !== null) {
        // Adiciona texto antes do match
        if (match.index > lastIndex) {
          parts.push(result.substring(lastIndex, match.index));
        }

        // Adiciona o elemento formatado
        const content = match[1];
        const element = React.createElement(
          pattern.tag,
          { 
            key: `fmt-${keyCounter++}`,
            className: pattern.tag === 'code' 
              ? 'bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono' 
              : undefined
          },
          content
        );
        parts.push(element);

        lastIndex = match.index + match[0].length;
      }

      // Adiciona o resto do texto
      if (lastIndex < result.length) {
        parts.push(result.substring(lastIndex));
      }

      // Se houve substituições, usa o array de partes
      if (parts.length > 0 && parts.length !== 1) {
        result = parts;
      } else if (parts.length === 1 && typeof parts[0] !== 'string') {
        result = parts;
      }
    }
  }

  return result;
}

function restoreUrls(content: React.ReactNode, urls: string[]): React.ReactNode {
  if (!urls.length) return content;

  const processNode = (node: React.ReactNode, keyPrefix: string = ''): React.ReactNode => {
    if (typeof node === 'string') {
      // Verifica se há placeholders de URL neste texto
      const placeholderRegex = /__URL_PLACEHOLDER_(\d+)__/g;
      let match;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let keyCounter = 0;

      while ((match = placeholderRegex.exec(node)) !== null) {
        // Texto antes do placeholder
        if (match.index > lastIndex) {
          parts.push(node.substring(lastIndex, match.index));
        }

        // O link
        const urlIndex = parseInt(match[1], 10);
        const url = urls[urlIndex];
        parts.push(
          <a
            key={`${keyPrefix}url-${keyCounter++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline break-all"
          >
            {url}
          </a>
        );

        lastIndex = match.index + match[0].length;
      }

      // Resto do texto
      if (lastIndex < node.length) {
        parts.push(node.substring(lastIndex));
      }

      return parts.length > 1 ? parts : (parts.length === 1 ? parts[0] : node);
    }

    if (Array.isArray(node)) {
      return node.map((child, index) => processNode(child, `${keyPrefix}${index}-`));
    }

    if (React.isValidElement(node)) {
      const element = node as React.ReactElement;
      const children = element.props.children;
      if (children) {
        return React.cloneElement(element, {
          ...element.props,
          children: processNode(children, `${keyPrefix}child-`)
        });
      }
    }

    return node;
  };

  return processNode(content);
}
