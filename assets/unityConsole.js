const vscode = acquireVsCodeApi();
let logs = [];
let activeFilters = new Set(['info', 'warning', 'error']);
let selectedLogId = null;

console.log("UnityConsoleWebView: JavaScript initialized");
console.log("UnityConsoleWebView: Initial logs array:", logs);
console.log("UnityConsoleWebView: Initial activeFilters:", activeFilters);

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
    console.log("UnityConsoleWebView: createLogElement called with:", log);
    const div = document.createElement('div');
    div.className = 'log-item';
    div.dataset.type = log.type;
    div.dataset.id = log.id;
    console.log("UnityConsoleWebView: created div element:", div);
    
    const icon = document.createElement('div');
    icon.className = 'log-icon ' + log.type;
    icon.textContent = getLogIcon(log.type);
    
    const message = document.createElement('div');
    message.className = 'log-message';
    message.textContent = getFirstLine(log.message);
    
    const time = document.createElement('div');
    time.className = 'log-time';
    time.textContent = formatTime(new Date(log.timestamp));
    console.log("UnityConsoleWebView: formatted time:", time.textContent);
    
    div.appendChild(icon);
    div.appendChild(message);
    div.appendChild(time);
    console.log("UnityConsoleWebView: all elements appended to div");
    
    div.addEventListener('click', () => selectLog(log.id));
    console.log("UnityConsoleWebView: click listener added to div");
    
    return div;
}

/**
 * Adds a new log entry to the log list and updates the UI
 * @param {Object} log - The log object to add
 */
function addLog(log) {
    console.log("UnityConsoleWebView: addLog called with:", log);
    logs.push(log);
    console.log("UnityConsoleWebView: logs array after push:", logs);
    
    const logList = document.getElementById('logList');
    const noLogs = document.getElementById('noLogs');
    
    console.log("UnityConsoleWebView: logList element:", logList);
    console.log("UnityConsoleWebView: noLogs element:", noLogs);
    
    if (noLogs) {
        noLogs.style.display = 'none';
        console.log("UnityConsoleWebView: noLogs hidden");
    }
    
    const logElement = createLogElement(log);
    console.log("UnityConsoleWebView: created logElement:", logElement);
    logList.appendChild(logElement);
    console.log("UnityConsoleWebView: logElement appended to logList");
    
    updateLogVisibility();
    updateLogCounts();
    
    // Auto-scroll to bottom
    logList.scrollTop = logList.scrollHeight;
}

/**
 * Clears all logs from the UI and resets the state
 */
