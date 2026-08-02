import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createContentHash } from "@/lib/ingestion/hash";

const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const SKIPPED_EXTENSIONS = /\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|mp3|mp4|mov|pdf|png|pptx?|rar|rss|svg|tar|webp|woff2?|xlsx?|xml|zip)$/i;

export type CrawledPage = {
  url: string;
  title: string;
  text: string;
  contentHash: string;
  status: number;
};

export type CrawlPreview = {
  startUrl: string;
  pages: CrawledPage[];
  skipped: Array<{ url: string; reason: string }>;
};

export function normalizeCrawlUrl(input: string) {
  const value = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Only HTTP and HTTPS website URLs are supported.');
  }
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS website URLs are supported.');
  if (url.username || url.password) throw new Error('Website URLs cannot contain credentials.');
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) {
    throw new Error('Custom website ports are not allowed.');
  }
  url.hash = '';
  return url;
}

function ipv4Number(address: string) {
  return address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

export function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const value = ipv4Number(address);
    const inRange = (base: string, bits: number) => (value >>> (32 - bits)) === (ipv4Number(base) >>> (32 - bits));
    return inRange('0.0.0.0', 8) || inRange('10.0.0.0', 8) || inRange('100.64.0.0', 10) ||
      inRange('127.0.0.0', 8) || inRange('169.254.0.0', 16) || inRange('172.16.0.0', 12) ||
      inRange('192.0.0.0', 24) || inRange('192.0.2.0', 24) || inRange('192.168.0.0', 16) ||
      inRange('198.18.0.0', 15) || inRange('198.51.100.0', 24) || inRange('203.0.113.0', 24) ||
      inRange('224.0.0.0', 4) || inRange('240.0.0.0', 4);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
  }
  return true;
}

async function resolvePublicHost(hostname: string) {
  if (hostname.toLowerCase() === 'localhost' || hostname.endsWith('.local')) throw new Error('Local network addresses cannot be crawled.');
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('The website resolves to a private or reserved network address.');
  }
  return addresses[0];
}

type SafeResponse = { url: URL; status: number; contentType: string; body: string };

async function requestOnce(url: URL): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const resolved = await resolvePublicHost(url.hostname);
  return new Promise((resolve, reject) => {
    const requester = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = requester({
      protocol: url.protocol,
      hostname: resolved.address,
      family: resolved.family,
      port: url.protocol === 'https:' ? 443 : 80,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      headers: {
        Host: url.host,
        Accept: 'text/html,application/xhtml+xml,text/plain,application/xml;q=0.8',
        'Accept-Encoding': 'identity',
        'User-Agent': 'K-Labs-Knowledge-Crawler/1.0',
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('The page is larger than the 2 MB crawl limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('The website took too long to respond.')));
    request.on('error', reject);
    request.end();
  });
}

async function safeGet(input: URL, redirects = 0): Promise<SafeResponse> {
  if (redirects > MAX_REDIRECTS) throw new Error('The website redirected too many times.');
  const url = normalizeCrawlUrl(input.toString());
  const response = await requestOnce(url);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.location;
    if (typeof location !== 'string') throw new Error('The website returned an invalid redirect.');
    return safeGet(new URL(location, url), redirects + 1);
  }
  return {
    url,
    status: response.status,
    contentType: String(response.headers['content-type'] || '').toLowerCase(),
    body: response.body,
  };
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
      const point = Number.parseInt(entity.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : ' ';
    }
    return named[entity.toLowerCase()] ?? ' ';
  });
}

