import { XMLParser } from 'fast-xml-parser';

// Type definitions for XML content structure
interface XmlNode {
    '#text'?: string;
    ':@'?: Record<string, string>;
    [key: string]: unknown;
}

interface XmlAttributeNode extends XmlNode {
    [key: `@_${string}`]: string;
}

/**
 * Utility functions for converting C# XML documentation to Markdown format
 */

/**
 * Converts C# XML documentation comments to Markdown format.
 * The input should already have the /// markers removed.
 * 
 * @param xmlDocs The XML documentation string (without /// markers)
 * @param ignoredTags Optional array of tag names to ignore at the top level
 * @returns The converted Markdown string
 */
export function xmlToMarkdown(xmlDocs: string, ignoredTags: string[] = []): string {
    if (!xmlDocs || xmlDocs.trim().length === 0) {
        return '';
    }

    // Wrap the XML content in a root element to make it valid XML
    const wrappedXml = `<root>${xmlDocs}</root>`;
    
    try {        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            textNodeName: "#text",
            removeNSPrefix: false,
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: true,
            cdataPropName: "__cdata",
            alwaysCreateTextNode: false,
            preserveOrder: true,
        });        const result = parser.parse(wrappedXml);        // When preserveOrder is true, the result is an array
        let rootContent;
        if (Array.isArray(result)) {
            // Find the root element in the array
            const rootElement = result.find(item => item.root);
            rootContent = rootElement ? rootElement.root : result;
        } else {
            rootContent = result.root;
        }
        
        // If rootContent is an array, filter out ignored tags and apply grouping logic at the top level
        if (Array.isArray(rootContent)) {
            // Filter out ignored tags at the top level
            const filteredContent = rootContent.filter((item: unknown) => {
                if (typeof item === 'object' && item !== null) {
                    const keys = Object.keys(item as Record<string, unknown>);
                    const tagName = keys.find(key => key !== ':@');
                    return !tagName || !ignoredTags.includes(tagName.toLowerCase());
                }
                return true;
            });
            const groupedContent = groupConsecutiveElements(filteredContent);
            rootContent = groupedContent;
        } else if (typeof rootContent === 'object' && rootContent !== null) {
            // For single object, filter out ignored tags
            const filteredContent: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(rootContent as Record<string, unknown>)) {
                if (key === ':@' || !ignoredTags.includes(key.toLowerCase())) {
                    filteredContent[key] = value;
                }
            }
            rootContent = filteredContent;
        }
          // Process the parsed XML and convert to Markdown
        const markdown = processXmlNode(rootContent);
          // Clean up the final output
        return smartTrim(markdown);
        
    } catch (error) {
        console.warn('Failed to parse XML documentation, falling back to plain text:', error);
        // Fallback: return the original text with minimal formatting
        return xmlDocs.trim();
    }
}

/**
 * Process an XML node and convert it to Markdown
 */
function processXmlNode(node: unknown): string {
    if (!node) {
        return '';
    }

    let markdown = '';
    
    // Handle different node types
    if (typeof node === 'string') {
        return node.trim();
    }    if (Array.isArray(node)) {
        // Group consecutive parameters and exceptions before processing
        const groupedItems = groupConsecutiveElements(node);        const results = groupedItems.map((item: unknown) => {
            // Handle special group objects
            if (typeof item === 'object' && item !== null && '_specialGroup' in item) {
                return processSpecialGroup(item);
            }
            const result = processXmlNode(item);
            return result;
        }).filter((result: string) => result.length > 0);        // Join with appropriate spacing - handle code blocks specially
        let combined = '';
        for (let i = 0; i < results.length; i++) {
            if (i > 0) {
                const prev = results[i - 1];
                const curr = results[i];
                
                // Don't add space if previous result ends with newline or current starts with newline
                if (!prev.endsWith('\n') && !curr.startsWith('\n')) {
                    // Special case: if current item is a code block, add double newline for proper spacing
                    if (curr.includes('```')) {
                        combined += '\n\n';
                    } else {
                        combined += ' ';
                    }
                }
            }
            combined += results[i];
        }
        return combined;
    }    // Process object nodes
    for (const [key, _value] of Object.entries(node as Record<string, unknown>)) {
        // Skip attributes key
        if (key === ':@') {
            continue;
        }
        // Handle special grouped elements
        if (typeof _value === 'object' && _value !== null && '_specialGroup' in _value) {
            markdown += processSpecialGroup(_value);
        } else {
            // For see elements and others with attributes, pass the entire node
            markdown += processXmlElement(key, node);
        }
    }
    
    return markdown;
}

