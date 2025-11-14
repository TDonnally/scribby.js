/**
 * This is the DOM hierarchy schema
 * The normalization layer uses this as a reference to reorganize DOM elements
 */

/**
 * This will control the order in which out of order nodes are organized
 * nodes closer to leafs are organized first
 * nodes closer to root are organized last
 */
export enum nodeHierarchy{
    inline,
    textEl,
    listItem,
    lists,
    /*
    tableItem,
    tableRow, 
    table,
    blockquote,
    media
    */
}
interface NodeSchema {
    defaultParent: string;
    allowedParents: Set<string>;
    allowedChildren: Set<string>;
    hierarchyLabel: nodeHierarchy;
}
export const schema: Map<string, NodeSchema> = new Map([
    // text
    ["h1", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["h2", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["h3", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["h4", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["h5", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["h6", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    ["p", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li', 'blockquote', 'td', 'th']),
        allowedChildren: new Set(['span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.textEl
    }],
    /*
    ["blockquote", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.blockquote
    }],
    */
    //inline nodes
    ["a", {
        defaultParent: 'p',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th']),
        allowedChildren: new Set(['span', 'text']),
        hierarchyLabel: nodeHierarchy.inline
    }],
    ["span", {
        defaultParent: 'p',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'td', 'th']),
        allowedChildren: new Set(['text']),
        hierarchyLabel: nodeHierarchy.inline
    }],
    ["text", {
        defaultParent: 'p',
        allowedParents: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a','span', 'td', 'th']),
        allowedChildren: new Set([]),
        hierarchyLabel: nodeHierarchy.inline
    }],
    // lists
    ["ol", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li','td']),
        allowedChildren: new Set(['li']),
        hierarchyLabel: nodeHierarchy.lists
    }],
    ["ul", {
        defaultParent: 'div',
        allowedParents: new Set(['div','li','td']),
        allowedChildren: new Set(['li']),
        hierarchyLabel: nodeHierarchy.lists
    }],
    ["li", {
        defaultParent: 'ul',
        allowedParents: new Set(['ol', 'ul']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.listItem
    }],
    /*
    // tables
    ["table", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['tr']),
        hierarchyLabel: nodeHierarchy.table
    }],
    ["tr", {
        defaultParent: 'table',
        allowedParents: new Set(['table']),
        allowedChildren: new Set(['th', 'td']),
        hierarchyLabel: nodeHierarchy.tableRow
    }],
    ["th", {
        defaultParent: 'tr',
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.tableItem
    }],
    ["td", {
        defaultParent: 'tr',
        allowedParents: new Set(['tr']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.tableItem
    }],
    
    // media
    ["image", {
        defaultParent: 'div',
        allowedParents: new Set(['div', 'li']),
        allowedChildren: new Set([]),
        hierarchyLabel: nodeHierarchy.media
    }],
    ["canvas", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set([]),
        hierarchyLabel: nodeHierarchy.media
    }],
    ["video", {
        defaultParent: 'div',
        allowedParents: new Set(['div']),
        allowedChildren: new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'text']),
        hierarchyLabel: nodeHierarchy.media
    }],
    */
])