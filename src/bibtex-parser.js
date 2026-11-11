'use strict';

/**
 * BibTeX reader. Replaces the bibtex-parse-js dependency, which pulled a 2016
 * test runner (ava) and xml2js into every production install.
 *
 * Grammar handled:
 *   file      -> (junk | '%' line | '@' directive)*
 *   directive -> string | preamble | comment | entry
 *   entry     -> type ('{' | '(') key (',' field)* ','? ('}' | ')')
 *   field     -> name '=' value
 *   value     -> piece ('#' piece)*
 *   piece     -> '{' balanced '}' | '"' quoted '"' | digits | macro
 *
 * Entry types, field names and macro names are case-insensitive and are
 * returned lowercased. Citation keys keep their case.
 *
 * The contract that matters for an audit: input this parser cannot read is an
 * error with a line number, never a short or empty result. A reference list
 * that silently lost entries would make every later check pass on less than
 * the author wrote.
 */

class BibTeXParseError extends Error {
    constructor(message, { file = null, line = null, column = null } = {}) {
        const where = [file, line, column].filter(part => part !== null).join(':');
        super(where ? `${where}: ${message}` : message);
        this.name = 'BibTeXParseError';
        this.reason = message;
        this.file = file;
        this.line = line;
        this.column = column;
    }
}

