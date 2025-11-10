interface NodeSchema {
    allowedParents: Set<string>;
    allowedChildren: Set<string>;
}
const schema: Map<string, NodeSchema> = new Map([
    // text
    ["h1", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h2", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h3", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h4", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h5", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h6", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["p", {
        allowedParents: new Set(['div','li', 'blockquote, td, th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["blockquote", {
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    // lists
    ["ol", {
        allowedParents: new Set(['div','ul','ol','td']),
        allowedChildren: new Set(['li', 'ul','ol'])
    }],
    ["ul", {
        allowedParents: new Set(['div','ul','ol','td']),
        allowedChildren: new Set(['li', 'ul','ol'])
    }],
    ["li", {
        allowedParents: new Set(['ol, ul']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    // tables
    ["table", {
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['tr'])
    }],
    ["tr", {
        allowedParents: new Set(['table']),
        allowedChildren: new Set(['th', 'td'])
    }],
    ["th", {
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    ["td", {
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    // media
    ["image", {
        allowedParents: new Set(['div', 'li']),
        allowedChildren: new Set([])
    }],
    ["canvas", {
        allowedParents: new Set(['div']),
        allowedChildren: new Set([])
    }],
    ["video", {
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
])