import * as vscode from 'vscode';
import * as dgram from 'dgram';
import { spawn, ChildProcess } from 'child_process';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { EventEmitter } from './eventEmitter';
import { NativeBinaryLocator } from './nativeBinaryLocator';
import { wait } from './asyncUtils';

/**
 * Message types for native messaging protocol
 */
enum MessageType {
    None = 0,
    GetUnityState = 1
}

/**
 * Unity process state from native binary
 */
interface ProcessState {
    UnityProcessId: number; // 0 if Unity is not running
    IsHotReloadEnabled: boolean;
}

/**
 * Unity detection event data
 */
export interface UnityDetectionEvent {
    isRunning: boolean;
    processId?: number;
    isHotReloadEnabled?: boolean;
}

/**
 * Unified Unity Binary Manager
 * Manages a single unity_code_native process that provides both:
 * 1. Unity Editor detection via UDP
 * 2. Language Server Protocol support
 */
export class UnityBinaryManager {
    // Binary process management
    private nativeBinary: ChildProcess | null = null;
    private nativeBinaryLocator: NativeBinaryLocator;
    private projectPath: string;
    private isStarted: boolean = false;

    // UDP detection functionality
    private udpClient: dgram.Socket | null = null;
    private port: number = 0;
    private isUdpConnected: boolean = false;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private currentState: ProcessState = { UnityProcessId: 0, IsHotReloadEnabled: false };
    private nextRequestId: number = 1;
    private pendingRequests: Map<number, { resolve: (value: ProcessState | null) => void; timeout: NodeJS.Timeout }> = new Map();

    // Language server functionality
    private languageClient: LanguageClient | null = null;
    private isLanguageServerStarted: boolean = false;

    /**
     * Constructor
     * @param projectPath Path to Unity project
     * @param nativeBinaryLocator Native binary locator instance
     */
    constructor(projectPath: string, nativeBinaryLocator: NativeBinaryLocator) {
        this.projectPath = projectPath;
        this.nativeBinaryLocator = nativeBinaryLocator;
    }

    // Event emitter for Unity detection state changes
    public readonly onUnityStateChanged = new EventEmitter<UnityDetectionEvent>();

    /**
     * Current Unity process ID (0 if not running)
     */
    public get unityProcessId(): number {
        return this.currentState.UnityProcessId;
    }

    /**
     * Whether Unity Editor is currently running
     */
    public get isUnityRunning(): boolean {
        return this.currentState.UnityProcessId > 0;
    }

    /**
     * Whether Hot Reload for Unity is enabled
     */
    public get isHotReloadEnabled(): boolean {
        return this.currentState.IsHotReloadEnabled;
    }

    /**
     * Check if the language server is running
     */
    public get isLanguageServerRunning(): boolean {
        return this.isLanguageServerStarted && this.languageClient !== null;
    }

    /**
     * Get the underlying language client instance
     */
    public get client(): LanguageClient | null {
        return this.languageClient;
    }

    /**
     * Start the unified Unity binary manager
     * Launches a single binary process with both UDP and LSP capabilities
     */
    public async start(): Promise<void> {
        if (this.isStarted) {
            console.log('UnityBinaryManager: Already started');
            return;
        }

        // Check if unity_code_native binary exists
        const binaryPath = this.nativeBinaryLocator.getUnityCodeNativePath();
        if (!binaryPath) {
            console.log('UnityBinaryManager: unity_code_native binary not found, Unity features disabled');
            return;
        }

        try {
            console.log('UnityBinaryManager: Starting unified Unity binary...');

            // Start the binary process with both UDP and LSP support
            await this.startNativeBinary();
            
            // Initialize UDP detection
            await this.initializeUdpDetection();
            
            // Initialize language server
            await this.initializeLanguageServer();

            this.isStarted = true;
            console.log('UnityBinaryManager: Successfully started unified Unity binary');
        } catch (error) {
            console.error('UnityBinaryManager: Failed to start:', error);
            this.stop();
            throw error;
        }
    }

    /**
     * Stop the unified Unity binary manager
     */
    public async stop(): Promise<void> {
        if (!this.isStarted) {
            return;
        }

        console.log('UnityBinaryManager: Stopping unified Unity binary...');

        // Stop language server
        await this.stopLanguageServer();
        
        // Stop UDP detection
        this.stopUdpDetection();
        
        // Stop binary process
        this.stopNativeBinary();

        this.isStarted = false;
        console.log('UnityBinaryManager: Unified Unity binary stopped');
    }

