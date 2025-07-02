const vscode = acquireVsCodeApi();
let logs = [];
let activeFilters = new Set(['info', 'warning', 'error']);
let selectedLogId = null;
let ignoreDuplicateLogs = true; // Default to true
let searchText = ''; // Current search filter text

// Virtual scrolling variables
let visibleStartIndex = 0;
let visibleEndIndex = 0;
const ESTIMATED_ITEM_HEIGHT = 28; // Approximate height of each log item in pixels
const BUFFER_ITEMS = 6; // Extra items to render for smooth scrolling
let renderTimeout = null;
const RENDER_DEBOUNCE_MS = 16; // ~60 FPS

/**
 * Gets the appropriate icon for a log type
 * @param {string} type - The log type ('info', 'warning', 'error')
 * @returns {string} The icon character for the log type
 */
function getLogIcon(type) {
    switch (type) {
        case 'info': return 'ℹ';
        case 'warning': return '⚠';
        case 'error': return '✖';
        default: return '•';
    }
}

/**
 * Formats a date object to a time string in HH:MM:SS format
 * @param {Date} date - The date object to format
 * @returns {string} Formatted time string
 */
function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

/**
 * Escapes HTML characters in text to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} HTML-escaped text
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Extracts the first line from a multi-line text
 * @param {string} text - The text to extract from
 * @returns {string} The first line of the text
 */
function getFirstLine(text) {
    return text.split('\n')[0] || text;
}

/**
 * Checks if a log matches the current search criteria
 * @param {Object} log - The log object to check
 * @returns {boolean} True if the log matches the search criteria
 */
function matchesSearch(log) {
    if (!searchText) {
        return true; // No search filter, show all
    }
    
    const searchLower = searchText.toLowerCase();
    const fullLogText = (log.message + (log.stackTrace ? '\n' + log.stackTrace : '')).toLowerCase();
    
    return fullLogText.includes(searchLower);
}

/**
 * Creates a DOM element for displaying a log entry
 * @param {Object} log - The log object
 * @param {string} log.id - Unique identifier for the log
 * @param {string} log.type - Log type ('info', 'warning', 'error')
 * @param {string} log.message - Log message content
 * @param {string} log.timestamp - ISO timestamp string
 * @returns {HTMLElement} The created log element
 */
function createLogElement(log) {
    const div = document.createElement('div');
    div.className = 'log-item';
    div.dataset.type = log.type;
    div.dataset.id = log.id;
    
    const icon = document.createElement('div');
    icon.className = 'log-icon ' + log.type;
    icon.textContent = getLogIcon(log.type);
    
    const message = document.createElement('div');
    message.className = 'log-message';
    message.textContent = getFirstLine(log.message);
    
    const time = document.createElement('div');
    time.className = 'log-time';
    time.textContent = formatTime(new Date(log.timestamp));
    
    div.appendChild(icon);
    div.appendChild(message);
    div.appendChild(time);
    
    div.addEventListener('click', () => selectLog(log.id));
    
    return div;
}

/**
 * Add a new log and maintain scroll position
 */
function addLog(log) {
    const logList = document.getElementById('logList');
    const wasAtBottom = logList ? (logList.scrollTop + logList.clientHeight >= logList.scrollHeight - 5) : true;
    
    logs.push(log);
    
    // If user was at bottom, keep them at bottom after new log
    if (wasAtBottom) {
        const filteredLogs = logs.filter(l => activeFilters.has(l.type) && matchesSearch(l));
        const totalLogs = filteredLogs.length;
        const visibleItems = calculateVisibleItems();
        visibleStartIndex = Math.max(0, totalLogs - visibleItems);
        
        scheduleRender();
        
        // Auto-scroll to bottom only if user was already at bottom
        if (logList) {
            setTimeout(() => {
                logList.scrollTop = logList.scrollHeight;
            }, 20); // Small delay to ensure rendering is complete
        }
    } else {
        // User is not at bottom, just render without auto-scroll
        scheduleRender();
    }
}

