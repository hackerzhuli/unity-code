import * as vscode from 'vscode';
import { NativeBinaryLocator } from './nativeBinaryLocator';
import { logWithLimit } from './utils';

/**
 * Debug configuration provider for Unity projects
 * Handles the configuration and setup of the MonoDebugger for Unity debugging
 */
export class MonoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private nativeBinaryLocator: NativeBinaryLocator;
    
    constructor(extensionContext: vscode.ExtensionContext) {
        this.nativeBinaryLocator = new NativeBinaryLocator(extensionContext.extensionPath);
    }
    
    /**
     * Resolves debug configuration for Unity projects
     * @param folder The workspace folder
     * @param config The debug configuration
     * @param token Cancellation token
     * @returns Resolved debug configuration or undefined if not applicable
     */
    async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | undefined> {
        
        // Check if MonoDebugger binary exists
        const debuggerPath = this.nativeBinaryLocator.getMonoDebuggerPath();
        if (!debuggerPath) {
            vscode.window.showErrorMessage('MonoDebugger binary not found for this platform. Please ensure the extension is properly installed.');
            return undefined;
        }
        
        // Set default configuration if empty
        if (!config.type && !config.request && !config.name) {
            config.name = 'Unity Debugger';
            config.type = 'unity-code';
            config.request = 'attach';
        }
        
        // Set working directory to workspace folder if not specified
        if (!config.cwd && folder) {
            config.cwd = folder.uri.fsPath;
        }
        
        // Set debugger path
        config.debuggerPath = debuggerPath;
        
        logWithLimit(`Unity debugger configuration resolved: ${JSON.stringify(config, null, 2)}`);
        
        return MonoDebugConfigurationProvider.provideDebuggerOptions(config);
    }
    
    /**
     * Provides debugger options with default settings
     * @param options The debug configuration options
     * @returns Enhanced debug configuration with debugger options
     */
    private static provideDebuggerOptions(options: vscode.DebugConfiguration): vscode.DebugConfiguration {
        if (options.debuggerOptions === undefined) {
            options.debuggerOptions = {
                evaluationOptions: {
                    evaluationTimeout: 1000,
                    memberEvaluationTimeout: 5000,
                    allowTargetInvoke: true,
                    allowMethodEvaluation: true,
                    allowToStringCalls: true,
                    flattenHierarchy: false,
                    groupPrivateMembers: true,
                    groupStaticMembers: true,
                    useExternalTypeResolver: true,
                    integerDisplayFormat: 'Decimal',
                    currentExceptionTag: '$exception',
                    ellipsizeStrings: true,
                    ellipsizedLength: 260,
                    stackFrameFormat: {
                        module: true,
                        parameterTypes: false,
                        parameterValues: false,
                        parameterNames: false,
                        language: false,
                        line: false
                    },
                },
                stepOverPropertiesAndOperators: MonoDebugConfigurationProvider.getSetting('unity-code.debugger.stepOverPropertiesAndOperators', true),
                automaticSourceLinkDownload: "never",
                skipNativeTransitions: true,
            };
        }
        
        // Set transport ID for external type resolver
        options.transportId = `dotrush-${process.pid}`;
        
        return options;
    }
    
    /**
     * Gets a configuration setting with a default value
     * @param key The configuration key
     * @param defaultValue The default value if setting is not found
     * @returns The configuration value or default
     */
    private static getSetting<T>(key: string, defaultValue: T): T {
        const config = vscode.workspace.getConfiguration();
        return config.get<T>(key, defaultValue);
    }
}

/**
 * Debug adapter descriptor factory for Unity debugging
 */
export class MonoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    private nativeBinaryLocator: NativeBinaryLocator;
    
    constructor(extensionContext: vscode.ExtensionContext) {
        this.nativeBinaryLocator = new NativeBinaryLocator(extensionContext.extensionPath);
    }
    
    /**
     * Creates a debug adapter descriptor
     * @param session The debug session
     * @param executable The executable information
     * @returns Debug adapter descriptor or undefined
     */
    createDebugAdapterDescriptor(
        _session: vscode.DebugSession,
        _executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        
        const debuggerPath = this.nativeBinaryLocator.getMonoDebuggerPath();
        if (!debuggerPath) {
            vscode.window.showErrorMessage('MonoDebugger binary not found.');
            return undefined;
        }
        
        logWithLimit(`Creating debug adapter descriptor with debugger path: ${debuggerPath}`);

        return new vscode.DebugAdapterExecutable(debuggerPath, []);
    }
}

/**
 * Unity Debugger Manager
 * Handles the registration and management of Unity debugging capabilities
 */
export class UnityDebuggerManager {
    private configurationProvider: MonoDebugConfigurationProvider;
    private adapterDescriptorFactory: MonoDebugAdapterDescriptorFactory;
    private disposables: vscode.Disposable[] = [];
    
    constructor(extensionContext: vscode.ExtensionContext) {
        this.configurationProvider = new MonoDebugConfigurationProvider(extensionContext);
        this.adapterDescriptorFactory = new MonoDebugAdapterDescriptorFactory(extensionContext);
    }
    
    /**
     * Activates the Unity debugger by registering providers
     * @param context The extension context
     */
    public activate(context: vscode.ExtensionContext): void {
        // Register debug configuration provider
        const configProviderDisposable = vscode.debug.registerDebugConfigurationProvider(
            'unity-code',
            this.configurationProvider
        );
        
        // Register debug adapter descriptor factory
        const adapterFactoryDisposable = vscode.debug.registerDebugAdapterDescriptorFactory(
            'unity-code',
            this.adapterDescriptorFactory
        );
        
        this.disposables.push(configProviderDisposable, adapterFactoryDisposable);
        context.subscriptions.push(...this.disposables);
        
        logWithLimit('Unity debugger manager activated');
    }
    
    /**
     * Deactivates the Unity debugger by disposing resources
     */
    public deactivate(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
        logWithLimit('Unity debugger manager deactivated');
    }
    
    /**
     * Checks if Unity debugging is available on the current platform
     * @returns True if debugging is available, false otherwise
     */
    public isDebuggingAvailable(): boolean {
        return this.configurationProvider['nativeBinaryLocator'].getMonoDebuggerPath() !== undefined;
    }
}