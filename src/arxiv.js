'use strict';

// Audit citations from arXiv papers against CrossRef.
// Fetches recent papers via arXiv API, extracts references from HTML versions,
// and verifies DOIs and titles against CrossRef.

const https = require('https');
const { verifyDOI, searchByTitle } = require('./crossref');

const CROSSREF_UA = 'science-agent/0.1 (https://github.com/andyed/science-agent)';

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': CROSSREF_UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Jaccard similarity on word sets
function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const norm = s => new Set(s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const sa = norm(a), sb = norm(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// Check if claimed title contains all significant words from CrossRef title
function titleContainsAll(claimed, actual) {
  if (!claimed || !actual) return false;
  const claimedWords = new Set(claimed.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const actualWords = actual.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  return actualWords.length > 0 && actualWords.every(w => claimedWords.has(w));
}

async function getRecentPapers(count, category) {
  const xml = await fetchURL(
    `https://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${count}`
  );
  const papers = [];
  const entries = xml.split('<entry>').slice(1);
  for (const entry of entries) {
    const id = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/)?.[1]?.replace(/v\d+$/, '');
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
    const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map(m => m[1]);
    if (id && title) papers.push({ id, title, authors });
  }
  return papers;
}

async function getRefsFromHTML(arxivId) {
  try {
    const html = await fetchURL(`https://arxiv.org/html/${arxivId}v1`);
    const refSection = html.slice(html.lastIndexOf('References'));
    const refPattern = /<li[^>]*id="bib[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    const refs = [];
    let m;
    while ((m = refPattern.exec(refSection)) !== null) {
      const raw = m[1];
      const doiMatch = raw.match(/doi\.org\/([^"<\s]+)/i);
      const doi = doiMatch ? doiMatch[1].replace(/['"]+$/, '') : null;
      const citeMatch = raw.match(/<cite[^>]*class="ltx_cite[^"]*"[^>]*>([^<]+)<\/cite>/);
      const italicMatch = raw.match(/<i[^>]*>([^<]{10,})<\/i>/);
      const clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const titleMatch = clean.match(/\(\d{4}\)\s*\.?\s*([^.]{15,}?)(?:\.\s|$)/);
      const title = citeMatch?.[1] || titleMatch?.[1]?.trim() || italicMatch?.[1]?.trim() || null;
      const yearMatch = clean.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      refs.push({ doi, title, year, raw: clean.slice(0, 200) });
    }
    return refs;
  } catch {
    return [];
  }
}

async function auditArxiv(count, options = {}) {
  const category = options.category || 'cs.AI';
  const papers = await getRecentPapers(count, category);
  let totalRefs = 0, totalVerified = 0, totalIssues = 0;
  const allIssues = [];
  const paperResults = [];

  for (const paper of papers) {
    const refs = await getRefsFromHTML(paper.id);
    if (refs.length === 0) {
      paperResults.push({ ...paper, refs: 0, verified: 0, issues: 0, skipped: 'no HTML' });
      continue;
    }

    const withDOI = refs.filter(r => r.doi);
    const withTitle = refs.filter(r => r.title && !r.doi);
    // Skip arXiv-specific DOIs — CrossRef doesn't index them reliably
    const journalDOIs = withDOI.filter(r => !r.doi.startsWith('10.48550/'));
    const skippedArxiv = withDOI.length - journalDOIs.length;
    let paperIssues = 0;

    // Verify DOIs
    for (const ref of journalDOIs.slice(0, 15)) {
      const result = await verifyDOI(ref.doi);
      totalVerified++;

      if (result.verified && ref.title) {
        const sim = titleSimilarity(ref.title, result.title);
        if (sim < 0.5 && !titleContainsAll(ref.title, result.title)) {
          paperIssues++;
          totalIssues++;
          allIssues.push({
            paper: paper.id,
            paperTitle: paper.title,
            ref: ref.raw.slice(0, 150),
            issue: 'DOI-title mismatch',
            claimed: ref.title?.slice(0, 100),
            actual: result.title?.slice(0, 100),
            similarity: parseFloat(sim.toFixed(2)),
            doi: ref.doi,
          });
        }
      } else if (!result.verified) {
        paperIssues++;
        totalIssues++;
        allIssues.push({
          paper: paper.id,
          paperTitle: paper.title,
          ref: ref.raw.slice(0, 150),
          issue: 'DOI not found',
          doi: ref.doi,
        });
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Search titles without DOIs
    for (const ref of withTitle.slice(0, 5)) {
      const match = await searchByTitle(ref.title);
      totalVerified++;
      if (match && match.length > 0 && match[0].score > 50) {
        const best = match[0];
        const sim = titleSimilarity(ref.title, best.title);
        if (sim < 0.3) {
          paperIssues++;
          totalIssues++;
          allIssues.push({
            paper: paper.id,
            paperTitle: paper.title,
            ref: ref.raw.slice(0, 150),
            issue: 'Title not found in CrossRef',
            claimed: ref.title?.slice(0, 100),
            bestMatch: best.title?.slice(0, 100),
            similarity: parseFloat(sim.toFixed(2)),
          });
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }

    totalRefs += refs.length;
    paperResults.push({
      ...paper,
      refs: refs.length,
      verified: Math.min(journalDOIs.length, 15) + Math.min(withTitle.length, 5),
      issues: paperIssues,
      skippedArxivDOIs: skippedArxiv,
    });
  }

  return {
    category,
    papers: paperResults,
    issues: allIssues,
    stats: {
      papersAudited: papers.length,
      totalRefs,
      refsChecked: totalVerified,
      issuesFound: totalIssues,
      issueRate: totalVerified > 0 ? totalIssues / totalVerified : 0,
    },
  };
}

module.exports = { auditArxiv };