/**
 * Schedules a debounced render to improve performance
 */
function scheduleRender() {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    
    renderTimeout = setTimeout(() => {
        renderVisibleLogs();
        updateLogCounts();
        renderTimeout = null;
    }, RENDER_DEBOUNCE_MS);
}

/**
 * Calculate the number of visible items based on container height
 */
function calculateVisibleItems() {
    const logList = document.getElementById('logList');
    if (!logList) return 15; // fallback
    
    const containerHeight = logList.clientHeight;
    const visibleItems = Math.ceil(containerHeight / ESTIMATED_ITEM_HEIGHT) + BUFFER_ITEMS;
    return Math.max(10, Math.min(visibleItems, 20)); // Clamp between 10-20 items
}

/**
 * Optimized rendering function with proper virtual scrolling
 */
function renderVisibleLogs() {
    const logList = document.getElementById('logList');
    let noLogs = document.getElementById('noLogs');
    
    // Preserve scroll position before clearing
    const currentScrollTop = logList.scrollTop;
    
    // Clear all content
    logList.innerHTML = '';
    
    if (logs.length === 0) {
        selectedLogId = null;
        if (!noLogs) {
            noLogs = document.createElement('div');
            noLogs.className = 'no-logs';
            noLogs.id = 'noLogs';
            noLogs.textContent = 'No logs to display';
        }
        logList.appendChild(noLogs);
        noLogs.style.display = 'flex';
        return;
    }
    
    // Filter logs based on active filters and search text
    const filteredLogs = logs.filter(log => activeFilters.has(log.type) && matchesSearch(log));
    
    if (filteredLogs.length === 0) {
        // Don't clear selectedLogId when filtering - preserve selection even if not visible
        if (!noLogs) {
            noLogs = document.createElement('div');
            noLogs.className = 'no-logs';
            noLogs.id = 'noLogs';
            noLogs.textContent = 'No logs to display';
        }
        logList.appendChild(noLogs);
        noLogs.style.display = 'flex';
        
        // Update details panel based on current selection
        updateDetailsPanel();
        return;
    }
    
    const totalLogs = filteredLogs.length;
    const visibleItems = calculateVisibleItems();
    
    // Calculate visible range
    visibleEndIndex = Math.min(visibleStartIndex + visibleItems, totalLogs);
    
    // Create top spacer for items before visible range
    if (visibleStartIndex > 0) {
        const topSpacer = document.createElement('div');
        topSpacer.style.height = `${visibleStartIndex * ESTIMATED_ITEM_HEIGHT}px`;
        topSpacer.className = 'virtual-spacer';
        logList.appendChild(topSpacer);
    }
    
    // Render visible logs
    const fragment = document.createDocumentFragment();
    for (let i = visibleStartIndex; i < visibleEndIndex; i++) {
        const log = filteredLogs[i];
        const logElement = createLogElement(log);
        fragment.appendChild(logElement);
    }
    logList.appendChild(fragment);
    
    // Create bottom spacer for items after visible range
    const remainingItems = totalLogs - visibleEndIndex;
    if (remainingItems > 0) {
        const bottomSpacer = document.createElement('div');
        bottomSpacer.style.height = `${remainingItems * ESTIMATED_ITEM_HEIGHT}px`;
        bottomSpacer.className = 'virtual-spacer';
        logList.appendChild(bottomSpacer);
    }
    
    // Handle selection - only highlight if the selected log is currently visible
    if (selectedLogId) {
        const selectedElement = logList.querySelector(`[data-id="${selectedLogId}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }
    
    // Update details panel based on current selection
    updateDetailsPanel();
    
    // Restore scroll position to prevent jumping
    logList.scrollTop = currentScrollTop;
}

/**
 * Clears all logs from the UI and resets the state
 */
function clearLogs() {
    logs = [];
    selectedLogId = null;
    visibleStartIndex = 0;
    visibleEndIndex = 0;
    
    const logList = document.getElementById('logList');
    const noLogs = document.getElementById('noLogs');
    const detailsContent = document.getElementById('detailsContent');
    
    logList.innerHTML = '';
    if (noLogs) {
        logList.appendChild(noLogs);
        noLogs.style.display = 'flex';
    }
    detailsContent.textContent = 'Select a log entry to view details';
    
    updateLogCounts();
    vscode.postMessage({ type: 'clearLogs' });
}

/**
 * Selects a log entry and displays its details
 * @param {string} logId - The ID of the log to select
 */
function selectLog(logId) {
    // Remove previous selection
    const previousSelected = document.querySelector('.log-item.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }
    
    // Add selection to clicked item
    const selectedElement = document.querySelector('[data-id="' + logId + '"]');
    if (selectedElement) {
        selectedElement.classList.add('selected');
    }
    
    selectedLogId = logId;
    
    // Notify extension about selection change
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({
            command: 'selectLog',
            logId: logId
        });
    }
    
    // Update details panel
    updateDetailsPanel();
}

/**
 * Updates the details panel based on current selection
 */
function updateDetailsPanel() {
    const container = document.getElementById('detailsContent');
    
    if (!selectedLogId) {
        // No selection - show default message
        container.textContent = 'Select a log entry to view details';
        return;
    }
    
    // Find the selected log
    const log = logs.find(l => l.id === selectedLogId);
    if (log) {
        showLogDetails(log);
    } else {
        // Selected log not found (might be filtered out)
        container.textContent = 'Select a log entry to view details';
    }
}

/**
 * Displays detailed information for a selected log
 * @param {Object} log - The log object to show details for
 */
function showLogDetails(log) {
    const container = document.getElementById('detailsContent');
    container.innerHTML = '';
    
    const content = processStackTrace(log.message + (log.stackTrace ? '\n' + log.stackTrace : ''));
    container.appendChild(content);
}

/**
 * Parses a Unity Test Runner stack trace line to identify the source location part.
 * Supports stack trace formats from Windows, macOS, and Linux platforms.
 *
 * NOTE: This function is copied from the compiled stackTraceUtils.js file.
 * It should be updated when the compiled result changes to maintain consistency.
 *
 * Expected formats:
 * - Windows: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in F:\projects\unity\TestUnityCode\Assets\Scripts\Editor\YallTest.cs:32"
 * - macOS: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /Users/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32"
 * - Linux: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /home/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32"
 *
 * @param {string} stackTraceLine A single line from Unity Test Runner stack trace
 * @returns {Object|null} StackTraceSourceLocation object with indices and parsed data, or null if no source location found
 */
function parseUnityTestStackTraceSourceLocation(stackTraceLine) {
    // Unity stack trace pattern: "at ClassName.Method () [0x00001] in FilePath:LineNumber"
    // The source location part is "FilePath:LineNumber" after " in "
    const inKeyword = ' in ';
    const inIndex = stackTraceLine.lastIndexOf(inKeyword);
    if (inIndex === -1) {
        return null;
    }
    // Start of source location is after " in "
    const sourceLocationStart = inIndex + inKeyword.length;
    // Find the last colon that separates file path from line number
    // Trim whitespace to handle trailing spaces
    const remainingText = stackTraceLine.substring(sourceLocationStart).trim();
    const colonMatch = remainingText.match(/^(.+):(\d+)$/);
    if (!colonMatch) {
        return null;
    }
    const filePath = colonMatch[1];
    const lineNumber = parseInt(colonMatch[2], 10);
    // Validate that this looks like a valid file path
    // Should end with common code file extensions
    if (!filePath.match(/\.(cs|js|ts|cpp|c|h|hpp)$/i)) {
        return null;
    }
    // Source location ends at the end of the trimmed text
    const sourceLocationEnd = sourceLocationStart + remainingText.length;
    return {
        startIndex: sourceLocationStart,
        endIndex: sourceLocationEnd,
        filePath,
        lineNumber
    };
}

/**
 * Parses a Unity Console log stack trace line to identify the source location part.
 * Unity Console logs have a different format than test stack traces.
 *
 * NOTE: This function is copied from the compiled stackTraceUtils.js file.
 * It should be updated when the compiled result changes to maintain consistency.
 *
 * Expected format:
 * - "Script:AnotherMethod () (at Assets/Scripts/Script.cs:12)"
 * - "Script:Awake () (at Assets/Scripts/Script.cs:8)"
 *
 * @param {string} logLine A single line from Unity Console log
 * @returns {Object|null} StackTraceSourceLocation object with indices and parsed data, or null if no source location found
 */
function parseUnityConsoleStackTraceSourceLocation(logLine) {
    // Unity console log pattern: "ClassName:Method () (at FilePath:LineNumber)"
    // The source location part is "FilePath:LineNumber" after "(at " and before ")"
    const atKeyword = '(at ';
    const atIndex = logLine.lastIndexOf(atKeyword);
    if (atIndex === -1) {
        return null;
    }
    // Find the closing parenthesis after "(at "
    const closingParenIndex = logLine.indexOf(')', atIndex);
    if (closingParenIndex === -1) {
        return null;
    }
    // Start of source location is after "(at "
    const sourceLocationStart = atIndex + atKeyword.length;
    // Extract the text between "(at " and ")"
    const sourceLocationText = logLine.substring(sourceLocationStart, closingParenIndex).trim();
    const colonMatch = sourceLocationText.match(/^(.+):(\d+)$/);
    if (!colonMatch) {
        return null;
    }
    const filePath = colonMatch[1];
    const lineNumber = parseInt(colonMatch[2], 10);
    // Validate that this looks like a valid file path
    // Should end with common code file extensions
    if (!filePath.match(/\.(cs|js|ts|cpp|c|h|hpp)$/i)) {
        return null;
    }
    return {
        startIndex: sourceLocationStart,
        endIndex: closingParenIndex,
        filePath,
        lineNumber
    };
}

/**
 * Processes stack trace text and makes file paths clickable
 * @param {string} text - The stack trace text to process
 * @returns {HTMLElement} Container element with processed stack trace
 */
function processStackTrace(text) {
    const container = document.createElement('div');
    const lines = text.split('\n');
    
    lines.forEach(line => {
        const lineElement = document.createElement('div');
        
        // Try both Unity Test and Unity Console stack trace parsing
        let sourceLocation = parseUnityTestStackTraceSourceLocation(line);
        if (!sourceLocation) {
            sourceLocation = parseUnityConsoleStackTraceSourceLocation(line);
        }
        
        if (sourceLocation) {
            lineElement.className = 'stack-trace-line';
            
            const filePathWithLine = `${sourceLocation.filePath}:${sourceLocation.lineNumber}`;
            
            // Create text before the file path
            const beforeText = line.substring(0, sourceLocation.startIndex);
            if (beforeText) {
                const beforeSpan = document.createElement('span');
                beforeSpan.textContent = beforeText;
                lineElement.appendChild(beforeSpan);
            }
            
            // Create clickable link for the file path
            const linkSpan = document.createElement('span');
            linkSpan.textContent = filePathWithLine;
            linkSpan.style.cursor = 'pointer';
            linkSpan.style.textDecoration = 'underline';
            linkSpan.style.color = 'var(--vscode-textLink-foreground)';
            linkSpan.addEventListener('click', () => {
                // Send the entire line to the extension for parsing
                vscode.postMessage({
                    type: 'openFile',
                    stackTraceLine: line
                });
            });
            lineElement.appendChild(linkSpan);
            
            // Create text after the file path
            const afterText = line.substring(sourceLocation.endIndex);
            if (afterText) {
                const afterSpan = document.createElement('span');
                afterSpan.textContent = afterText;
                lineElement.appendChild(afterSpan);
            }
        } else {
            lineElement.textContent = line;
        }
        
        container.appendChild(lineElement);
    });
    
    return container;
}

/**
 * Updates the visibility of log items based on active filters and search text
 * Now optimized to trigger a re-render instead of manipulating individual items
 */
function updateLogVisibility() {
    // Reset visible range to start from the beginning when search/filter changes
    visibleStartIndex = 0;
    
    scheduleRender();
}

/**
 * Toggles the active state of a log filter
 * @param {string} type - The filter type to toggle ('all', 'info', 'warning', 'error')
 */
function toggleFilter(type) {
    if (type === 'all') {
        if (activeFilters.size === 3) {
            activeFilters.clear();
        } else {
            activeFilters = new Set(['info', 'warning', 'error']);
        }
    } else {
        if (activeFilters.has(type)) {
            activeFilters.delete(type);
        } else {
            activeFilters.add(type);
        }
    }
    
    updateFilterButtons();
    updateLogVisibility();
}

/**
 * Updates the count displays for each log type
 */
function updateLogCounts() {
    const counts = { info: 0, warning: 0, error: 0 };
    
    logs.forEach(log => {
        if (Object.prototype.hasOwnProperty.call(counts, log.type)) {
            counts[log.type]++;
        }
    });
    
    // Update count displays
    document.getElementById('info-count').textContent = counts.info;
    document.getElementById('warning-count').textContent = counts.warning;
    document.getElementById('error-count').textContent = counts.error;
}

/**
 * Updates the visual state of filter buttons based on active filters
 */
function updateFilterButtons() {
    const buttons = document.querySelectorAll('.filter-button');
    buttons.forEach(button => {
        const filter = button.dataset.filter;
        if (filter === 'all') {
            button.classList.toggle('active', activeFilters.size === 3);
        } else {
            button.classList.toggle('active', activeFilters.has(filter));
        }
    });
    
    // Update log counts
    updateLogCounts();
}

/**
 * Renders all logs in the log list
 * @param {string|null} targetSelectedLogId - The ID of the log to select after rendering
 */
function renderAllLogs(targetSelectedLogId) {
    if (targetSelectedLogId !== undefined) {
        selectedLogId = targetSelectedLogId;
    }
    
    // Reset to show latest logs only if user is at bottom
    const logList = document.getElementById('logList');
    const wasAtBottom = logList ? (logList.scrollTop + logList.clientHeight >= logList.scrollHeight - 5) : true;
    
    const filteredLogs = logs.filter(log => activeFilters.has(log.type) && matchesSearch(log));
    const totalLogs = filteredLogs.length;
    const visibleItems = calculateVisibleItems();
    
    if (wasAtBottom) {
        visibleStartIndex = Math.max(0, totalLogs - visibleItems);
    }
    
    renderVisibleLogs();
    updateLogCounts();
    
    // Auto-scroll to bottom only if user was already at bottom
    if (logList && totalLogs > 0 && wasAtBottom) {
        setTimeout(() => {
            logList.scrollTop = logList.scrollHeight;
        }, 0);
    }
}



/**
 * Toggles the ignore duplicates setting
 */
function toggleIgnoreDuplicates() {
    ignoreDuplicateLogs = !ignoreDuplicateLogs;
    updateIgnoreDuplicatesButton();
    
    vscode.postMessage({
        command: 'toggleIgnoreDuplicates',
        enabled: ignoreDuplicateLogs
    });
}

/**
 * Updates the visual state of the ignore duplicates button
 */
function updateIgnoreDuplicatesButton() {
    const button = document.getElementById('ignoreDuplicatesButton');
    if (button) {
        button.classList.toggle('active', ignoreDuplicateLogs);
    }
}

/**
 * Handles search input changes
 * @param {string} newSearchText - The new search text
 */
function handleSearchInput(newSearchText) {
    searchText = newSearchText.trim();
    
    // Show/hide clear button based on search text
    const clearButton = document.getElementById('searchClearButton');
    if (clearButton) {
        clearButton.style.display = searchText ? 'block' : 'none';
    }
    
    // Update log visibility based on new search criteria
    updateLogVisibility();
}

/**
 * Clears the search input and resets search filtering
 */
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('searchClearButton');
    
    if (searchInput) {
        searchInput.value = '';
    }
    
    if (clearButton) {
        clearButton.style.display = 'none';
    }
    
    searchText = '';
    updateLogVisibility();
}

/**
 * Sends a ready message to the VS Code extension
 */
function sendWebviewReady() {
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({
            command: 'webviewReady'
        });
    }
}

// Event listeners
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        toggleFilter(button.dataset.filter);
    });
});

// Add event listeners for ignore duplicates and clear buttons
document.getElementById('ignoreDuplicatesButton')?.addEventListener('click', toggleIgnoreDuplicates);
document.getElementById('clearButton')?.addEventListener('click', clearLogs);

// Message handling
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command || message.type) {
        case 'addLog':
            addLog(message.log);
            break;
        case 'clearLogs':
            clearLogs();
            break;
        case 'setLogs':
        case 'updateLogs': {
            logs = message.logs || [];
            const receivedSelectedLogId = message.selectedLogId;
            
            // Update ignore duplicates state if provided
            if (typeof message.ignoreDuplicateLogs !== 'undefined') {
                ignoreDuplicateLogs = message.ignoreDuplicateLogs;
                updateIgnoreDuplicatesButton();
            }
            
            renderAllLogs(receivedSelectedLogId);
            break;
        }
    }
});

/**
 * Handle scroll events to update visible logs
 */
function handleScroll() {
    const logList = document.getElementById('logList');
    if (!logList) return;
    
    const filteredLogs = logs.filter(log => activeFilters.has(log.type));
    if (filteredLogs.length === 0) return;
    
    const scrollTop = logList.scrollTop;
    const visibleItems = calculateVisibleItems();
    const totalLogs = filteredLogs.length;
    
    // Calculate the start index based on scroll position
    const newStartIndex = Math.floor(scrollTop / ESTIMATED_ITEM_HEIGHT);
    visibleStartIndex = Math.max(0, Math.min(newStartIndex, totalLogs - visibleItems));
    
    // Only re-render if the visible range has changed significantly
    const currentEndIndex = Math.min(visibleStartIndex + visibleItems, totalLogs);
    if (Math.abs(currentEndIndex - visibleEndIndex) > 2) {
        scheduleRender();
    }
}

/**
 * Handle window resize events to recalculate visible items
 */
function handleResize() {
    scheduleRender();
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        updateIgnoreDuplicatesButton(); // Initialize button state
        updateFilterButtons(); // Initialize filter button states
        updateDetailsPanel(); // Initialize details panel with default message
        
        // Add search event listeners
        const searchInput = document.getElementById('searchInput');
        const searchClearButton = document.getElementById('searchClearButton');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                handleSearchInput(e.target.value);
            });
        }
        
        if (searchClearButton) {
            searchClearButton.addEventListener('click', clearSearch);
        }
        
        sendWebviewReady();
        
        // Add scroll and resize event listeners
        const logList = document.getElementById('logList');
        if (logList) {
            logList.addEventListener('scroll', handleScroll);
        }
        window.addEventListener('resize', handleResize);
    });
} else {
    updateIgnoreDuplicatesButton(); // Initialize button state
    updateFilterButtons(); // Initialize filter button states
    updateDetailsPanel(); // Initialize details panel with default message
    
    // Add search event listeners
    const searchInput = document.getElementById('searchInput');
    const searchClearButton = document.getElementById('searchClearButton');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            handleSearchInput(e.target.value);
        });
    }
    
    if (searchClearButton) {
        searchClearButton.addEventListener('click', clearSearch);
    }
    
    sendWebviewReady();
    
    // Add scroll and resize event listeners
    const logList = document.getElementById('logList');
    if (logList) {
        logList.addEventListener('scroll', handleScroll);
    }
    window.addEventListener('resize', handleResize);
}

// Also send ready message when page becomes visible (for cases where DOMContentLoaded already fired)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log("UnityConsole: page became visible, sending webviewReady");
        sendWebviewReady();
    }
});