    /**
     * Request current Unity state from native binary
     * @param timeoutMs Timeout in milliseconds (default: 1000ms)
     * @returns Promise that resolves to ProcessState or null if timeout
     */
    public async requestUnityState(timeoutMs: number = 1000): Promise<ProcessState | null> {
        if (!this.isUdpConnected) {
            throw new Error('UDP not connected to native binary');
        }

        const requestId = this.nextRequestId++;

        return new Promise<ProcessState | null>((resolve) => {
            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve(null);
            }, timeoutMs);

            // Store the pending request
            this.pendingRequests.set(requestId, { resolve, timeout });

            // Send the request
            this.sendUdpMessage(MessageType.GetUnityState, '', requestId).catch(() => {
                // If sending fails, clean up and resolve with null
                this.pendingRequests.delete(requestId);
                clearTimeout(timeout);
                resolve(null);
            });
        });
    }

    /**
     * Dispose of the binary manager
     */
    public dispose(): void {
        this.stop();
    }

    /**
     * Start the native binary process with both UDP and LSP support
     */
    private async startNativeBinary(): Promise<void> {
        const binaryPath = this.nativeBinaryLocator.getUnityCodeNativePath();

        if (!binaryPath) {
            throw new Error('unity_code_native binary not found');
        }

        console.log(`UnityBinaryManager: Starting native binary: ${binaryPath}`);

        // Start binary with both UDP detection and language server capabilities
        this.nativeBinary = spawn(binaryPath, [this.projectPath, '--dual-mode'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.port = 50000 + (this.nativeBinary.pid ?? 0) % 1000;

        this.nativeBinary.on('error', (error) => {
            console.error('UnityBinaryManager: Native binary error:', error);
        });

        this.nativeBinary.on('exit', (code) => {
            console.log(`UnityBinaryManager: Native binary exited with code ${code}`);
            this.nativeBinary = null;
        });

        // Give the binary time to start
        await wait(1000);
    }

    /**
     * Stop the native binary process
     */
    private stopNativeBinary(): void {
        if (this.nativeBinary) {
            this.nativeBinary.kill();
            this.nativeBinary = null;
        }
    }

    /**
     * Initialize UDP detection functionality
     */
    private async initializeUdpDetection(): Promise<void> {
        await this.connectUdp();
        this.startKeepAlive();
        
        // Request initial state
        await this.requestUnityState();
    }

    /**
     * Stop UDP detection functionality
     */
    private stopUdpDetection(): void {
        this.stopKeepAlive();
        this.cleanupPendingRequests();
        this.closeUdp();
    }

    /**
     * Initialize language server functionality
     */
    private async initializeLanguageServer(): Promise<void> {
        if (!this.nativeBinary) {
            throw new Error('Native binary not started');
        }

        try {
            console.log('UnityBinaryManager: Initializing language server...');

            // Configure server options to use the existing binary process
            const serverOptions: ServerOptions = {
                command: this.nativeBinaryLocator.getUnityCodeNativePath()!,
                args: [this.projectPath, '--language-server'],
                transport: TransportKind.stdio
            };

            // Configure client options
            const clientOptions: LanguageClientOptions = {
                // Register the server for C# documents
                documentSelector: [
                    { scheme: 'file', language: 'csharp' }
                ],
                synchronize: {
                    // Notify the server about file changes to C# files
                    fileEvents: vscode.workspace.createFileSystemWatcher('**/*.cs')
                },
                outputChannelName: 'Unity Language Server',
                // Additional client options
                initializationOptions: {
                    projectPath: this.projectPath
                }
            };

            // Create the language client
            this.languageClient = new LanguageClient(
                'unity-language-server',
                'Unity Language Server',
                serverOptions,
                clientOptions
            );

            // Start the language client
            await this.languageClient.start();
            this.isLanguageServerStarted = true;

            console.log('UnityBinaryManager: Language server initialized successfully');
        } catch (error) {
            console.error('UnityBinaryManager: Failed to initialize language server:', error);
            this.languageClient = null;
            throw error;
        }
    }

    /**
     * Stop language server functionality
     */
    private async stopLanguageServer(): Promise<void> {
        if (!this.languageClient || !this.isLanguageServerStarted) {
            return;
        }

        try {
            console.log('UnityBinaryManager: Stopping language server...');
            await this.languageClient.stop();
            this.languageClient = null;
            this.isLanguageServerStarted = false;
            console.log('UnityBinaryManager: Language server stopped');
        } catch (error) {
            console.error('UnityBinaryManager: Error stopping language server:', error);
        }
    }

    /**
     * Connect to the native binary via UDP
     */
    private async connectUdp(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.udpClient = dgram.createSocket('udp4');

            this.udpClient.on('message', (msg) => {
                this.handleUdpMessage(msg);
            });

            this.udpClient.on('error', (error) => {
                console.error('UnityBinaryManager: UDP error:', error);
                reject(error);
            });

            this.udpClient.bind(() => {
                this.isUdpConnected = true;
                console.log(`UnityBinaryManager: UDP client connected on port ${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Close UDP connection
     */
    private closeUdp(): void {
        if (this.udpClient) {
            this.udpClient.close();
            this.udpClient = null;
            this.isUdpConnected = false;
        }
    }

    /**
     * Start keep-alive mechanism
     */
    private startKeepAlive(): void {
        this.keepAliveInterval = setInterval(async () => {
            try {
                await this.sendUdpMessage(MessageType.None, '');
            } catch (error) {
                console.error('UnityBinaryManager: Keep-alive failed:', error);
            }
        }, 25000); // Send every 25 seconds (before 30 second timeout)
    }

    /**
     * Stop keep-alive mechanism
     */
    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    /**
     * Clean up all pending requests
     */
    private cleanupPendingRequests(): void {
        for (const [_requestId, pendingRequest] of this.pendingRequests) {
            clearTimeout(pendingRequest.timeout);
            pendingRequest.resolve(null);
        }
        this.pendingRequests.clear();
    }

    /**
     * Send UDP message to native binary
     */
    private async sendUdpMessage(messageType: MessageType, payload: string, requestId: number = 0): Promise<void> {
        if (!this.udpClient || !this.isUdpConnected) {
            throw new Error('UDP client not connected');
        }

        const payloadBuffer = Buffer.from(payload, 'utf8');
        const messageBuffer = Buffer.allocUnsafe(9 + payloadBuffer.length);

        // Message format: 1 byte type + 4 bytes request id + 4 bytes length (little endian) + payload
        messageBuffer.writeUInt8(messageType, 0);
        messageBuffer.writeUInt32LE(requestId, 1);
        messageBuffer.writeUInt32LE(payloadBuffer.length, 5);
        payloadBuffer.copy(messageBuffer, 9);

        return new Promise((resolve, reject) => {
            this.udpClient!.send(messageBuffer, this.port, 'localhost', (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Handle incoming UDP message from native binary
     */
    private handleUdpMessage(buffer: Buffer): void {
        if (buffer.length < 9) {
            console.error('UnityBinaryManager: Invalid message length');
            return;
        }

        const messageType = buffer.readUInt8(0);
        const requestId = buffer.readUInt32LE(1);
        const payloadLength = buffer.readUInt32LE(5);

        if (buffer.length < 9 + payloadLength) {
            console.error('UnityBinaryManager: Message payload length mismatch');
            return;
        }

        const payload = buffer.subarray(9, 9 + payloadLength).toString('utf8');

        switch (messageType) {
            case MessageType.GetUnityState:
                this.handleUnityStateMessage(payload, requestId);
                break;
            case MessageType.None:
                // Keep-alive response, no action needed
                break;
            default:
                console.warn(`UnityBinaryManager: Unknown message type: ${messageType}`);
        }
    }

    /**
     * Handle Unity state message
     */
    private handleUnityStateMessage(payload: string, requestId: number): void {
        try {
            const newState: ProcessState = JSON.parse(payload);
            const previousState = { ...this.currentState };
            this.currentState = newState;

            // If this is a response to a pending request, resolve it
            if (requestId > 0 && this.pendingRequests.has(requestId)) {
                const pendingRequest = this.pendingRequests.get(requestId)!;
                clearTimeout(pendingRequest.timeout);
                this.pendingRequests.delete(requestId);
                pendingRequest.resolve(newState);
            }

            // Check if state changed
            const stateChanged =
                previousState.UnityProcessId !== newState.UnityProcessId ||
                previousState.IsHotReloadEnabled !== newState.IsHotReloadEnabled;

            if (stateChanged) {
                console.log(`UnityBinaryManager: Unity state changed - PID: ${newState.UnityProcessId}, Hot Reload: ${newState.IsHotReloadEnabled}`);

                const eventData: UnityDetectionEvent = {
                    isRunning: newState.UnityProcessId > 0,
                    processId: newState.UnityProcessId > 0 ? newState.UnityProcessId : undefined,
                    isHotReloadEnabled: newState.IsHotReloadEnabled
                };

                this.onUnityStateChanged.emit(eventData);
            }
        } catch (error) {
            console.error('UnityBinaryManager: Failed to parse Unity state message:', error);

            // If this was a response to a pending request, resolve with null
            if (requestId > 0 && this.pendingRequests.has(requestId)) {
                const pendingRequest = this.pendingRequests.get(requestId)!;
                clearTimeout(pendingRequest.timeout);
                this.pendingRequests.delete(requestId);
                pendingRequest.resolve(null);
            }
        }
    }
}