/**
 * Process a specific XML element and convert it to Markdown
 */
function processXmlElement(tagName: string, node: unknown): string {
    // Extract the actual content for the tag from the node
    const content = typeof node === 'object' && node !== null 
        ? (node as Record<string, unknown>)[tagName] 
        : node;
      switch (tagName.toLowerCase()) {        case 'summary':
            return `### Summary\n\n${processContent(content)}\n\n`;
            
        case 'remarks':
            return `### Remarks\n\n${processContent(content)}\n\n`;        case 'param': {
            // Individual param (not grouped) - use old format for multi-line content
            const paramName = extractAttribute(node, 'name');
            const paramText = processContent(content);
            return `**Parameter \`${paramName}\`:** ${paramText}\n\n`;
        }
            
        case 'returns':
            return `### Return Value\n\n${processContent(content)}\n\n`;
            
        case 'exception': {
            // Individual exception (not grouped) - use old format for multi-line content
            const exceptionType = extractAttribute(node, 'cref');
            const exceptionText = processContent(content);
            return `**Exception \`${exceptionType}\`:** ${exceptionText}\n\n`;
        }
            
        case 'value':
            return `### Value\n\n${processContent(content)}\n\n`;
              case 'example':
            return `### Example\n\n${processContent(content)}\n\n`;        case 'code': {
            const codeContent = processContent(content);
            const normalizedCode = normalizeCodeIndentation(codeContent);
            return `\`\`\`\n${normalizedCode}\n\`\`\``;
        }
            
        case 'c':
            return `\`${processContent(content)}\``;
            
        case 'see':
            return processSeeElement(node);
            
        case 'seealso': {
            const seeAlsoRef = extractAttribute(node, 'cref');
            return `See also: \`${seeAlsoRef}\``;
        }
              case 'para':
            return `\n${processContent(content)}\n`;
            
        case 'br':
            return '\n\n';
              case 'list':
            return processList(content);
            
        case 'item':
            return processListItem(content);
            
        case 'term':
            return `**${processContent(content)}**`;
            
        case 'description':
            return processContent(content);
            
        case '#text':
            return typeof content === 'string' ? content : '';
            
        default:
            // For unknown tags, just process the content
            return processContent(content);
    }
}

/**
 * Process the content of an XML element
 */
function processContent(content: unknown): string {
    if (!content) {
        return '';
    }
    
    if (typeof content === 'string') {
        return content.trim();
    }      if (Array.isArray(content)) {
        const results = content.map(item => {
            if (typeof item === 'string') {
                return item;
            }
            return processXmlNode(item);
        });
        
        // Join with appropriate spacing - handle code blocks specially
        let combined = '';
        for (let i = 0; i < results.length; i++) {
            if (i > 0) {
                const prev = results[i - 1];
                const curr = results[i];
                
                // Don't add space if previous result ends with newline or current starts with newline
                if (!prev.endsWith('\n') && !curr.startsWith('\n')) {
                    // Special case: if current item is a code block, add double newline for proper spacing
                    if (curr.includes('```')) {
                        combined += '\n\n';
                    } else {
                        combined += ' ';
                    }
                }
            }
            combined += results[i];
        }
        return combined.trim();
    }
    
    if (typeof content === 'object' && content !== null) {
        const node = content as XmlNode;
        // Handle mixed content by preserving order and proper spacing
        let result = '';
        
        // Check if this is mixed content (has both text and elements)
        const hasText = node['#text'] !== undefined;
        const hasElements = Object.keys(node).some(key => !key.startsWith('@_') && key !== '#text');
        
        if (hasText && !hasElements) {
            // Simple text content
            return String(node['#text']).trim();
        }
          if (!hasText && hasElements) {
            // Only elements, no text
            for (const [key, value] of Object.entries(node)) {
                if (!key.startsWith('@_') && key !== ':@') {
                    if (Array.isArray(value)) {
                        result += value.map(item => processXmlElement(key, { [key]: item, ':@': node[':@'] })).join('');
                    } else {
                        result += processXmlElement(key, { [key]: value, ':@': node[':@'] });
                    }
                }
            }
            return result.trim();
        }
          // Mixed content - we need to be more careful about ordering
        // For now, let's concatenate text and elements with appropriate spacing
        const parts: string[] = [];
        
        if (node['#text']) {
            parts.push(String(node['#text']));
        }
          for (const [key, value] of Object.entries(node)) {
            if (key !== '#text' && !key.startsWith('@_') && key !== ':@') {
                if (Array.isArray(value)) {
                    parts.push(value.map(item => processXmlElement(key, { [key]: item, ':@': node[':@'] })).join(''));
                } else {
                    parts.push(processXmlElement(key, { [key]: value, ':@': node[':@'] }));
                }
            }
        }
        
        // Join parts with appropriate spacing - if any part contains code blocks, use newlines
        const hasCodeBlocks = parts.some(part => part.includes('```'));
        if (hasCodeBlocks) {
            // For content with code blocks, join with newlines and clean up spacing
            let result = parts.join('\n').trim();
            // Clean up multiple consecutive newlines but preserve intentional breaks
            result = result.replace(/\n\s*\n/g, '\n\n');
            return result;
        } else {
            // For regular content, join with spaces
            return parts.join(' ').replace(/\s+/g, ' ').trim();
        }
    }
    
    return String(content).trim();
}