function stripMarkup(html: string) {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function extractPage(html: string, pageUrl: URL) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const canonicalMatch = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i);
  const contentMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const text = stripMarkup(contentMatch?.[1] || html);
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => {
      try { return new URL(decodeEntities(match[1]), pageUrl); } catch { return null; }
    })
    .filter((url): url is URL => Boolean(url))
    .filter((url) => ['http:', 'https:'].includes(url.protocol) && url.hostname === pageUrl.hostname && !SKIPPED_EXTENSIONS.test(url.pathname))
    .map((url) => { url.hash = ''; return url.toString(); });
  let canonicalUrl: string | undefined;
  try { canonicalUrl = canonicalMatch?.[1] ? new URL(canonicalMatch[1], pageUrl).toString() : undefined; } catch { canonicalUrl = undefined; }
  return {
    title: stripMarkup(titleMatch?.[1] || '') || pageUrl.hostname,
    text,
    links: [...new Set(links)],
    canonicalUrl,
  };
}

function robotsAllows(path: string, robots: string) {
  let relevant = false;
  const disallowed: string[] = [];
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (key?.toLowerCase() === 'user-agent') relevant = value === '*';
    if (relevant && key?.toLowerCase() === 'disallow' && value) disallowed.push(value);
  }
  return !disallowed.some((rule) => path.startsWith(rule));
}

export async function crawlWebsite(input: string, options: { maxPages?: number; allowedHost?: string } = {}): Promise<CrawlPreview> {
  const start = normalizeCrawlUrl(input);
  const allowedHost = options.allowedHost?.replace(/^www\./, '').toLowerCase();
  if (allowedHost && start.hostname.replace(/^www\./, '').toLowerCase() !== allowedHost) {
    throw new Error('The crawl URL must belong to this project website.');
  }
  const maxPages = Math.min(Math.max(options.maxPages ?? 20, 1), 25);
  let robots = '';
  try {
    const response = await safeGet(new URL('/robots.txt', start));
    if (response.status === 200 && response.body.length < 250_000) robots = response.body;
  } catch { /* A missing robots file does not block the crawl. */ }

  const queue = [start.toString()];
  const visited = new Set<string>();
  const hashes = new Set<string>();
  const pages: CrawledPage[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  while (queue.length && pages.length < maxPages && visited.size < maxPages * 4) {
    const batch: URL[] = [];
    while (queue.length && batch.length < 4 && visited.size < maxPages * 4) {
      const queuedUrl = queue.shift()!;
      if (visited.has(queuedUrl)) continue;
      visited.add(queuedUrl);
      const url = normalizeCrawlUrl(queuedUrl);
      if (url.hostname !== start.hostname || !robotsAllows(`${url.pathname}${url.search}`, robots)) {
        skipped.push({ url: url.toString(), reason: url.hostname !== start.hostname ? 'Off-domain URL' : 'Blocked by robots.txt' });
      } else {
        batch.push(url);
      }
    }
    const results = await Promise.all(batch.map(async (url) => {
      try {
        const response = await safeGet(url);
        if (response.url.hostname !== start.hostname) throw new Error('Redirected outside the project website.');
        if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
        if (!response.contentType.includes('text/html') && !response.contentType.includes('text/plain')) throw new Error('Not an HTML page.');
        const extracted = extractPage(response.body, response.url);
        if (extracted.text.length < 80) throw new Error('Page has too little readable content.');
        return { response, extracted };
      } catch (error) {
        skipped.push({ url: url.toString(), reason: error instanceof Error ? error.message : 'Could not crawl page.' });
        return null;
      }
    }));
    for (const result of results) {
      if (!result) continue;
      const { response, extracted } = result;
      const contentHash = createContentHash(extracted.text);
      if (hashes.has(contentHash)) {
        skipped.push({ url: response.url.toString(), reason: 'Duplicate content' });
      } else if (pages.length < maxPages) {
        hashes.add(contentHash);
        pages.push({ url: response.url.toString(), title: extracted.title, text: extracted.text, contentHash, status: response.status });
      }
      for (const link of extracted.links) if (!visited.has(link) && queue.length < maxPages * 3) queue.push(link);
    }
  }
  if (!pages.length) throw new Error(skipped[0]?.reason || 'No readable website pages were found.');
  return { startUrl: start.toString(), pages, skipped };
}
