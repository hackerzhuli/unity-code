import * as vscode from 'vscode';
import { UnityMessagingClient, MessageType, TestAdaptorContainer, TestResultAdaptorContainer, TestStatusAdaptor, TestResultAdaptor } from './unityMessagingClient.js';

/**
 * Unity Test Provider for VS Code Testing API
 * Manages test discovery, execution, and result reporting
 */
export class UnityTestProvider {
    private testController: vscode.TestController;
    public messagingClient: UnityMessagingClient; // Made public for auto-refresh access
    private testData = new WeakMap<vscode.TestItem, { id: string; fullName: string; testMode: 'EditMode' | 'PlayMode' }>();
    private runProfile: vscode.TestRunProfile;
    private debugProfile: vscode.TestRunProfile;
    private currentTestRun: vscode.TestRun | null = null;

    constructor(context: vscode.ExtensionContext, unityProjectPath?: string) {
        this.testController = vscode.tests.createTestController('unityTests', 'Unity Tests');
        
        this.messagingClient = new UnityMessagingClient(unityProjectPath);
        
        // Register test controller
        context.subscriptions.push(this.testController);
        
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
        
        // Auto-discover tests when provider is created
        this.discoverTests();
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
        });

        this.messagingClient.onMessage(MessageType.RunFinished, () => {
            // Test run finished in Unity
            if (this.currentTestRun) {
                this.currentTestRun.end();
                this.currentTestRun = null;
            }
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
        try {
            console.log('UnityCode: Starting test discovery...');
            
            // Connect to Unity if not already connected
            if (!this.messagingClient.connected) {
                console.log('UnityCode: Not connected, attempting to connect to Unity...');
                const connected = await this.messagingClient.connect();
                if (!connected) {
                    console.error('UnityCode: Failed to connect to Unity Editor');
                    vscode.window.showWarningMessage('UnityCode: Could not connect to Unity Editor. Make sure Unity is running.');
                    return;
                }
                console.log('UnityCode: Successfully connected to Unity');
            } else {
                console.log('UnityCode: Already connected to Unity');
            }

            // Request test lists for both modes
            console.log('UnityCode: Requesting EditMode test list...');
            await this.messagingClient.requestTestList('EditMode');
            console.log('UnityCode: Requesting PlayMode test list...');
            await this.messagingClient.requestTestList('PlayMode');
            console.log('UnityCode: Test list requests sent, waiting for responses...');
            
        } catch (error) {
            console.error('UnityCode: Error discovering tests:', error);
            vscode.window.showErrorMessage(`UnityCode: Failed to discover tests: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle test list retrieved from Unity
     */
    private handleTestListRetrieved(value: string): void {
        try {
            console.log(`UnityCode: Received test list data: ${value}`);
            
            const colonIndex = value.indexOf(':');
            if (colonIndex === -1) {
                console.error('UnityCode: Invalid test list format - no colon separator found');
                console.error(`UnityCode: Raw value received: "${value}"`);
                return;
            }

            const testMode = value.substring(0, colonIndex) as 'EditMode' | 'PlayMode';
            const jsonData = value.substring(colonIndex + 1);
            
            console.log(`UnityCode: Test mode: ${testMode}`);
            console.log(`UnityCode: JSON data: ${jsonData}`);
            
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
     * Run tests
     */
    private async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (!this.messagingClient.connected) {
            const connected = await this.messagingClient.connect();
            if (!connected) {
                vscode.window.showErrorMessage('UnityCode: Could not connect to Unity Editor');
                return;
            }
        }

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
    private findTestByFullName(fullName: string): vscode.TestItem | null {
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
     * Dispose the test provider
     */
    dispose(): void {
        this.messagingClient.disconnect();
        this.testController.dispose();
    }
}