/**
 * Process <see> elements
 */
function processSeeElement(content: unknown): string {
    const cref = extractAttribute(content, 'cref');
    const href = extractAttribute(content, 'href');
    const langword = extractAttribute(content, 'langword');
    
    if (cref) {
        // If there's text content, use the cref value for inline code
        return `\`${cref}\``;
    }
    
    if (langword) {
        return `\`${langword}\``;
    }
    
    if (href) {
        const linkText = processContent(content) || href;
        return `[${linkText}](${href})`;
    }
    
    return processContent(content);
}

/**
 * Process list elements
 */
function processList(content: unknown): string {
    const listType = extractAttribute(content, 'type') || 'bullet';
    
    // With preserveOrder: true, content is an array of elements
    if (!Array.isArray(content)) {
        return '';
    }
    
    // Find all item elements in the array
    const items: unknown[] = [];
    content.forEach((element: unknown) => {        if (typeof element === 'object' && element !== null && 'item' in element) {
            const itemContent = (element as Record<string, unknown>).item;
            if (Array.isArray(itemContent)) {
                items.push(itemContent);
            } else {
                items.push([itemContent]);
            }
        }
    });
    
    if (items.length === 0) {
        return '';
    }
    
    let result = '\n';
    items.forEach((item: unknown, index: number) => {
        if (listType === 'number') {
            result += `${index + 1}. ${processListItem(item)}\n`;
        } else {
            result += `- ${processListItem(item)}\n`;
        }
    });
    
    return result + '\n';
}

/**
 * Process list item elements
 */
function processListItem(content: unknown): string {
    if (!content) {
        return '';
    }
    
    if (typeof content === 'string') {
        return content.trim();
    }
    
    // With preserveOrder: true, item content is an array of elements
    if (Array.isArray(content)) {
        let term = '';
        let description = '';
        
        // Extract term and description from the array
        content.forEach((element: unknown) => {            if (typeof element === 'object' && element !== null) {
                if ('term' in element) {
                    term = processContent((element as Record<string, unknown>).term);
                }
                if ('description' in element) {
                    description = processContent((element as Record<string, unknown>).description);
                }
            }
        });
        
        // Handle table-style list items with term and description
        if (term && description) {
            return `**${term}**: ${description}`;
        }
        
        // Handle items with just description
        if (description) {
            return description;
        }
        
        // Fallback: process the entire array as content
        return content.map(processContent).join(' ').trim();
    }
    
    if (typeof content === 'object' && content !== null) {
        const node = content as XmlNode;
        // Handle table-style list items with term and description
        if (node.term && node.description) {
            const term = processContent(node.term);
            const description = processContent(node.description);
            return `**${term}**: ${description}`;
        }
        
        // Handle simple list items with just description
        if (node.description) {
            return processContent(node.description);
        }
    }
    
    // Handle items with mixed content
    return processContent(content);
}

/**
 * Extract an attribute value from parsed XML content
 */
