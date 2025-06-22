import * as vscode from 'vscode';
import { UnityMessagingClient, MessageType, TestAdaptorContainer, TestResultAdaptorContainer, TestStatusAdaptor, TestResultAdaptor, TestAdaptor } from './unityMessagingClient.js';
import { logWithLimit } from './utils.js';

/**
 * Unity Test Provider for VS Code Testing API
 * Manages test discovery, execution, and result reporting
 */
export class UnityTestProvider implements vscode.CodeLensProvider {
    private testController: vscode.TestController;
    public messagingClient: UnityMessagingClient; // Made public for auto-refresh access
    private testData = new WeakMap<vscode.TestItem, { id: string; fullName: string; testMode: 'EditMode' | 'PlayMode' }>();
    private runProfile: vscode.TestRunProfile;
    private debugProfile: vscode.TestRunProfile;
    private currentTestRun: vscode.TestRun | null = null;
    private isRunning: boolean = false;
    
    // Code lens related properties
    private allTests: TestAdaptor[] = [];
    private testResults = new Map<string, TestStatusAdaptor>();
    private codeLensProvider: vscode.Disposable | undefined;
    private symbolsInitialized: boolean = false;
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    constructor(context: vscode.ExtensionContext, unityProjectPath?: string) {
        this.testController = vscode.tests.createTestController('unityTests', 'Unity Tests');
        
        this.messagingClient = new UnityMessagingClient(unityProjectPath);
        
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

        this.messagingClient.onMessage(MessageType.TestFinished, (message) => {
            this.handleTestFinished(message.value);
        });

        this.messagingClient.onMessage(MessageType.RunStarted, () => {
            // Test run started in Unity
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

        this.messagingClient.onMessage(MessageType.Pong, () => {
            // Unity is responding, connection is alive
        });

        this.messagingClient.onMessage(MessageType.CompilationFinished, () => {
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
            
            console.log('UnityCode: Connected to Unity, proceeding with test discovery...');

            // Request test lists for both modes
            console.log('UnityCode: Requesting EditMode test list...');
            await this.messagingClient.requestTestList('EditMode');
            console.log('UnityCode: Requesting PlayMode test list...');
            await this.messagingClient.requestTestList('PlayMode');
            console.log('UnityCode: Test list requests sent, waiting for responses...');
            
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
            const testItem = this.testController.createTestItem(
                `${testMode}_${test.Id}`,
                test.Name,
                vscode.Uri.file(test.Assembly || '')
            );
            
            testItem.description = test.FullName;
            testItem.canResolveChildren = false;
            
            // Store test data
            this.testData.set(testItem, {
                id: test.Id,
                fullName: test.FullName,
                testMode: testMode
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
     * Run tests
     */
    public async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (!this.messagingClient.connected) {
            vscode.window.showErrorMessage('UnityCode: Not connected to Unity Editor. Auto-connection will handle reconnection.');
            return;
        }

        if (this.isRunning) {
            vscode.window.showWarningMessage('UnityCode: Tests are already running. Please wait for the current test run to complete.');
            return;
        }

        this.setRunningState(true);
        this.currentTestRun = this.testController.createTestRun(request);
        
        try {
            // If no specific tests requested, run all tests
            const testsToRun = request.include || this.getAllTests();
            
            for (const test of testsToRun) {
                if (token.isCancellationRequested) {
                    break;
                }
                
                await this.runSingleTest(test);
            }
            
        } catch (error) {
            console.error('UnityCode: Error running tests:', error);
            vscode.window.showErrorMessage(`UnityCode: Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
            
            // Reset running state on error
            this.setRunningState(false);
            if (this.currentTestRun) {
                this.currentTestRun.end();
                this.currentTestRun = null;
            }
        } finally {
            // Ensure running state is reset if cancellation occurred
            if (token.isCancellationRequested) {
                this.setRunningState(false);
                if (this.currentTestRun) {
                    this.currentTestRun.end();
                    this.currentTestRun = null;
                }
            }
        }
    }

    /**
     * Run a single test
     */
    private async runSingleTest(test: vscode.TestItem): Promise<void> {
        const testData = this.testData.get(test);
        if (!testData) {
            // This might be a container (mode or namespace), run all children
            for (const [, child] of test.children) {
                await this.runSingleTest(child);
            }
            return;
        }

        if (this.currentTestRun) {
            this.currentTestRun.started(test);
        }

        try {
            await this.messagingClient.executeTests(testData.testMode, testData.fullName);
        } catch (error) {
            if (this.currentTestRun) {
                this.currentTestRun.failed(test, new vscode.TestMessage(`Failed to execute test: ${error instanceof Error ? error.message : String(error)}`));
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
        try {
            JSON.parse(value) as TestAdaptorContainer;
            // Unity sends test started notifications
            // We can use this to update test status if needed
        } catch (error) {
            console.error('UnityCode: Error parsing test started message:', error);
        }
    }

    /**
     * Handle test finished message from Unity
     */
    private handleTestFinished(value: string): void {
        try {
            const resultContainer: TestResultAdaptorContainer = JSON.parse(value);
            
            for (const result of resultContainer.TestResultAdaptors) {
                this.updateTestResult(result);
            }
            
        } catch (error) {
            console.error('UnityCode: Error parsing test finished message:', error);
        }
    }

    /**
     * Update test result in VS Code
     */
    private updateTestResult(result: TestResultAdaptor): void {
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

        const duration = undefined; // Unity doesn't provide duration in current protocol
        
        switch (result.TestStatus) {
            case TestStatusAdaptor.Passed: {
                this.currentTestRun.passed(testItem, duration);
                break;
            }
            case TestStatusAdaptor.Failed: {
                const message = new vscode.TestMessage(result.StackTrace || 'Test failed');
                this.currentTestRun.failed(testItem, message, duration);
                break;
            }
            case TestStatusAdaptor.Skipped: {
                this.currentTestRun.skipped(testItem);
                break;
            }
            case TestStatusAdaptor.Inconclusive: {
                const inconclusiveMessage = new vscode.TestMessage('Test result was inconclusive');
                this.currentTestRun.failed(testItem, inconclusiveMessage, duration);
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

            const codeLenses: vscode.CodeLens[] = [];
            await this.findTestCodeLenses(symbols, document, codeLenses);
            
            console.log(`Generated code lenses count: ${codeLenses.length}`);
            return codeLenses;

        } catch (error) {
            console.error('Error providing code lenses:', error);
            return [];
        }
    }

    /**
     * Find code lenses by grouping tests and finding matching symbols
     */
    private async findTestCodeLenses(
        symbols: vscode.DocumentSymbol[],
        document: vscode.TextDocument,
        codeLenses: vscode.CodeLens[]
    ): Promise<void> {
        // Group tests by class and method
        const testsByClass = new Map<string, TestAdaptor[]>();
        const processedSymbols = new Set<string>();
        
        // First, group all tests by their containing class
        for (const test of this.allTests) {
            const classPath = this.getClassPath(test.FullName);
            if (!testsByClass.has(classPath)) {
                testsByClass.set(classPath, []);
            }
            testsByClass.get(classPath)!.push(test);
        }
        
        // Create code lenses for each test method
        for (const test of this.allTests) {
            const symbol = this.findSymbolByPath(symbols, test.FullName);
            if (symbol && symbol.kind === vscode.SymbolKind.Method) {
                console.log(`Found method symbol for test: ${test.FullName}`);
                
                const codeLens = this.createCodeLens(symbol, [test], document);
                if (codeLens) {
                    codeLenses.push(codeLens);
                }
                processedSymbols.add(test.FullName);
            }
        }
        
        // Create code lenses for test classes (containing multiple tests)
        for (const [classPath, testsInClass] of testsByClass) {
            if (testsInClass.length > 1) { // Only create class-level code lens if there are multiple tests
                const classSymbol = this.findSymbolByPath(symbols, classPath);
                if (classSymbol && (classSymbol.kind === vscode.SymbolKind.Class || classSymbol.kind === vscode.SymbolKind.Struct)) {
                    console.log(`Found class symbol for ${testsInClass.length} tests: ${classPath}`);
                    
                    const codeLens = this.createCodeLens(classSymbol, testsInClass, document);
                    if (codeLens) {
                        codeLenses.push(codeLens);
                    }
                }
            }
        }
    }

    /**
     * Extract the class path from a full test name (removes the method name)
     */
    private getClassPath(fullName: string): string {
        const parts = fullName.split('.');
        // Remove the last part (method name) to get the class path
        return parts.slice(0, -1).join('.');
    }

    /**
     * Find a symbol by traversing the symbol tree using the given path
     */
    private findSymbolByPath(symbols: vscode.DocumentSymbol[], fullPath: string): vscode.DocumentSymbol | null {
        const pathParts = fullPath.split('.');
        return this.findSymbolRecursive(symbols, pathParts, 0);
    }

    /**
     * Recursively search for a symbol matching the path parts
     */
    private findSymbolRecursive(
        symbols: vscode.DocumentSymbol[], 
        pathParts: string[], 
        currentIndex: number
    ): vscode.DocumentSymbol | null {
        if (currentIndex >= pathParts.length) {
            return null;
        }

        const targetName = pathParts[currentIndex];
        console.log(`Looking for symbol: ${targetName} at index ${currentIndex}, available symbols: ${symbols.map(s => `${s.name}(${s.kind})`).join(', ')}`);
        
        for (const symbol of symbols) {
            let symbolNameToMatch = symbol.name;
            
            // For method symbols, extract just the method name before the opening parenthesis
            if (symbol.kind === vscode.SymbolKind.Method) {
                const parenIndex = symbol.name.indexOf('(');
                symbolNameToMatch = parenIndex !== -1 ? symbol.name.substring(0, parenIndex) : symbol.name;
            }
            
            // Check for exact match first
            if (symbolNameToMatch === targetName) {
                console.log(`Found matching symbol: ${symbol.name} (matched as ${symbolNameToMatch}), kind: ${symbol.kind}, has children: ${symbol.children?.length || 0}`);
                
                // If this is the last part of the path, we found our target
                if (currentIndex === pathParts.length - 1) {
                    return symbol;
                }
                
                // Otherwise, continue searching in children
                if (symbol.children && symbol.children.length > 0) {
                    const result = this.findSymbolRecursive(symbol.children, pathParts, currentIndex + 1);
                    if (result) {
                        return result;
                    }
                }
            }
            
            // For namespace symbols, check if the symbol name matches multiple path parts
            // This handles cases like "Name.Space.You.Are" where the namespace contains dots
            if (symbol.kind === vscode.SymbolKind.Namespace && symbolNameToMatch.includes('.') && symbolNameToMatch.startsWith(targetName)) {
                const remainingPath = pathParts.slice(currentIndex).join('.');
                if (remainingPath.startsWith(symbolNameToMatch)) {
                    console.log(`Found namespace symbol with dots: ${symbol.name}, matching start of path: ${remainingPath}`);
                    
                    // Calculate how many path parts this namespace symbol consumes
                    const namespaceParts = symbolNameToMatch.split('.');
                    const newIndex = currentIndex + namespaceParts.length;
                    
                    // If this namespace consumes all remaining path parts, we found our target
                    if (newIndex === pathParts.length) {
                        return symbol;
                    }
                    
                    // Otherwise, continue searching in children with the updated index
                    if (symbol.children && symbol.children.length > 0 && newIndex < pathParts.length) {
                        const result = this.findSymbolRecursive(symbol.children, pathParts, newIndex);
                        if (result) {
                            return result;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Create a code lens for the given symbol and tests
     */
    private createCodeLens(symbol: vscode.DocumentSymbol, tests: TestAdaptor[], _document: vscode.TextDocument): vscode.CodeLens | null {
        // Use the symbol's selection range for better positioning
        const range = symbol.selectionRange;
        
        // Create code lens with test information
        const codeLens = new vscode.CodeLens(range);
        codeLens.command = {
            title: this.getCodeLensTitle(tests),
            command: 'unitycode.runTests',
            arguments: [tests.map(t => t.FullName)]
        };
        
        return codeLens;
    }

    /**
     * Get the title for the code lens based on test results
     */
    private getCodeLensTitle(tests: TestAdaptor[]): string {
        if (tests.length === 0) {
            return '';
        }

        const testCount = tests.length;
        let passedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let inconclusiveCount = 0;
        let noResultCount = 0;

        for (const test of tests) {
            const result = this.testResults.get(test.FullName);
            if (result === undefined) {
                noResultCount++;
            } else {
                switch (result) {
                    case TestStatusAdaptor.Passed:
                        passedCount++;
                        break;
                    case TestStatusAdaptor.Failed:
                        failedCount++;
                        break;
                    case TestStatusAdaptor.Skipped:
                        skippedCount++;
                        break;
                    case TestStatusAdaptor.Inconclusive:
                        inconclusiveCount++;
                        break;
                }
            }
        }

        // Build status string
        const statusParts: string[] = [];
        if (passedCount > 0) statusParts.push(`✅ ${passedCount}`);
        if (failedCount > 0) statusParts.push(`❌ ${failedCount}`);
        if (skippedCount > 0) statusParts.push(`⏭️ ${skippedCount}`);
        if (inconclusiveCount > 0) statusParts.push(`❓ ${inconclusiveCount}`);
        if (noResultCount > 0) statusParts.push(`⚪ ${noResultCount}`);

        const statusText = statusParts.length > 0 ? ` (${statusParts.join(' ')})` : '';
        const testText = testCount === 1 ? 'test' : 'tests';
        
        // Show running indicator when tests are executing
        if (this.isRunning) {
            return `⏳ Running ${testCount} ${testText}${statusText}`;
        }
        
        return `▶️ Run ${testCount} ${testText}${statusText}`;
    }

    /**
     * Helper method to combine path components
     */
    private combinePath(basePath: string, name: string): string {
        return basePath ? `${basePath}.${name}` : name;
    }

    /**
     * Check if a symbol represents a type (class, interface, struct, or enum)
     */
    private isTypeSymbol(symbol: vscode.DocumentSymbol): boolean {
        return symbol.kind === vscode.SymbolKind.Class ||
               symbol.kind === vscode.SymbolKind.Interface ||
               symbol.kind === vscode.SymbolKind.Struct ||
               symbol.kind === vscode.SymbolKind.Enum;
    }

    /**
     * Dispose the test provider
     */
    dispose(): void {
        this.onDidChangeCodeLensesEmitter.dispose();
        this.messagingClient.dispose();
        this.testController.dispose();
    }
}