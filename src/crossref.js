'use strict';

const https = require('https');

/**
 * Verify a DOI against CrossRef.
 * Returns { verified, title, authors, journal, year } or { verified: false, error }.
 */
function verifyDOI(doi) {
    return new Promise((resolve) => {
        const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        const req = https.get(url, { headers: { 'User-Agent': 'science-agent/0.1 (https://github.com/andyed/science-agent)' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    resolve({ verified: false, error: `HTTP ${res.statusCode}` });
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    const msg = json.message;
                    const authors = (msg.author || []).map(a => `${a.family}, ${a.given}`);
                    const title = (msg.title || [''])[0];
                    const journal = (msg['container-title'] || [''])[0];
                    const year = msg.published?.['date-parts']?.[0]?.[0] || null;
                    resolve({ verified: true, title, authors, journal, year, doi });
                } catch (e) {
                    resolve({ verified: false, error: `parse error: ${e.message}` });
                }
            });
        });
        req.on('error', (e) => resolve({ verified: false, error: e.message }));
        req.setTimeout(10000, () => { req.destroy(); resolve({ verified: false, error: 'timeout' }); });
    });
}

/**
 * Search CrossRef by title (fuzzy).
 * Returns top 3 matches with { title, authors, doi, score }.
 */
function searchByTitle(title) {
    return new Promise((resolve) => {
        const query = encodeURIComponent(title);
        const url = `https://api.crossref.org/works?query.bibliographic=${query}&rows=3`;
        const req = https.get(url, { headers: { 'User-Agent': 'science-agent/0.1' } }, (res) => {
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