// The standard styles predefine the month macros. Their expansion is style
// dependent ("January", "Jan."), so the macro name itself is the stable value.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const WHITESPACE = /\s/;
// Characters that end a field name or macro name.
const NAME_END = /[\s=,{}()"#%]/;
// Entry types are plain identifiers: @article, @inproceedings, @mvbook.
const TYPE_CHAR = /[A-Za-z0-9_\-+.:]/;

/**
 * Parse BibTeX source text.
 *
 * Returns { entries, strings, preambles, comments } where each entry is
 * { citationKey, entryType, entryTags, line }. Throws BibTeXParseError on any
 * construct it cannot read. An input with no entries is not an error here —
 * parseBibTeX() in bibtex.js owns that check, because only the caller knows
 * the text was supposed to be a bibliography.
 */
function parseBibTeXText(input, options = {}) {
    const file = options.file || null;
    let text = String(input);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM from Windows editors
    const length = text.length;
    let pos = 0;

    const macros = new Map(MONTHS.map(month => [month, month]));
    const entries = [];
    let preambles = 0;
    let comments = 0;

    // Offsets of each line start, built once: every entry records its line,
    // and rescanning the text per entry is quadratic on a large bibliography.
    const lineStarts = [0];
    for (let i = 0; i < length; i++) {
        if (text[i] === '\n') lineStarts.push(i + 1);
    }

    function locate(offset) {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= offset) low = mid;
            else high = mid - 1;
        }
        return { line: low + 1, column: offset - lineStarts[low] + 1 };
    }

    function fail(message, offset = pos) {
        throw new BibTeXParseError(message, { file, ...locate(offset) });
    }

    function found() {
        if (pos >= length) return 'end of file';
        const char = text[pos];
        return char === '\n' ? 'end of line' : `'${char}'`;
    }

    function skipLine() {
        while (pos < length && text[pos] !== '\n') pos++;
    }

    // Between tokens inside a directive: whitespace, and % to end of line.
    // Classic BibTeX has no such comment, but biber does and real files use it
    // to disable single fields.
    function skipSpace() {
        while (pos < length) {
            if (WHITESPACE.test(text[pos])) pos++;
            else if (text[pos] === '%') skipLine();
            else break;
        }
    }

    function readWhile(pattern) {
        const start = pos;
        while (pos < length && pattern.test(text[pos])) pos++;
        return text.slice(start, pos);
    }

    function readUntil(pattern) {
        const start = pos;
        while (pos < length && !pattern.test(text[pos])) pos++;
        return text.slice(start, pos);
    }

    // '{' ... '}' with nesting. BibTeX counts every brace, including \{ and
    // \}, so a value must balance on its own. Returns the text between the
    // outer pair.
    function readBraced(what) {
        const open = pos;
        pos++;
        const start = pos;
        let depth = 0;
        while (pos < length) {
            const char = text[pos];
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                if (depth === 0) {
                    const value = text.slice(start, pos);
                    pos++;
                    return value;
                }
                depth--;
            }
            pos++;
        }
        return fail(`${what} opened here is never closed with '}'`, open);
    }

    // '"' ... '"'. A quote inside braces does not end the value ("G{\"o}del").
    // \" outside braces is not valid BibTeX but is common in hand-written
    // files ("M\"uller"), so it is read as part of the value.
    function readQuoted(what) {
        const open = pos;
        pos++;
        const start = pos;
        let depth = 0;
        while (pos < length) {
            const char = text[pos];
            if (char === '\\' && depth === 0 && text[pos + 1] === '"') {
                pos += 2;
                continue;
            }
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                // A closing brace with nothing open means the quote ran past
                // its field into the end of the entry.
                if (depth === 0) fail(`${what} opened here is never closed with '"'`, open);
                depth--;
            } else if (char === '"' && depth === 0) {
                const value = text.slice(start, pos);
                pos++;
                return value;
            }
            pos++;
        }
        return fail(`${what} opened here is never closed with '"'`, open);
    }

    function readValue(what) {
        const pieces = [];
        for (;;) {
            skipSpace();
            const char = text[pos];
            if (char === '{') {
                pieces.push(readBraced(what));
            } else if (char === '"') {
                pieces.push(readQuoted(what));
            } else {
                // A bare token: a number (year = 2020) or a macro name.
                const at = pos;
                const name = readUntil(NAME_END);
                if (!name) fail(`expected a value for ${what}, found ${found()}`, at);
                // An undefined macro is usually one the bibliography style
                // defines (cacm, ieeetr). Keep the name: dropping it would
                // lose the field, and failing would reject files BibTeX accepts.
                const key = name.toLowerCase();
                pieces.push(macros.has(key) ? macros.get(key) : name);
            }
            skipSpace();
            if (text[pos] !== '#') break;
            pos++;
        }
        // BibTeX compresses runs of whitespace in a field to one space, which
        // is what turns a title wrapped over three source lines into one line.
        return pieces.join('').replace(/\s+/g, ' ').trim();
    }

    // Skip a balanced @comment body without interpreting it.
    function skipBalanced(open, close, what) {
        const start = pos;
        pos++;
        let depth = 0;
        while (pos < length) {
            const char = text[pos];
            if (char === open) {
                depth++;
            } else if (char === close) {
                if (depth === 0) {
                    pos++;
                    return;
                }
                depth--;
            }
            pos++;
        }
        fail(`${what} opened here is never closed with '${close}'`, start);
    }

    function expectClose(close, what) {
        skipSpace();
        if (text[pos] !== close) fail(`expected '${close}' to close ${what}, found ${found()}`);
        pos++;
    }

    function parseString(close, at) {
        skipSpace();
        const name = readUntil(NAME_END);
        if (!name) fail(`expected a macro name in @string, found ${found()}`);
        skipSpace();
        if (text[pos] !== '=') fail(`expected '=' after @string name '${name}', found ${found()}`);
        pos++;
        macros.set(name.toLowerCase(), readValue(`@string '${name}'`));
        skipSpace();
        if (text[pos] === ',') pos++;
        expectClose(close, `@string '${name}' (line ${locate(at).line})`);
    }

    function parseEntry(entryType, close, at) {
        const { line } = locate(at);
        skipSpace();
        const keyStart = pos;
        while (pos < length && !WHITESPACE.test(text[pos]) && text[pos] !== ',' && text[pos] !== close) pos++;
        const citationKey = text.slice(keyStart, pos);
        if (!citationKey) fail(`@${entryType} entry has no citation key`, keyStart);

        const what = `@${entryType} entry '${citationKey}' (line ${line})`;
        const entryTags = Object.create(null);
        skipSpace();

        while (text[pos] !== close) {
            if (text[pos] !== ',') {
                fail(`expected ',' or '${close}' in ${what}, found ${found()}`);
            }
            pos++;
            skipSpace();
            if (text[pos] === close) break; // trailing comma

            const nameStart = pos;
            const name = readUntil(NAME_END);
            if (!name) fail(`expected a field name in ${what}, found ${found()}`, nameStart);
            skipSpace();
            if (text[pos] !== '=') fail(`expected '=' after field '${name}' in ${what}, found ${found()}`);
            pos++;
            const value = readValue(`field '${name}' of ${what}`);
            // BibTeX keeps the first occurrence of a repeated field.
            const field = name.toLowerCase();
            if (!(field in entryTags)) entryTags[field] = value;
            skipSpace();
        }
        pos++;
        entries.push({ citationKey, entryType, entryTags, line });
    }

    while (pos < length) {
        const char = text[pos];
        // Outside an entry everything is ignored up to the next '@'. A '%'
        // comments out the rest of its line, so "% @article{old, ...}" stays
        // disabled the way its author meant it.
        if (char === '%') {
            skipLine();
            continue;
        }
        if (char !== '@') {
            pos++;
            continue;
        }

        const at = pos;
        pos++;
        while (pos < length && (text[pos] === ' ' || text[pos] === '\t')) pos++;
        const entryType = readWhile(TYPE_CHAR).toLowerCase();
        if (!entryType) fail(`'@' is not followed by an entry type`, at);
        skipSpace();

        const opener = text[pos];
        if (entryType === 'comment' && opener !== '{' && opener !== '(') {
            // "@comment free text" with no delimiters comments out one line.
            pos = at;
            skipLine();
            comments++;
            continue;
        }
        if (opener !== '{' && opener !== '(') {
            fail(`'@${entryType}' is not followed by '{' (found ${found()}); ` +
                `start the line with '%' if it is not an entry`, at);
        }
        const close = opener === '{' ? '}' : ')';

        if (entryType === 'comment') {
            skipBalanced(opener, close, '@comment');
            comments++;
        } else if (entryType === 'preamble') {
            pos++;
            readValue('@preamble');
            expectClose(close, `@preamble (line ${locate(at).line})`);
            preambles++;
        } else if (entryType === 'string') {
            pos++;
            parseString(close, at);
        } else {
            pos++;
            parseEntry(entryType, close, at);
        }
    }

    const strings = Object.create(null);
    for (const [name, value] of macros) {
        if (!MONTHS.includes(name) || value !== name) strings[name] = value;
    }
    return { entries, strings, preambles, comments };
}

module.exports = { parseBibTeXText, BibTeXParseError };


// Running a src/ module directly exits 0 and prints nothing, which for an
// audit tool is indistinguishable from a clean result. Fail loudly instead.
if (require.main === module) {
    console.error(
        `science-agent: src/bibtex-parser.js is a library, not a command.\n` +
        'Invoking it directly produces no output and no findings, whatever the input.\n' +
        'Use:\n' +
        '  node cli.js audit <dir> --bibtex=<path>\n'
    );
    process.exit(2);
}
