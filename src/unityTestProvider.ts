import * as vscode from 'vscode';
import * as path from 'path';
import { UnityMessagingClient, MessageType, TestAdaptorContainer, TestResultAdaptorContainer, TestStatusAdaptor, TestResultAdaptor, TestAdaptor } from './unityMessagingClient.js';
import { logWithLimit } from './utils.js';
import { processTestStackTraceToMarkdown, processConsoleLogStackTraceToMarkdown } from './stackTraceUtils.js';
import { findSymbolByPath, detectLanguageServer, LanguageServerInfo } from './languageServerUtils.js';
import { UnityProjectManager } from './unityProjectManager.js';
import { wait } from './asyncUtils.js';

/**
 * Unity Test Provider for VS Code Testing API
 * Manages test discovery, execution, and result reporting
 */
export class UnityTestProvider implements vscode.CodeLensProvider {
    private testController: vscode.TestController;
    public messagingClient: UnityMessagingClient; // Made public for auto-refresh access
    private projectManager: UnityProjectManager;
    private testData = new WeakMap<vscode.TestItem, { uniqueName: string; fullName: string; testMode: 'EditMode' | 'PlayMode'; sourceLocation?: string }>();
    private runProfile: vscode.TestRunProfile;
    private debugProfile: vscode.TestRunProfile;
    private currentTestRun: vscode.TestRun | null = null;
    private isRunning: boolean = false;
    private testStartTimeout: NodeJS.Timeout | null = null;
    