function clearLogs() {
    logs = [];
    selectedLogId = null;
    
    const logList = document.getElementById('logList');
    const noLogs = document.getElementById('noLogs');
    const detailsContent = document.getElementById('detailsContent');
    
    logList.innerHTML = '';
    logList.appendChild(noLogs);
    noLogs.style.display = 'flex';
    detailsContent.textContent = 'Select a log entry to view details';
    
    // Reset log counts
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
 */
function updateLogVisibility() {
    console.log("UnityConsoleWebView: updateLogVisibility called");
    const logItems = document.querySelectorAll('.log-item');
    console.log("UnityConsoleWebView: found", logItems.length, "log items");
    console.log("UnityConsoleWebView: activeFilters:", activeFilters);
    
    // Store current selection before updating visibility
    const currentSelectedId = selectedLogId;
    console.log("UnityConsoleWebView: current selectedLogId before visibility update:", currentSelectedId);
    
    logItems.forEach((item, index) => {
        const type = item.dataset.type;
        console.log("UnityConsoleWebView: processing item", index, "type:", type);
        if (activeFilters.has(type)) {
            item.classList.remove('hidden');
            console.log("UnityConsoleWebView: item", index, "shown");
        } else {
            item.classList.add('hidden');
            console.log("UnityConsoleWebView: item", index, "hidden");
        }
    });
    
    // Check if currently selected log is still visible
    if (currentSelectedId) {
        const selectedElement = document.querySelector('.log-item.selected');
        if (selectedElement && selectedElement.classList.contains('hidden')) {
            // Selected log is now hidden, need to select a new one
            console.log("UnityConsoleWebView: selected log is now hidden, reselecting");
            handleLogSelection(null); // Auto-select first visible log
        }
    } else {
        // No current selection, auto-select first visible log
        handleLogSelection(null);
    }
    
    console.log("UnityConsoleWebView: updateLogVisibility completed");
}

/**
 * Toggles the active state of a log filter
 * @param {string} type - The filter type to toggle ('all', 'info', 'warning', 'error')
 */
function toggleFilter(type) {
    if (type === 'all') {
        if (activeFilters.size === 3) {
            // If all are active, deactivate all
            activeFilters.clear();
        } else {
            // If not all are active, activate all
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
        if (counts.hasOwnProperty(log.type)) {
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
    console.log("UnityConsoleWebView: renderAllLogs called with targetSelectedLogId:", targetSelectedLogId);
    const logList = document.getElementById('logList');
    let noLogs = document.getElementById('noLogs');
    
    console.log("UnityConsoleWebView: logList element:", logList);
    console.log("UnityConsoleWebView: noLogs element:", noLogs);
    console.log("UnityConsoleWebView: current logs array:", logs);
    console.log("UnityConsoleWebView: logs.length:", logs.length);
    
    // Clear all log items but preserve noLogs element
    const logItems = logList.querySelectorAll('.log-item');
    logItems.forEach(item => item.remove());
    console.log("UnityConsoleWebView: existing log items cleared");
    
    if (logs.length === 0) {
        console.log("UnityConsoleWebView: no logs, showing noLogs message");
        selectedLogId = null;
        if (!noLogs) {
            noLogs = document.createElement('div');
            noLogs.className = 'no-logs';
            noLogs.id = 'noLogs';
            noLogs.textContent = 'No logs to display';
            logList.appendChild(noLogs);
            console.log("UnityConsoleWebView: noLogs element recreated");
        }
        noLogs.style.display = 'flex';
    } else {
        console.log("UnityConsoleWebView: rendering", logs.length, "logs");
        if (noLogs) {
            noLogs.style.display = 'none';
            console.log("UnityConsoleWebView: noLogs hidden");
        }
        logs.forEach((log, index) => {
            console.log("UnityConsoleWebView: processing log", index, ":", log);
            const logElement = createLogElement(log);
            console.log("UnityConsoleWebView: created element for log", index, ":", logElement);
            logList.appendChild(logElement);
            console.log("UnityConsoleWebView: appended element for log", index);
        });
        console.log("UnityConsoleWebView: all logs rendered, calling updateLogVisibility");
        updateLogVisibility();
        updateLogCounts();
        
        // Handle log selection after rendering
        handleLogSelection(targetSelectedLogId);
    }
    console.log("UnityConsoleWebView: renderAllLogs completed, final logList children count:", logList.children.length);
}

/**
 * Handles log selection logic, including auto-selection of visible logs
 * @param {string|null} targetSelectedLogId - The ID of the log to select, or null for auto-selection
 */
function handleLogSelection(targetSelectedLogId) {
    console.log("UnityConsoleWebView: handleLogSelection called with:", targetSelectedLogId);
    
    // Get all visible log items
    const visibleLogItems = Array.from(document.querySelectorAll('.log-item:not(.hidden)'));
    console.log("UnityConsoleWebView: found", visibleLogItems.length, "visible log items");
    
    if (visibleLogItems.length === 0) {
        console.log("UnityConsoleWebView: no visible logs to select");
        selectedLogId = null;
        return;
    }
    
    let logToSelect = null;
    
    // Try to find the previously selected log if it exists and is visible
    if (targetSelectedLogId) {
        logToSelect = visibleLogItems.find(item => item.dataset.id === targetSelectedLogId);
        console.log("UnityConsoleWebView: searching for previous selection:", targetSelectedLogId, "found:", !!logToSelect);
    }
    
    // If no previous selection or it's not visible, select the first visible log
    if (!logToSelect) {
        logToSelect = visibleLogItems[0];
        console.log("UnityConsoleWebView: auto-selecting first visible log:", logToSelect?.dataset.id);
    }
    
    // Select the log
    if (logToSelect) {
        selectLog(logToSelect.dataset.id);
    }
}

/**
 * Sends a ready message to the VS Code extension
 */
function sendWebviewReady() {
    console.log("UnityConsoleWebView: sending webviewReady message");
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

// Message handling
window.addEventListener('message', event => {
    const message = event.data;
    console.log("UnityConsoleWebView: received message:", message);
    
    switch (message.command || message.type) {
        case 'addLog':
            console.log("UnityConsoleWebView: handling addLog message");
            addLog(message.log);
            break;
        case 'clearLogs':
            console.log("UnityConsoleWebView: handling clearLogs message");
            clearLogs();
            break;
        case 'setLogs':
        case 'updateLogs':
            console.log("UnityConsoleWebView: handling setLogs/updateLogs message with logs:", message.logs);
            logs = message.logs || [];
            const receivedSelectedLogId = message.selectedLogId;
            console.log("UnityConsoleWebView: logs array updated to:", logs);
            console.log("UnityConsoleWebView: received selectedLogId:", receivedSelectedLogId);
            renderAllLogs(receivedSelectedLogId);
            break;
        default:
            console.log("UnityConsoleWebView: unknown message type:", message.command || message.type);
    }
});

// Send ready message on load
document.addEventListener('DOMContentLoaded', sendWebviewReady);

// Also send ready message when page becomes visible (for cases where DOMContentLoaded already fired)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log("UnityConsoleWebView: page became visible, sending webviewReady");
        sendWebviewReady();
    }
});

// Send ready message immediately if DOM is already loaded
if (document.readyState === 'loading') {
    // DOM is still loading
} else {
    // DOM is already loaded
    sendWebviewReady();
}