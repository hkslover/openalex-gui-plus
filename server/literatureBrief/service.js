const crypto = require('crypto');
const axios = require('axios');
const { extractWorkAbstract, hasOpenAccess, pickSourceName } = require('./utils');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PROMPT = [
  '你是一名严谨的科研助手。',
  '你的任务是仅根据论文题目、期刊信息和摘要，为研究者生成一份“文献速览”。',
  '只能依据提供的摘要内容作答，不要补充摘要中没有明确提到的信息，不要假装读过全文。',
  '请使用简体中文输出，并严格按下面格式给出五行内容：',
  '研究问题：...',
  '方法/对象：...',
  '核心发现：...',
  '价值：...',
  '注意：如果摘要没有说明局限、数据集、方法细节或结论强度，就明确写“摘要未说明”。',
].join('\n');

const DEFAULT_SETTINGS = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  proxyUrl: '',
  prompt: DEFAULT_PROMPT,
  temperature: 0.2,
  maxTokens: 420,
};

const cache = new Map();

function normalizeLiteratureBriefSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabled: settings.enabled === true,
    baseUrl: String(settings.baseUrl || DEFAULT_SETTINGS.baseUrl).trim() || DEFAULT_SETTINGS.baseUrl,
    apiKey: String(settings.apiKey || '').trim(),
    model: String(settings.model || DEFAULT_SETTINGS.model).trim() || DEFAULT_SETTINGS.model,
    proxyUrl: String(settings.proxyUrl || '').trim(),
    prompt: String(settings.prompt || DEFAULT_SETTINGS.prompt).trim() || DEFAULT_SETTINGS.prompt,
    temperature:
      Number.isFinite(Number(settings.temperature)) &&
      Number(settings.temperature) >= 0 &&
      Number(settings.temperature) <= 2
        ? Number(settings.temperature)
        : DEFAULT_SETTINGS.temperature,
    maxTokens:
      Number.isFinite(Number(settings.maxTokens)) && Number(settings.maxTokens) > 0
        ? Number(settings.maxTokens)
        : DEFAULT_SETTINGS.maxTokens,
  };
}

function validateSettings(settings, options = {}) {
  if (options.requireEnabled && !settings.enabled) {
    throw new Error('Literature brief plugin is disabled');
  }
  if (!settings.apiKey) {
    throw new Error('Missing API key for literature brief plugin');
  }
  if (!settings.baseUrl) {
    throw new Error('Missing base URL for literature brief plugin');
  }
  if (!settings.model) {
    throw new Error('Missing model ID for literature brief plugin');
  }
}

function buildCacheKey(work, settings, abstract) {
  const input = JSON.stringify({
    id: work?.id || '',
    title: work?.title || work?.display_name || '',
    abstract,
    model: settings.model,
    baseUrl: settings.baseUrl,
    prompt: settings.prompt,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });

  return crypto.createHash('sha1').update(input).digest('hex');
}

function readCachedBrief(cacheKey) {
  const cached = cache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey);
    return null;
  }
  return cached.data;
}

function cacheBrief(cacheKey, data) {
  cache.set(cacheKey, {
    cachedAt: Date.now(),
    data,
  });
}