    // Code lens related properties
    private allTests: TestAdaptor[] = [];
    private testResults = new Map<string, TestStatusAdaptor>();
    private codeLensProvider: vscode.Disposable | undefined;
    private symbolsInitialized: boolean = false;
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    constructor(context: vscode.ExtensionContext, messagingClient: UnityMessagingClient, projectManager: UnityProjectManager) {
        this.testController = vscode.tests.createTestController('unityTests', 'Unity Tests');
        
        this.messagingClient = messagingClient;
        this.projectManager = projectManager;
        
        // Register test controller
        context.subscriptions.push(this.testController);
        
        // Register code lens provider for C# files
        this.codeLensProvider = vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: 'csharp' },
            this
        );
        context.subscriptions.push(this.codeLensProvider);
        context.subscriptions.push(this.onDidChangeCodeLensesEmitter);
        
        // Create run profiles
        this.runProfile = this.testController.createRunProfile(
            'Run Unity Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runTests(request, token),
            true
        );
        
        this.debugProfile = this.testController.createRunProfile(
            'Debug Unity Tests',
            vscode.TestRunProfileKind.Debug,
            (request, token) => this.runTests(request, token),
            true
        );
        
        // Setup refresh handler
        this.testController.refreshHandler = () => this.discoverTests();
        
        // Setup messaging client handlers
        this.setupMessageHandlers();
        
        // Subscribe to connection status event to discover tests when Unity connects
        this.messagingClient.onConnectionStatus.subscribe((isConnected) => {
            if (isConnected) {
                console.log('UnityCode: Unity connection established, discovering tests...');
                this.discoverTestsSilently();
            } else {
                console.log('UnityCode: Unity disconnected');
            }
        });
    }

    /**
     * Setup message handlers for Unity communication
     */
    private setupMessageHandlers(): void {
        this.messagingClient.onMessage(MessageType.TestListRetrieved, (message) => {
            this.handleTestListRetrieved(message.value);
        });

        this.messagingClient.onMessage(MessageType.TestStarted, (message) => {
            this.handleTestStarted(message.value);
        });

        this.messagingClient.onMessage(MessageType.TestFinished, async (message) => {
            await this.handleTestFinished(message.value);
        });

        this.messagingClient.onMessage(MessageType.RunStarted, () => {
            // Test run started in Unity
            console.log('UnityCode: Test run started in Unity');
            this.setRunningState(true);
        });

        this.messagingClient.onMessage(MessageType.RunFinished, () => {
            // Test run finished in Unity
            if (this.currentTestRun) {
                this.currentTestRun.end();
                this.currentTestRun = null;
            }
            this.setRunningState(false);
        });

        this.messagingClient.onMessage(MessageType.ExecuteTests, () => {
            // Unity confirmed it received and processed the ExecuteTests request
            console.log('UnityCode: Unity confirmed test execution request received');
            this.clearTestTimeout();
        });

        this.messagingClient.onMessage(MessageType.CompilationFinished, async () => {
            // Check if compilation refresh is enabled
            const config = vscode.workspace.getConfiguration('unity-code');
            const refreshOnCompilationEnabled = config.get<boolean>('refreshTestsOnCompilation', true);
            
            if (!refreshOnCompilationEnabled) {
                return;
            }
            
            // Check if tests are currently running to avoid race conditions
            if (this.isRunning) {
                console.log('UnityCode: Compilation finished, but tests are running. Skipping test refresh.');
                return;
            }

            // Wait a bit, because usually domain reload will happen right after compilation
            // So we need to wait so that the message of Unity offline is received before we send the request
            // Otherwise we will probably fail to refresh tests
            await wait(1500);
            
            // Unity compilation finished, refresh tests automatically
            console.log('UnityCode: Compilation finished, refreshing tests...');
            this.discoverTests();
        });
    }

    /**
     * Discover tests from Unity
     */
    async discoverTests(): Promise<void> {
        return this.discoverTestsInternal(true);
    }

    /**
     * Discover tests from Unity silently (without showing warning messages)
     */
    async discoverTestsSilently(): Promise<void> {
        return this.discoverTestsInternal(false);
    }

    /**
     * Internal method to discover tests with optional warning messages
     */
    private async discoverTestsInternal(showWarnings: boolean): Promise<void> {
        try {
            console.log('UnityCode: Starting test discovery...');
            
            // Check if connected to Unity (auto-connection handles connection attempts)
            if (!this.messagingClient.connected) {
                console.log('UnityCode: Not connected to Unity. Auto-connection will handle reconnection.');
                if (showWarnings) {
                    vscode.window.showWarningMessage('UnityCode: Not connected to Unity Editor. Make sure Unity is running and wait for auto-connection.');
                }
                return;
            }

            // Request test lists for both modes
            console.log('UnityCode: Requesting test lists...');
            await this.messagingClient.requestTestList('EditMode');
            await this.messagingClient.requestTestList('PlayMode');
            
        } catch (error) {
            console.error('UnityCode: Error discovering tests:', error);
            if (showWarnings) {
                vscode.window.showErrorMessage(`UnityCode: Failed to discover tests: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Handle test list retrieved from Unity
     */
    private handleTestListRetrieved(value: string): void {
        try {
            logWithLimit(`UnityCode: Received test list data: ${value}`);
            
            const colonIndex = value.indexOf(':');
            if (colonIndex === -1) {
                console.error('UnityCode: Invalid test list format - no colon separator found');
                console.error(`UnityCode: Raw value received: "${value}"`);
                return;
            }

            const testMode = value.substring(0, colonIndex) as 'EditMode' | 'PlayMode';
            const jsonData = value.substring(colonIndex + 1);
            
            console.log(`UnityCode: Test mode: ${testMode}`);
            logWithLimit(`UnityCode: JSON data: ${jsonData}`);
            
            if (!jsonData) {
                console.log(`UnityCode: No tests found for ${testMode}`);
                return;
            }

            const testContainer: TestAdaptorContainer = JSON.parse(jsonData);
            console.log(`UnityCode: Parsed test container:`, testContainer);
            console.log(`UnityCode: Number of tests found: ${testContainer.TestAdaptors?.length || 0}`);
            
            this.buildTestTree(testContainer, testMode);
            
        } catch (error) {
            console.error('UnityCode: Error parsing test list:', error);
        }
    }

    /**
     * Build test tree from Unity test data
     */
    private buildTestTree(testContainer: TestAdaptorContainer, testMode: 'EditMode' | 'PlayMode'): void {
        // Clear existing tests for this mode
        const modeItem = this.getOrCreateModeItem(testMode);
        modeItem.children.replace([]);

        if (!testContainer.TestAdaptors || testContainer.TestAdaptors.length === 0) {
            return;
        }
        
        // Store tests for code lens functionality
        // Remove existing tests for this mode and add new ones
        this.allTests = this.allTests.filter(test => {
            // Keep tests that don't match the current test mode by checking if any test in current container has same FullName
            return !testContainer.TestAdaptors.some(newTest => newTest.FullName === test.FullName);
        });
        this.allTests.push(...testContainer.TestAdaptors);
        
        // Refresh code lenses
        this.onDidChangeCodeLensesEmitter.fire();

        // Create a map to store test items by their index
        const testItems = new Map<number, vscode.TestItem>();
        
        // First pass: create all test items
        testContainer.TestAdaptors.forEach((test, index) => {
            // Use SourceLocation if available, fallback to Assembly
            let fileUri: vscode.Uri | undefined;
            if (test.SourceLocation) {
                // SourceLocation format: "Assets/Path/File.cs:LineNumber"
                // Extract just the file path part (remove line number)
                const colonIndex = test.SourceLocation.lastIndexOf(':');
                const filePath = colonIndex > 0 ? test.SourceLocation.substring(0, colonIndex) : test.SourceLocation;
                
                // Convert to absolute path if it's a relative path
                const projectPath = this.projectManager.getUnityProjectPath();
                if (projectPath && !path.isAbsolute(filePath)) {
                    // Handle relative paths by joining with project path
                    const absolutePath = path.join(projectPath, filePath);
                    fileUri = vscode.Uri.file(absolutePath);
                } else {
                    // Use the path as-is (either absolute or no project path available)
                    fileUri = vscode.Uri.file(filePath);
                }
            } else if (test.Assembly) {
                // Fallback to Assembly field
                fileUri = vscode.Uri.file(test.Assembly);
            }
            
            const testItem = this.testController.createTestItem(
                `${testMode}_${test.UniqueName}`,
                test.Name,
                fileUri
            );
            
            testItem.description = test.FullName;
            testItem.canResolveChildren = false;
            
            // Set range if we have source location with line number (only for methods, not types)
            if (test.SourceLocation && test.Method) {
                const colonIndex = test.SourceLocation.lastIndexOf(':');
                if (colonIndex > 0) {
                    const lineNumberStr = test.SourceLocation.substring(colonIndex + 1);
                    const lineNumber = parseInt(lineNumberStr, 10);
                    if (!isNaN(lineNumber) && lineNumber > 0) {
                        // VS Code uses 0-based line numbers
                        const line = lineNumber - 1;
                        testItem.range = new vscode.Range(line, 0, line, 0);
                    }
                }
            }
            
            // Store test data
            this.testData.set(testItem, {
                uniqueName: test.UniqueName,
                fullName: test.FullName,
                testMode: testMode,
                sourceLocation: test.SourceLocation
            });
            
            testItems.set(index, testItem);
        });
        
        // Second pass: build hierarchy
        testContainer.TestAdaptors.forEach((test, index) => {
            const testItem = testItems.get(index)!;
            
            if (test.Parent === -1) {
                // Root level test - add to mode item
                modeItem.children.add(testItem);
            } else {
                // Child test - add to parent
                const parentItem = testItems.get(test.Parent);
                if (parentItem) {
                    parentItem.children.add(testItem);
                }
            }
        });
    }

    /**
     * Get or create test mode item (EditMode/PlayMode)
     */
    private getOrCreateModeItem(testMode: 'EditMode' | 'PlayMode'): vscode.TestItem {
        const existingItem = this.testController.items.get(testMode);
        if (existingItem) {
            return existingItem;
        }

        const modeItem = this.testController.createTestItem(
            testMode,
            testMode === 'EditMode' ? 'Edit Mode Tests' : 'Play Mode Tests'
        );
        
        modeItem.canResolveChildren = true;
        this.testController.items.add(modeItem);
        
        return modeItem;
    }

    /**
     * Check if tests are currently running
     */
    public isTestsRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Set the running state and update run profile availability
     */
    private setRunningState(running: boolean): void {
        this.isRunning = running;
        
        // Dispose existing profiles
        this.runProfile.dispose();
        this.debugProfile.dispose();
        
        // Recreate profiles with updated availability
        this.runProfile = this.testController.createRunProfile(
            'Run Unity Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runTests(request, token),
            !running // Disable when running
        );
        
        this.debugProfile = this.testController.createRunProfile(
            'Debug Unity Tests',
            vscode.TestRunProfileKind.Debug,
            (request, token) => this.runTests(request, token),
            !running // Disable when running
        );
        
        // Force immediate code lens refresh for running state changes
        this.forceCodeLensRefresh();
    }

    /**
     * Force immediate code lens refresh without delays
     */
    private forceCodeLensRefresh(): void {
        // Temporarily mark symbols as initialized to skip delay
        const wasInitialized = this.symbolsInitialized;
        this.symbolsInitialized = true;
        
        this.onDidChangeCodeLensesEmitter.fire();
        
        // Restore original state after a short delay
        setTimeout(() => {
            this.symbolsInitialized = wasInitialized;
        }, 100);
    }

    /**
     * Run tests(only support running one test at a time, due to limitation from Unity)
     */
    public async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (this.isRunning) {
            vscode.window.showErrorMessage('UnityCode: Tests are already running. Please wait for the current test run to complete.');
            return;
        }

        if (!this.messagingClient.connected) {
            console.error('UnityCode: Not connected to Unity Editor. Auto-connection will handle reconnection.');
            return;
        }

        if (this.messagingClient.unityPlaying) {
            vscode.window.showErrorMessage('UnityCode: Cannot run tests while Unity is in Play Mode. Please stop Play Mode first.');
            return;
        }

        // If no specific tests requested, run all tests
        const testsToRun = request.include;
        if(!testsToRun || testsToRun.length === 0){
            console.error('UnityCode: No tests to run. Please add tests to run.');
            return;
        }

        // Unity test execution is unreliable with multiple tests, so we only support running one test at a time
        if (testsToRun.length > 1) {
            console.error('UnityCode: Multiple test execution is not supported due to Unity reliability issues. Running only the first test.');
        }

        // Create test run for only the first test
        const testToRun = testsToRun[0];
        if(!testToRun){
            console.error('UnityCode: No test to run. Please add test to run.');
            return;
        }

        const testData = this.testData.get(testToRun);
        if (!testData) {
            console.error(`UnityCode: Test data not found for ${testToRun}`);
            return;
        }
        if (token.isCancellationRequested) {
            return;
        }

        try {
            const success = await this.messagingClient.executeTests(testData.testMode, testData.fullName);
            if (!success) {
                console.error(`UnityCode: Failed to send test execution message for ${testData.fullName}`);
            }else{
                this.setRunningState(true);
                this.currentTestRun = this.testController.createTestRun(new vscode.TestRunRequest([testToRun]));
                this.currentTestRun.started(testToRun);
                
                // Set up timeout to detect if execute tests is actually received
                this.testStartTimeout = setTimeout(() => {
                    console.error(`UnityCode: Test ${testData.fullName} did not start within 5 seconds, ending test run`);
                    if (this.currentTestRun) {
                        this.currentTestRun.errored(testToRun, new vscode.TestMessage('Test did not start within 5 seconds. The test may not be running in Unity Editor.'));
                        this.currentTestRun.end();
                        this.currentTestRun = null;
                    }
                    this.setRunningState(false);
                    this.clearTestTimeout();
                }, 5000);
            }
        } catch (error) {
            console.error('UnityCode: Error running tests:', error);
            //vscode.window.showErrorMessage(`UnityCode: Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
            
            if(this.isRunning){
                // Reset running state on error
                this.setRunningState(false);
                if (this.currentTestRun) {
                    this.currentTestRun.end();
                    this.currentTestRun = null;
                }
                this.clearTestTimeout();
            }
        }
    }

    /**
     * Get all test items
     */
    private getAllTests(): vscode.TestItem[] {
        const tests: vscode.TestItem[] = [];
        
        const collectTests = (item: vscode.TestItem) => {
            if (this.testData.has(item)) {
                tests.push(item);
            }
            for (const [, child] of item.children) {
                collectTests(child);
            }
        };
        
        for (const [, item] of this.testController.items) {
            collectTests(item);
        }
        
        return tests;
    }

    /**
     * Handle test started message from Unity
     */
    private handleTestStarted(value: string): void {
        if (!this.currentTestRun) {
            return;
        }
        try {
            const testContainer = JSON.parse(value) as TestAdaptorContainer;

            for (const test of testContainer.TestAdaptors) {
                const testName = test.FullName;

                const testItem = this.findTestByFullName(testName);
                if (testItem) {
                    // Check if this is a child test by verifying it's different from the main test we're running
                    const testData = this.testData.get(testItem);
                    if (testData) {
                        console.log(`UnityCode: Child test started: ${testName}`);
                        this.currentTestRun.started(testItem);
                    }
                }
            }

        } catch (error) {
            console.error('UnityCode: Error parsing test started message:', error);
        }
    }

    /**
     * Clear the test start timeout
     */
    private clearTestTimeout(): void {
        if (this.testStartTimeout) {
            clearTimeout(this.testStartTimeout);
            this.testStartTimeout = null;
        }
    }

    /**
     * Handle test finished message from Unity
     */
    private async handleTestFinished(value: string): Promise<void> {
        try {
            const resultContainer: TestResultAdaptorContainer = JSON.parse(value);
            
            for (const result of resultContainer.TestResultAdaptors) {
                await this.updateTestResult(result);
            }
            
        } catch (error) {
            console.error('UnityCode: Error parsing test finished message:', error);
        }
    }

    /**
     * Build result for terminal
     */
    private buildOutputForTerminal(result: TestResultAdaptor): string {
        const outputParts: string[] = [];
        
        // Add duration information if available
        if (result.Duration !== undefined && result.Duration > 0) {
            const durationMs = result.Duration * 1000;
            const durationText = durationMs < 1000 
                ? `${durationMs.toFixed(0)}ms`
                : `${(result.Duration).toFixed(2)}s`;
            outputParts.push(`Duration: ${durationText}`);
        }
        
        // Add message if available and not empty
        if (result.Message && result.Message.trim()) {
            outputParts.push(`Message: ${result.Message.trim()}`);
        }
        
        // Add test output/logs if available and not empty
        if (result.Output && result.Output.trim()) {
            outputParts.push(`Test Output:\n${result.Output.trim()}`);
        }
        
        return outputParts.join('\r\n'); // don't forget \r, it's for terminal
    }

    private async buildTestMessages(result: TestResultAdaptor): Promise<vscode.TestMessage[]> {
        const messages: vscode.TestMessage[] = [];
        const outputParts: string[] = [];
        
        // Add status-specific header for all test types
        if (result.TestStatus === TestStatusAdaptor.Failed) {
            outputParts.push('❌ **Test Failed**');
        } else if (result.TestStatus === TestStatusAdaptor.Inconclusive) {
            outputParts.push('⚠️ **Test Inconclusive**');
        } else if (result.TestStatus === TestStatusAdaptor.Passed) {
            outputParts.push('✅ **Test Passed**');
        }
        
        // Add duration information if available
        if (result.Duration !== undefined && result.Duration > 0) {
            const durationMs = result.Duration * 1000;
            const durationText = durationMs < 1000 
                ? `${durationMs.toFixed(0)}ms`
                : `${(result.Duration).toFixed(2)}s`;
            outputParts.push(`⏱️ **Duration:** ${durationText}`);
        }
        
        // Add message if available and not empty
        if (result.Message && result.Message.trim()) {
            // Replace newlines with markdown line breaks to ensure proper formatting
            const formattedMessage = result.Message.trim().replace(/\n/g, '  \n');
            outputParts.push(`**Message:** ${formattedMessage}`);
        }
        
        // Add processed stack trace with clickable links if available and not empty
        if (result.StackTrace && result.StackTrace.trim()) {
            const projectPath = this.projectManager.getUnityProjectPath();
            
            let processedStackTrace: string;
            if (result.StackTrace.startsWith('at ')) {
                // Normal stack trace format (starts with "at ")
                processedStackTrace = await processTestStackTraceToMarkdown(result.StackTrace, projectPath || '');
            } else {
                // Log stack trace format (doesn't start with "at ")
                processedStackTrace = await processConsoleLogStackTraceToMarkdown(result.StackTrace, projectPath || '');
            }
            // Replace newlines with markdown line breaks to ensure proper formatting
            processedStackTrace = processedStackTrace.replace(/\n/g, '  \n');
            if (processedStackTrace) {
                outputParts.push(`## Stack Trace\n${processedStackTrace}`);
            }
        }
        
        // Add test output/logs if available and not empty
        if (result.Output && result.Output.trim()) {
            // Replace newlines with markdown line breaks to ensure proper formatting
            const formattedOutput = result.Output.trim().replace(/\n/g, '  \n');
            outputParts.push(`## Output\n${formattedOutput}`);
        }
        
        // Create TestMessage with MarkdownString if we have content
        if (outputParts.length > 0) {
            // Join parts with double newlines for proper markdown spacing
            const markdownText = outputParts.join('\n\n');
            const markdownContent = new vscode.MarkdownString(markdownText);
            markdownContent.supportHtml = false;
            markdownContent.isTrusted = true; // Allow command links
            messages.push(new vscode.TestMessage(markdownContent));
        }
        
        return messages;
    }

    /**
     * Update test result in VS Code
     */
    private async updateTestResult(result: TestResultAdaptor): Promise<void> {
        // Store test result for code lens
        this.testResults.set(result.FullName, result.TestStatus);
        
        // Force immediate code lens refresh to show updated status
        this.forceCodeLensRefresh();
        
        if (!this.currentTestRun) {
            return;
        }

        // Find the test item by full name
        const testItem = this.findTestByFullName(result.FullName);
        if (!testItem) {
            console.warn(`UnityCode: Could not find test item for ${result.FullName}`);
            return;
        }

        // Calculate duration from the test result (Duration is in seconds, VS Code expects milliseconds)
        const duration = result.Duration ? result.Duration * 1000 : undefined;
        
        // Build test messages with markdown support
        const testMessages = await this.buildTestMessages(result);

        switch (result.TestStatus) {
            case TestStatusAdaptor.Passed: {
                // For passing tests, generate plain text output directly if there's relevant information
                const plainTextOutput = this.buildOutputForTerminal(result);
                if (plainTextOutput && this.currentTestRun) {
                    console.log(`UnityTestProvider: plainTextOutput = ${plainTextOutput}`)
                    this.currentTestRun.appendOutput(plainTextOutput + '\r\n', undefined, testItem);
                }
                if (this.currentTestRun) {
                    this.currentTestRun.passed(testItem, duration);
                }
                break;
            }
            case TestStatusAdaptor.Failed: {
                if (this.currentTestRun) {
                    // Use TestMessage array for failed tests
                    if (testMessages.length > 0) {
                        this.currentTestRun.failed(testItem, testMessages, duration);
                    } else {
                        this.currentTestRun.failed(testItem, new vscode.TestMessage(''), duration);
                    }
                }
                break;
            }
            case TestStatusAdaptor.Skipped: {
                if (this.currentTestRun) {
                    this.currentTestRun.skipped(testItem);
                }
                break;
            }
            case TestStatusAdaptor.Inconclusive: {
                if (this.currentTestRun) {
                    // Use TestMessage array for inconclusive tests
                    if (testMessages.length > 0) {
                        this.currentTestRun.failed(testItem, testMessages, duration);
                    } else {
                        this.currentTestRun.failed(testItem, new vscode.TestMessage(''), duration);
                    }
                }
                break;
            }
        }
    }

    /**
     * Find test item by full name
     */
    public findTestByFullName(fullName: string): vscode.TestItem | null {
        const findInCollection = (collection: vscode.TestItemCollection): vscode.TestItem | null => {
            for (const [, item] of collection) {
                const testData = this.testData.get(item);
                if (testData && testData.fullName === fullName) {
                    return item;
                }
                
                // Search in children
                const found = findInCollection(item.children);
                if (found) {
                    return found;
                }
            }
            return null;
        };
        
        return findInCollection(this.testController.items);
    }

    /**
     * Manually refresh tests from Unity
     */
    async refreshTests(): Promise<void> {
        console.log('UnityCode: Manual test refresh requested');
        await this.discoverTests();
    }

    /**
     * Provide code lenses for C# test methods and classes
     */
    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        if (token.isCancellationRequested || this.allTests.length === 0) {
            return [];
        }

        try {
            if (token.isCancellationRequested) {
                return [];
            }

            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            console.log('Document symbols result:', symbols ? symbols.length : 'undefined');

            if (!symbols || symbols.length === 0) {
                return [];
            }

            // Debug: Log available tests
            console.log(`Available tests count: ${this.allTests.length}`);
            if (this.allTests.length > 0) {
                console.log(`Sample test data:`);
                this.allTests.slice(0, 5).forEach((test, i) => {
                    console.log(`  Test ${i}: Name="${test.Name}", FullName="${test.FullName}", Type="${test.Type}", Method="${test.Method}", Parent=${test.Parent}`);
                });
            }

            // Detect language server once at entry point for optimization
            const languageServerInfo = detectLanguageServer(symbols);
            
            const codeLenses: vscode.CodeLens[] = [];
            await this.findTestCodeLenses(symbols, document, codeLenses, languageServerInfo);
            
            console.log(`Generated code lenses count: ${codeLenses.length}`);
            return codeLenses;

        } catch (error) {
            console.error('Error providing code lenses:', error);
            return [];
        }
    }

    /**
     * Find code lenses by creating one code lens per test class
     */
    private async findTestCodeLenses(
        symbols: vscode.DocumentSymbol[],
        document: vscode.TextDocument,
        codeLenses: vscode.CodeLens[],
        languageServerInfo: LanguageServerInfo
    ): Promise<void> {        
        // Create one code lens for each unique test class
        for (const test of this.allTests) {
            // make sure test is a class, not method/or namespace/or other things
            if(!test.Type){
                continue;
            }

            if(test.Method){
                continue;
            }

            const classSymbol = findSymbolByPath(symbols, test.FullName, languageServerInfo);
            if (classSymbol && (classSymbol.kind === vscode.SymbolKind.Class || classSymbol.kind === vscode.SymbolKind.Struct)) {
                console.log(`Found class symbol for test class: ${test.FullName}`);
                
                const codeLen = this.createCodeLens(classSymbol, test, document);
                if (codeLen) {
                    codeLenses.push(codeLen);
                }
            }
        }
    }

    /**
     * Create a code lens for the given symbol and test
     */
    private createCodeLens(symbol: vscode.DocumentSymbol, test: TestAdaptor, _document: vscode.TextDocument): vscode.CodeLens | null {
        // Use the symbol's selection range for better positioning
        const range = symbol.selectionRange;
        
        // Create code lens with test information
        const codeLens = new vscode.CodeLens(range);
        codeLens.command = {
            title: this.getCodeLensTitle(test),
            command: 'unity-code.runTests',
            arguments: [test.FullName]
        };
        
        return codeLens;
    }

    /**
     * Get the title for the code lens based on test result
     */
    private getCodeLensTitle(test: TestAdaptor): string {
        const result = this.testResults.get(test.FullName);
        
        let statusIcon = '⚪'; // Default for no result
        if (result !== undefined) {
            switch (result) {
                case TestStatusAdaptor.Passed:
                    statusIcon = '✅';
                    break;
                case TestStatusAdaptor.Failed:
                    statusIcon = '❌';
                    break;
                case TestStatusAdaptor.Skipped:
                    statusIcon = '⏭️';
                    break;
                case TestStatusAdaptor.Inconclusive:
                    statusIcon = '❓';
                    break;
            }
        }
        
        // Show running indicator when tests are executing
        if (this.isRunning) {
            return `⏳ Running class tests ${statusIcon}`;
        }
        
        return `▶️ Run class tests ${statusIcon}`;
    }

    /**
     * Helper method to combine path components
     */
    private combinePath(basePath: string, name: string): string {
        return basePath ? `${basePath}.${name}` : name;
    }

    /**
     * Dispose the test provider
     */
    dispose(): void {
        this.onDidChangeCodeLensesEmitter.dispose();
        this.testController.dispose();
    }
}