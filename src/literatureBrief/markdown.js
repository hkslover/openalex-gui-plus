import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const markdown = new MarkdownIt({
  breaks: true,
  linkify: true,
  html: false,
});

export function renderLiteratureBriefMarkdown(content = '') {
  const rendered = markdown.render(String(content || ''));
  return sanitizeHtml(rendered, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'blockquote',
      'code',
      'pre',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'a',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
  });
}