function buildMessages(work, abstract, settings) {
  const title = work?.title || work?.display_name || 'Untitled';
  const journal = pickSourceName(work) || 'Unknown venue';
  const year = work?.publication_year || '';

  return [
    {
      role: 'system',
      content: settings.prompt,
    },
    {
      role: 'user',
      content: [
        `Title: ${title}`,
        `Journal: ${journal}`,
        year ? `Publication year: ${year}` : '',
        '',
        'Abstract:',
        abstract,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
}

function buildRequestUrl(baseUrl) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('chat/completions', normalized).toString();
}

function parseProxyConfig(proxyUrl) {
  if (!proxyUrl) return null;

  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch (error) {
    throw new Error('Proxy URL is invalid');
  }

  const protocol = parsed.protocol.replace(':', '');
  if (!['http', 'https'].includes(protocol)) {
    throw new Error('Only http and https proxy URLs are supported');
  }

  return {
    protocol,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : protocol === 'https' ? 443 : 80,
    auth:
      parsed.username || parsed.password
        ? {
            username: decodeURIComponent(parsed.username || ''),
            password: decodeURIComponent(parsed.password || ''),
          }
        : undefined,
  };
}

function buildAxiosConfig(settings, signal) {
  const config = {
    timeout: 60000,
    signal,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'openalex-gui-literature-brief/1.0',
    },
  };

  if (settings.proxyUrl) {
    config.proxy = parseProxyConfig(settings.proxyUrl);
  }

  return config;
}

function extractErrorMessage(error, settings) {
  const providerMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    'Unknown error';

  if (providerMessage === 'socket hang up' || error?.code === 'ECONNRESET') {
    if (settings?.proxyUrl) {
      return `Connection was reset while using proxy ${settings.proxyUrl}. Please check whether the proxy is reachable and supports HTTPS forwarding.`;
    }
    return 'Connection was reset by the model provider. Please verify the base URL and model endpoint.';
  }

  if (error?.code === 'ECONNABORTED') {
    return 'The model request timed out. Please check the provider response speed or your proxy.';
  }

  if (error?.response?.status) {
    return `Model provider returned HTTP ${error.response.status}: ${providerMessage}`;
  }

  return providerMessage;
}

function extractContentFromResponse(data) {
  const firstChoice = data?.choices?.[0];
  const messageContent = firstChoice?.message?.content;

  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function stripThinkTags(content) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function createThinkTagStreamFilter() {
  const openTag = '<think>';
  const closeTag = '</think>';
  let buffer = '';
  let insideThink = false;

  return {
    push(chunk) {
      buffer += String(chunk || '');
      let output = '';

      while (buffer.length) {
        const lowerBuffer = buffer.toLowerCase();

        if (insideThink) {
          const closeIndex = lowerBuffer.indexOf(closeTag);
          if (closeIndex === -1) {
            const keep = Math.min(buffer.length, closeTag.length - 1);
            buffer = buffer.slice(-keep);
            return output;
          }

          buffer = buffer.slice(closeIndex + closeTag.length);
          insideThink = false;
          continue;
        }

        const openIndex = lowerBuffer.indexOf(openTag);
        if (openIndex === -1) {
          const keep = Math.min(buffer.length, openTag.length - 1);
          const emitLength = buffer.length - keep;
          if (emitLength > 0) {
            output += buffer.slice(0, emitLength);
            buffer = buffer.slice(emitLength);
          }
          return output;
        }

        output += buffer.slice(0, openIndex);
        buffer = buffer.slice(openIndex + openTag.length);
        insideThink = true;
      }

      return output;
    },

    flush() {
      if (insideThink) {
        buffer = '';
        return '';
      }

      const output = String(buffer || '')
        .replace(/<\/?think>?/gi, '')
        .replace(/<\/?thin?$/gi, '')
        .replace(/<\/?thi?$/gi, '')
        .replace(/<\/?th?$/gi, '')
        .replace(/<\/?t?$/gi, '');

      buffer = '';
      return output;
    },
  };
}

function extractDeltaContent(choice = {}) {
  const delta = choice?.delta || {};
  const content = delta?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('');
  }

  if (typeof delta?.text === 'string') {
    return delta.text;
  }

  return '';
}

function parseStreamEventBlock(block) {
  const lines = String(block || '')
    .split(/\r?\n/)
    .filter(Boolean);

  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (!dataLines.length) return null;
  return dataLines.join('\n');
}

function findSseBoundary(buffer) {
  const lfBoundary = buffer.indexOf('\n\n');
  const crlfBoundary = buffer.indexOf('\r\n\r\n');

  if (lfBoundary === -1) return crlfBoundary;
  if (crlfBoundary === -1) return lfBoundary;
  return Math.min(lfBoundary, crlfBoundary);
}

function boundaryLengthAt(buffer, index) {
  return buffer.slice(index, index + 4) === '\r\n\r\n' ? 4 : 2;
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === 'function') {
    res.flush();
  }
}

async function generateLiteratureBrief({ work = {}, settings = {}, signal } = {}) {
  const normalized = normalizeLiteratureBriefSettings(settings);
  validateSettings(normalized, { requireEnabled: true });

  if (!hasOpenAccess(work)) {
    throw new Error('Literature brief is available only for open access works');
  }

  const abstract = extractWorkAbstract(work);
  if (!abstract) {
    throw new Error('No abstract is available for this work');
  }

  const cacheKey = buildCacheKey(work, normalized, abstract);
  const cached = readCachedBrief(cacheKey);
  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  let response;
  try {
    response = await axios.post(
      buildRequestUrl(normalized.baseUrl),
      {
        model: normalized.model,
        temperature: normalized.temperature,
        max_tokens: normalized.maxTokens,
        messages: buildMessages(work, abstract, normalized),
      },
      buildAxiosConfig(normalized, signal),
    );
  } catch (error) {
    const message = extractErrorMessage(error, normalized);
    const wrapped = new Error(message);
    wrapped.code = error?.code;
    wrapped.status = error?.response?.status;
    throw wrapped;
  }

  const content = extractContentFromResponse(response.data);
  const sanitizedContent = stripThinkTags(content);
  if (!sanitizedContent) {
    throw new Error('Model response did not include any summary text');
  }

  const result = {
    cached: false,
    model: normalized.model,
    providerBaseUrl: normalized.baseUrl,
    content: sanitizedContent,
  };

  cacheBrief(cacheKey, result);
  return result;
}

