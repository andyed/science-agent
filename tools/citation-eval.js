#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { auditBibTeX, compareAuthors, normalizeDOI, normalizeText } = require('../src/bib-audit');

const fixture = path.join(__dirname, '..', 'test-fixtures', 'bib-metadata.bib');
const metadata = new Map([
    ['10.5555/exact', {
        title: 'Query Abandonment Prediction with Recurrent Neural Models of Mouse Cursor Movements',
        authors: ['Brückner, Lukas', 'Arapakis, Ioannis', 'Leiva, Luis A.'],
        year: 2020,
        years: [2020, 2021],
        pages: '2318-2322',
    }],
    ['10.5555/wrong-title', {
        title: 'Query Abandonment Prediction with Recurrent Neural Models of Mouse Cursor Movements',
        authors: ['Brückner, Lukas', 'Arapakis, Ioannis', 'Leiva, Luis A.'],
        year: 2020,
    }],
    ['10.5555/crossref-subtitle', {
        title: 'Patterns of Search Result Examination',
        authors: ['Abualsaud, Mustafa', 'Smucker, Mark D.'],
        year: 2019,
    }],
    ['10.5555/wrong-doi', {
        title: 'Generative Question Refinement with Deep Reinforcement Learning',
        authors: ['Nogueira, Rodrigo', 'Cho, Kyunghyun'],
        year: 2019,
    }],
    ['10.5555/wrong-authors', {
        title: 'A Stable Title',
        authors: ['Alpha, Ada', 'Charlie, Cyd'],
        year: 2024,
    }],
    ['10.5555/wrong-year', {
        title: 'A Year-sensitive Result',
        authors: ['Gamma, Gia'],
        year: 2024,
        years: [2024],
    }],
    ['10.5555/wrong-pages', {
        title: 'A Pagination Check',
        authors: ['Delta, Dan'],
        year: 2024,
        volume: '5',
        pages: '20-29',
    }],
    ['10.5555/partial-authors', {
        title: 'A Large Collaboration',
        authors: ['Echo, Eve', 'Extra, Eli', 'More, Mo'],
        year: 2024,
    }],
    ['10.5555/duplicate', {
        title: 'Duplicate Identity',
        authors: ['Foxtrot, Fay'],
        year: 2024,
    }],
    ['10.5555/missing-crossref-authors', {
        title: 'A Deposit Without Authors',
        authors: [],
        year: 2024,
    }],
]);

const calls = new Map();
async function mockVerifyDOI(doi) {
    calls.set(doi, (calls.get(doi) || 0) + 1);
    if (doi === '10.5555/unresolved') return { verified: false, error: 'HTTP 404', statusCode: 404, doi };
    const result = metadata.get(doi);
    assert(result, `unexpected DOI sent to verifier: ${doi}`);
    return { verified: true, doi, journal: 'Fixture Journal', volume: null, pages: null, ...result };
}

async function main() {
    assert.strictEqual(normalizeDOI('https://doi.org/10.5555/EXACT'), '10.5555/exact');
    assert.strictEqual(normalizeDOI('{10.5555/punctuation.}'), '10.5555/punctuation.');
    assert.strictEqual(normalizeText('Br\\"{u}ckner & Arapakis'), 'bruckner and arapakis');
    assert.strictEqual(
        compareAuthors(
            ['Hassan Awadallah, Ahmed', 'White, Ryen W.'],
            ['Hassan, Ahmed', 'White, Ryen W.'],
        ).match,
        true,
    );

    const result = await auditBibTeX(fixture, { verifyDOI: mockVerifyDOI, concurrency: 2 });
    const typesFor = id => result.issues.filter(issue => issue.citation === id).map(issue => issue.type);

    assert.deepStrictEqual(typesFor('exact'), []);
    assert(typesFor('wrongtitle').includes('title_mismatch'));
    assert.deepStrictEqual(typesFor('crossrefsubtitle'), []);
    assert(typesFor('wrongdoi').includes('wrong_doi'));
    assert(typesFor('wrongauthors').includes('author_mismatch'));
    assert(typesFor('wrongyear').includes('year_mismatch'));
    assert(typesFor('wrongpages').includes('volume_mismatch'));
    assert(typesFor('wrongpages').includes('pages_mismatch'));
    assert.deepStrictEqual(typesFor('partialauthors'), []);
    assert(typesFor('duplicateone').includes('duplicate_doi'));
    assert(typesFor('unresolved').includes('doi_unverified'));
    assert(typesFor('invalid').includes('invalid_doi'));
    assert(typesFor('missingdoi').includes('missing_doi'));
    assert(typesFor('missingcrossrefauthors').includes('author_mismatch'));
    assert.strictEqual(calls.get('10.5555/duplicate'), 1, 'duplicate DOI should make one Crossref request');
    assert.strictEqual(result.stats.total, 14);
    assert.strictEqual(result.stats.withoutDOI, 1);
    assert.strictEqual(result.stats.invalidDOI, 1);
    assert.strictEqual(result.stats.duplicateDOI, 1);

    console.log('\x1b[32mcitation-eval: 21 assertions, 0 violations\x1b[0m');
}

main().catch(error => {
    console.error(`citation-eval failed: ${error.stack || error.message}`);
    process.exit(1);
});
