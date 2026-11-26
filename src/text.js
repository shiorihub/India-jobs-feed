const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', bull: '•' };

export function decodeEntities(s) {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/** Converts job-description HTML into readable plain text. */
export function htmlToText(html) {
    if (!html) return '';
    return decodeEntities(
        html
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
            .replace(/<li[^>]*>/gi, '\n- ')
            .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>|<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
    )
        .replace(/[ \t ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