function extractAttribute(content: unknown, attributeName: string): string {
    if (!content || typeof content !== 'object') {
        return '';
    }
    
    const node = content as XmlAttributeNode;
    const attrKey = `@_${attributeName}` as const;
    
    // When preserveOrder is true, attributes are stored under ":@" key
    const attributes = node[':@'] as Record<string, string> | undefined;
    if (attributes && attributes[attrKey]) {
        return attributes[attrKey];
    }
    
    // Fallback to direct attribute access
    const directValue = node[attrKey];
    return directValue ? String(directValue) : '';
}

/**
 * Smart trim that removes trailing whitespace but preserves meaningful newlines
 */
function smartTrim(markdown: string): string {
    // Remove trailing whitespace and excessive newlines from the end
    // But preserve single trailing newlines if they seem intentional
    return markdown.replace(/\s+$/, '');
}

/**
 * Normalize indentation in code blocks by removing common leading whitespace
 */
function normalizeCodeIndentation(code: string): string {
    if (!code || typeof code !== 'string') {
        return '';
    }
    
    const lines = code.split('\n');
    
    // Filter out empty lines for indentation calculation
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    if (nonEmptyLines.length === 0) {
        return code;
    }
    
    // Find the minimum indentation (common leading whitespace)
    const minIndent = Math.min(...nonEmptyLines.map(line => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }));
    
    let result = code;
    
    // Remove the common leading whitespace from all lines
    if (minIndent > 0) {
        const normalizedLines = lines.map(line => {
            if (line.trim().length === 0) {
                return line; // Keep empty lines as-is
            }
            return line.substring(minIndent);
        });
        
        result = normalizedLines.join('\n');
    }
    
    // Always try to normalize top-level braces, regardless of indentation
    result = normalizeTopLevelBraces(result);
    return result;
}

/**
 * Further normalize code to ensure braces are properly aligned
 */
function normalizeTopLevelBraces(code: string): string {
    const lines = code.split('\n');
    const normalizedLines = [];
    const braceStack: number[] = []; // Track indentation levels of opening braces
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Check if this line is just an opening brace
        if (trimmed === '{') {
            // Look at the previous non-empty line to determine the correct indentation
            let prevNonEmptyIndex = i - 1;
            while (prevNonEmptyIndex >= 0 && lines[prevNonEmptyIndex].trim() === '') {
                prevNonEmptyIndex--;
            }
            
            if (prevNonEmptyIndex >= 0) {
                const prevLine = lines[prevNonEmptyIndex];
                const prevTrimmed = prevLine.trim();
                const prevIndent = prevLine.length - prevLine.trimStart().length;
                
                // For top-level declarations (class, interface, namespace), brace should be flush left
                if (prevTrimmed.includes('class ') || 
                    prevTrimmed.includes('interface ') || 
                    prevTrimmed.includes('namespace ') ||
                    prevTrimmed.includes('struct ') ||
                    prevTrimmed.includes('enum ')) {
                    braceStack.push(0); // Track that this brace is at level 0
                    normalizedLines.push('{');
                    continue;
                }
                
                // For method declarations or other declarations with access modifiers, 
                // align brace with the declaration (same indentation level)
                if (prevTrimmed.endsWith(')') || // method declaration
                    prevTrimmed.startsWith('public ') ||
                    prevTrimmed.startsWith('private ') ||
                    prevTrimmed.startsWith('protected ') ||
                    prevTrimmed.startsWith('internal ')) {
                    const alignedBrace = ' '.repeat(prevIndent) + '{';
                    braceStack.push(prevIndent);
                    normalizedLines.push(alignedBrace);
                    continue;
                }
            }
            
            // Default: preserve the original indentation for the opening brace
            const indent = line.length - line.trimStart().length;
            braceStack.push(indent);
            normalizedLines.push(line);
        } 
        // Check if this line is just a closing brace
        else if (trimmed === '}') {
            // Match the indentation of the corresponding opening brace
            if (braceStack.length > 0) {
                const openingBraceIndent = braceStack.pop()!;
                const closingBraceIndent = ' '.repeat(openingBraceIndent) + '}';
                normalizedLines.push(closingBraceIndent);
            } else {
                // No matching opening brace found, keep original
                normalizedLines.push(line);
            }
        } else {
            normalizedLines.push(line);
        }
    }
    
    const result = normalizedLines.join('\n');
    return result;
}

