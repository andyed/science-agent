'use strict';

const https = require('https');

const CROSSREF_MAILTO = process.env.SCIENCE_AGENT_CROSSREF_MAILTO || '';
const CROSSREF_UA = CROSSREF_MAILTO
    ? `science-agent/0.6 (+https://github.com/andyed/science-agent; mailto:${CROSSREF_MAILTO})`
    : 'science-agent/0.6 (+https://github.com/andyed/science-agent)';

function withMailto(url) {
    if (!CROSSREF_MAILTO) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}mailto=${encodeURIComponent(CROSSREF_MAILTO)}`;
}

function retryDelay(res, attempt) {
    const retryAfter = res.headers['retry-after'];
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) return Math.max(250, seconds * 1000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.max(250, date - Date.now());
    }
    return Math.min(1000 * (2 ** attempt), 8000);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify a DOI against CrossRef.
 * Returns { verified, title, authors, journal, year } or { verified: false, error }.
 */
function verifyDOI(doi, options = {}) {
    const normalizedDOI = String(doi || '')
        .trim()
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        .replace(/^doi:\s*/i, '');
    const maxAttempts = Math.max(1, parseInt(options.maxAttempts, 10) || 5);

    async function attemptRequest(attempt, requestURL = null, redirects = 0) {
        const result = await new Promise((resolve) => {
            const url = requestURL || withMailto(`https://api.crossref.org/works/${encodeURIComponent(normalizedDOI)}`);
            const req = https.get(url, { headers: { 'User-Agent': CROSSREF_UA } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        resolve({ redirect: new URL(res.headers.location, url).toString() });
                        return;
                    }
                    if (res.statusCode !== 200) {
                        const retryable = res.statusCode === 429 || res.statusCode >= 500;
                        resolve({
                            verified: false,
                            error: `HTTP ${res.statusCode}`,
                            statusCode: res.statusCode,
                            retryable,
                            retryInMs: retryable ? retryDelay(res, attempt) : null,
                            doi: normalizedDOI,
                        });
                        return;
                    }
                    try {
                        const json = JSON.parse(data);
                        const msg = json.message;
                        const authors = (msg.author || []).map(a => `${a.family}, ${a.given}`);
                        const title = (msg.title || [''])[0];
                        const journal = (msg['container-title'] || [''])[0];
                        const years = [...new Set([
                            msg.published?.['date-parts']?.[0]?.[0],
                            msg['published-print']?.['date-parts']?.[0]?.[0],
                            msg['published-online']?.['date-parts']?.[0]?.[0],
                            msg.issued?.['date-parts']?.[0]?.[0],
                            msg.created?.['date-parts']?.[0]?.[0],
                        ].filter(Boolean))];
                        const year = years[0] || null;
                        resolve({
                            verified: true,
                            title,
                            authors,
                            journal,
                            year,
                            years,
                            volume: msg.volume || null,
                            pages: msg.page || msg['article-number'] || null,
                            type: msg.type || null,
                            doi: String(msg.DOI || normalizedDOI).toLowerCase(),
                        });
                    } catch (e) {
                        resolve({ verified: false, error: `parse error: ${e.message}`, doi: normalizedDOI });
                    }
                });
            });
            req.on('error', (e) => resolve({ verified: false, error: e.message, doi: normalizedDOI }));
            req.setTimeout(10000, () => { req.destroy(); resolve({ verified: false, error: 'timeout', doi: normalizedDOI }); });
        });

        if (result.redirect) {
            if (redirects >= 5) return { verified: false, error: 'too many redirects', doi: normalizedDOI };
            return attemptRequest(attempt, result.redirect, redirects + 1);
        }
        if (!result.verified && result.retryable && attempt + 1 < maxAttempts) {
            await wait(result.retryInMs);
            return attemptRequest(attempt + 1, requestURL, redirects);
        }
        if (!result.verified && result.retryable) result.error += ` after ${maxAttempts} attempts`;
        delete result.retryInMs;
        return result;
    }

    return attemptRequest(0);
}

/**
 * Search CrossRef by title (fuzzy).
 * Returns top 3 matches with { title, authors, doi, score }.
 */
function searchByTitle(title) {
    return new Promise((resolve) => {
        const query = encodeURIComponent(title);
        const url = withMailto(`https://api.crossref.org/works?query.bibliographic=${query}&rows=3`);
        const req = https.get(url, { headers: { 'User-Agent': CROSSREF_UA } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    resolve([]);
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    const items = (json.message?.items || []).map(item => ({
                        title: (item.title || [''])[0],
                        authors: (item.author || []).map(a => `${a.family}, ${a.given}`),
                        doi: item.DOI,
                        year: item.published?.['date-parts']?.[0]?.[0] || null,
                        score: item.score || 0,
                    }));
                    resolve(items);
                } catch (e) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.setTimeout(10000, () => { req.destroy(); resolve([]); });
    });
}

module.exports = { verifyDOI, searchByTitle };


// Running a src/ module directly exits 0 and prints nothing, which for an
// audit tool is indistinguishable from a clean result. Fail loudly instead.
if (require.main === module) {
    console.error(
        `science-agent: src/crossref.js is a library, not a command.\n` +
        'Invoking it directly produces no output and no findings, whatever the input.\n' +
        'Use:\n' +
        '  node cli.js verify <doi>   (or: search "title")\n'
    );
    process.exit(2);
}
