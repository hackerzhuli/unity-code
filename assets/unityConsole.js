const vscode = acquireVsCodeApi();
let logs = [];
let activeFilters = new Set(['info', 'warning', 'error']);
let selectedLogId = null;
let ignoreDuplicateLogs = true; // Default to true

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
        const filteredLogs = logs.filter(l => activeFilters.has(l.type));
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
    
    // Filter logs based on active filters
    const filteredLogs = logs.filter(log => activeFilters.has(log.type));
    
    if (filteredLogs.length === 0) {
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
    
    // Handle selection
    if (selectedLogId) {
        const selectedElement = logList.querySelector(`[data-id="${selectedLogId}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }
    
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
    
    // Find the log and display details
    const log = logs.find(l => l.id === logId);
    if (log) {
        showLogDetails(log);
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
 * Processes stack trace text and makes file paths clickable
 * @param {string} text - The stack trace text to process
 * @returns {HTMLElement} Container element with processed stack trace
 */
function processStackTrace(text) {
    const container = document.createElement('div');
    const lines = text.split('\n');
    
    lines.forEach(line => {
        const lineElement = document.createElement('div');
        
        // Check if line contains file path and line number
        const fileMatch = line.match(/(.+\.cs):(\d+)/g);
        if (fileMatch) {
            lineElement.className = 'stack-trace-line';
            lineElement.textContent = line;
            lineElement.addEventListener('click', () => {
                // Send the entire line to the extension for parsing
                vscode.postMessage({
                    type: 'openFile',
                    stackTraceLine: line
                });
            });
        } else {
            lineElement.textContent = line;
        }
        
        container.appendChild(lineElement);
    });
    
    return container;
}

/**
 * Updates the visibility of log items based on active filters
 * Now optimized to trigger a re-render instead of manipulating individual items
 */
function updateLogVisibility() {
    // Reset visible range to show latest logs
    const filteredLogs = logs.filter(log => activeFilters.has(log.type));
    const totalLogs = filteredLogs.length;
    
    // Show the most recent logs by default
    visibleStartIndex = Math.max(0, totalLogs - calculateVisibleItems());
    
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
 * Renders all logs in the log list and handles selection
 * @param {string|null} targetSelectedLogId - The ID of the log to select after rendering
 */
function renderAllLogs(targetSelectedLogId) {
    selectedLogId = targetSelectedLogId;
    
    // Reset to show latest logs only if user is at bottom
    const logList = document.getElementById('logList');
    const wasAtBottom = logList ? (logList.scrollTop + logList.clientHeight >= logList.scrollHeight - 5) : true;
    
    const filteredLogs = logs.filter(log => activeFilters.has(log.type));
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
 * Handles log selection logic, including auto-selection of visible logs
 * @param {string|null} targetSelectedLogId - The ID of the log to select, or null for auto-selection
 */
function _handleLogSelection(targetSelectedLogId) {
    const visibleLogItems = Array.from(document.querySelectorAll('.log-item'));
    
    if (visibleLogItems.length === 0) {
        selectedLogId = null;
        return;
    }
    
    let logToSelect = null;
    
    if (targetSelectedLogId) {
        logToSelect = visibleLogItems.find(item => item.dataset.id === targetSelectedLogId);
    }
    
    if (!logToSelect) {
        logToSelect = visibleLogItems[0];
    }
    
    if (logToSelect) {
        selectLog(logToSelect.dataset.id);
    }
}

/**
 * Toggles the ignore duplicates setting
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// Send ready message on load
document.addEventListener('DOMContentLoaded', () => {
    updateIgnoreDuplicatesButton(); // Initialize button state
    sendWebviewReady();
});

// Also send ready message when page becomes visible (for cases where DOMContentLoaded already fired)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log("UnityConsole: page became visible, sending webviewReady");
        sendWebviewReady();
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
        sendWebviewReady();
        
        // Add scroll and resize event listeners
        const logList = document.getElementById('logList');
        if (logList) {
            logList.addEventListener('scroll', handleScroll);
        }
        window.addEventListener('resize', handleResize);
    });
} else {
    sendWebviewReady();
    
    // Add scroll and resize event listeners
    const logList = document.getElementById('logList');
    if (logList) {
        logList.addEventListener('scroll', handleScroll);
    }
    window.addEventListener('resize', handleResize);
}