/**
 * This is the DOM hierarchy schema
 * The normalization layer uses this as a reference to reorganize DOM elements
 */

interface NodeSchema {
    defaultParent: string;
    allowedParents: Set<string>;
    allowedChildren: Set<string>;
}
export const schema: Map<string, NodeSchema> = new Map([
    // text
    ["h1", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h2", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h3", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h4", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h5", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["h6", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["p", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text'])
    }],
    ["blockquote", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    ["a", {
        defaultParent: 'div',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li']),
        allowedChildren: new Set(['span', 'text'])
    }],
    ["span", {
        defaultParent: 'p',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']),
        allowedChildren: new Set(['text'])
    }],
    ["text", {
        defaultParent: 'p',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a','span']),
        allowedChildren: new Set([])
    }],
    // lists
    ["ol", {
        defaultParent: 'div',
        allowedParents: new Set(['div','ul','ol','td']),
        allowedChildren: new Set(['li', 'ul','ol'])
    }],
    ["ul", {
        defaultParent: 'div',
        allowedParents: new Set(['div','ul','ol','td']),
        allowedChildren: new Set(['li', 'ul','ol'])
    }],
    ["li", {
        defaultParent: 'ul',
        allowedParents: new Set(['ol', 'ul']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    // tables
    ["table", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['tr'])
    }],
    ["tr", {
        defaultParent: 'table',
        allowedParents: new Set(['table']),
        allowedChildren: new Set(['th', 'td'])
    }],
    ["th", {
        defaultParent: 'tr',
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    ["td", {
        defaultParent: 'tr',
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
    // media
    ["image", {
        defaultParent: 'div',
        allowedParents: new Set(['div', 'li']),
        allowedChildren: new Set([])
    }],
    ["canvas", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set([])
    }],
    ["video", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text'])
    }],
])