/**
 * Groups consecutive elements of the same type (param, exception) for better formatting
 * Only groups elements that have single-line content (no line breaks)
 */
function groupConsecutiveElements(elements: unknown[]): unknown[] {
    if (!Array.isArray(elements)) {
        return elements;
    }
    
    const result: unknown[] = [];
    let i = 0;
    
    while (i < elements.length) {
        const element = elements[i];
        
        // Check if this is a groupable element (param or exception)
        if (typeof element === 'object' && element !== null) {
            const keys = Object.keys(element as Record<string, unknown>);
            const elementType = keys.find(key => key === 'param' || key === 'exception');
              if (elementType) {
                // Check if this element has single-line content (no multi-line elements like para, br, code, etc.)
                const elementContent = typeof element === 'object' && element !== null 
                    ? (element as Record<string, unknown>)[elementType] 
                    : element;
                const isSingleLine = !containsMultiLineElements(elementContent);
                
                if (isSingleLine) {
                    // Found a groupable single-line element, look for consecutive single-line elements of the same type
                    const group: unknown[] = [element];
                    let j = i + 1;
                    
                    while (j < elements.length) {
                        const nextElement = elements[j];
                        if (typeof nextElement === 'object' && nextElement !== null) {
                            const nextKeys = Object.keys(nextElement as Record<string, unknown>);                            if (nextKeys.includes(elementType)) {
                                // Check if this next element is also single-line
                                const nextElementContent = (nextElement as Record<string, unknown>)[elementType];
                                const nextIsSingleLine = !containsMultiLineElements(nextElementContent);
                                
                                if (nextIsSingleLine) {
                                    group.push(nextElement);
                                    j++;
                                } else {
                                    break; // Multi-line element breaks the grouping
                                }
                            } else {
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                    
                    // Create a special group (even for single elements, as per requirement)
                    result.push({
                        _specialGroup: elementType,
                        elements: group
                    });
                    i = j;
                } else {
                    // Multi-line element, don't group - process individually
                    result.push(element);
                    i++;
                }
            } else {
                // Not a groupable element, add as-is
                result.push(element);
                i++;
            }
        } else {
            // Not an object, add as-is
            result.push(element);
            i++;
        }
    }
    
    return result;
}

/**
 * Process a special group of consecutive elements (parameters or exceptions)
 */
function processSpecialGroup(group: Record<string, unknown>): string {
    const groupType = group._specialGroup as string;
    const elements = group.elements as unknown[];
    
    if (groupType === 'param') {
        const items = elements.map(element => {
            const paramName = extractAttribute(element, 'name');
            const paramContent = typeof element === 'object' && element !== null 
                ? (element as Record<string, unknown>).param 
                : element;
            const paramText = processContent(paramContent);
            return `- **\`${paramName}\`**: ${paramText}`;
        });
        
        return `### Parameters\n\n${items.join('\n')}\n\n`;
    } else if (groupType === 'exception') {
        const items = elements.map(element => {
            const exceptionType = extractAttribute(element, 'cref');
            const exceptionContent = typeof element === 'object' && element !== null 
                ? (element as Record<string, unknown>).exception 
                : element;
            const exceptionText = processContent(exceptionContent);
            return `- **\`${exceptionType}\`**: ${exceptionText}`;
        });
        
        return `### Exceptions\n\n${items.join('\n')}\n\n`;
    }
    
    return '';
}

/**
 * Check if content contains multi-line elements like para, br, code blocks, etc.
 */
function containsMultiLineElements(content: unknown): boolean {
    if (!content) {
        return false;
    }
    
    if (Array.isArray(content)) {
        // Check if any item in the array is a multi-line element
        return content.some(item => containsMultiLineElements(item));
    }
    
    if (typeof content === 'object' && content !== null) {
        const obj = content as Record<string, unknown>;
        
        // Check for known multi-line elements
        for (const key of Object.keys(obj)) {
            if (key === 'para' || key === 'br' || key === 'code' || key === 'example' || key === 'list') {
                return true;
            }
            // Recursively check nested content
            if (key !== ':@' && !key.startsWith('@_')) {
                if (containsMultiLineElements(obj[key])) {
                    return true;
                }
            }
        }
    }
    
    return false;
}