async function testLiteratureBriefConnection({ settings = {}, signal } = {}) {
  const normalized = normalizeLiteratureBriefSettings(settings);
  validateSettings(normalized);

  try {
    const response = await axios.post(
      buildRequestUrl(normalized.baseUrl),
      {
        model: normalized.model,
        temperature: 0,
        max_tokens: 32,
        messages: [
          {
            role: 'system',
            content: 'Reply with exactly: OK',
          },
          {
            role: 'user',
            content: 'Return the exact text OK.',
          },
        ],
      },
      buildAxiosConfig(normalized, signal),
    );

    const content = stripThinkTags(extractContentFromResponse(response.data));
    return {
      ok: true,
      model: normalized.model,
      providerBaseUrl: normalized.baseUrl,
      proxyUrl: normalized.proxyUrl || '',
      content,
    };
  } catch (error) {
    const message = extractErrorMessage(error, normalized);
    const wrapped = new Error(message);
    wrapped.code = error?.code;
    wrapped.status = error?.response?.status;
    throw wrapped;
  }
}

async function streamLiteratureBrief({
  work = {},
  settings = {},
  signal,
  onStart,
  onToken,
  onDone,
} = {}) {
  const normalized = normalizeLiteratureBriefSettings(settings);
  validateSettings(normalized, { requireEnabled: true });

  if (!hasOpenAccess(work)) {
    throw new Error('Literature brief is available only for open access works');
  }

  const abstract = extractWorkAbstract(work);
  if (!abstract) {
    throw new Error('No abstract is available for this work');
  }

  const cacheKey = buildCacheKey(work, normalized, abstract);
  const cached = readCachedBrief(cacheKey);
  if (cached) {
    if (onStart) {
      await onStart({ cached: true, model: normalized.model });
    }
    if (onToken && cached.content) {
      await onToken(cached.content);
    }
    if (onDone) {
      await onDone({
        cached: true,
        model: normalized.model,
        providerBaseUrl: normalized.baseUrl,
        content: cached.content,
      });
    }
    return {
      cached: true,
      model: normalized.model,
      providerBaseUrl: normalized.baseUrl,
      content: cached.content,
    };
  }

  let response;
  try {
    response = await axios.post(
      buildRequestUrl(normalized.baseUrl),
      {
        model: normalized.model,
        temperature: normalized.temperature,
        max_tokens: normalized.maxTokens,
        stream: true,
        messages: buildMessages(work, abstract, normalized),
      },
      {
        ...buildAxiosConfig(normalized, signal),
        responseType: 'stream',
      },
    );
  } catch (error) {
    const message = extractErrorMessage(error, normalized);
    const wrapped = new Error(message);
    wrapped.code = error?.code;
    wrapped.status = error?.response?.status;
    throw wrapped;
  }

  if (onStart) {
    await onStart({ cached: false, model: normalized.model });
  }

  const stream = response.data;
  const thinkFilter = createThinkTagStreamFilter();
  let buffer = '';
  let content = '';

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.removeAllListeners('data');
      stream.removeAllListeners('end');
      stream.removeAllListeners('error');
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    };

    const handleAbort = () => {
      cleanup();
      stream.destroy();
      reject(new Error('Request aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort);
    }

    stream.on('data', async (chunk) => {
      buffer += chunk.toString('utf8');

      let boundaryIndex = findSseBoundary(buffer);
      while (boundaryIndex !== -1) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + boundaryLengthAt(buffer, boundaryIndex));
        boundaryIndex = findSseBoundary(buffer);

        const data = parseStreamEventBlock(block);
        if (!data) continue;
        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0] || {};
          const deltaText = extractDeltaContent(choice);
          if (deltaText) {
            const visibleDelta = thinkFilter.push(deltaText);
            if (visibleDelta) {
              content += visibleDelta;
              if (onToken) {
                await onToken(visibleDelta);
              }
            }
          }
        } catch (error) {
          // Ignore provider keepalive or non-JSON chunks.
        }
      }
    });

    stream.on('end', () => {
      cleanup();
      resolve();
    });

    stream.on('error', (error) => {
      cleanup();
      reject(error);
    });
  }).catch((error) => {
    const message = extractErrorMessage(error, normalized);
    const wrapped = new Error(message);
    wrapped.code = error?.code;
    wrapped.status = error?.response?.status;
    throw wrapped;
  });

  const finalVisible = thinkFilter.flush();
  if (finalVisible) {
    content += finalVisible;
    if (onToken) {
      await onToken(finalVisible);
    }
  }

  if (!content.trim()) {
    throw new Error('Model response did not include any summary text');
  }

  const result = {
    cached: false,
    model: normalized.model,
    providerBaseUrl: normalized.baseUrl,
    content,
  };

  cacheBrief(cacheKey, result);

  if (onDone) {
    await onDone(result);
  }

  return result;
}

module.exports = {
  DEFAULT_PROMPT,
  generateLiteratureBrief,
  normalizeLiteratureBriefSettings,
  streamLiteratureBrief,
  testLiteratureBriefConnection,
  writeSse,
};
