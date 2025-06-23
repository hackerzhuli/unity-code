import * as dgram from 'dgram';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from './eventEmitter.js';

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
 * Active Unity detector that communicates with native binary via UDP
 * Monitors Unity Editor state and emits events when state changes
 */
export class UnityDetector {
    private nativeBinary: ChildProcess | null = null;
    private udpClient: dgram.Socket | null = null;
    private port: number = 0;
    private isConnected: boolean = false;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private currentState: ProcessState = { UnityProcessId: 0, IsHotReloadEnabled: false };
    private projectPath: string;
    private extensionRoot: string;
    
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
    
    constructor(projectPath: string, extensionRoot: string) {
        this.projectPath = projectPath;
        this.extensionRoot = extensionRoot;
        this.port = 50000 + (process.pid % 1000);
    }
    
    /**
     * Start the Unity detector
     * Launches native binary and establishes UDP connection
     */
    public async start(): Promise<void> {
        console.log('UnityDetector: Starting Unity detection...');
        
        // Only support Windows for now
        if (os.platform() !== 'win32') {
            console.log('UnityDetector: Non-Windows platform detected, Unity detection disabled');
            return;
        }
        
        try {
            await this.startNativeBinary();
            await this.connectUdp();
            this.startKeepAlive();
            
            // Request initial state
            await this.requestUnityState();
            
            console.log('UnityDetector: Successfully started Unity detection');
        } catch (error) {
            console.error('UnityDetector: Failed to start:', error);
            await this.stop();
            throw error;
        }
    }
    
    /**
     * Stop the Unity detector
     * Closes UDP connection and terminates native binary
     */
    public stop() {
        console.log('UnityDetector: Stopping Unity detection...');
        
        this.stopKeepAlive();
        this.closeUdp();
        this.stopNativeBinary();
        
        console.log('UnityDetector: Unity detection stopped');
    }
    
    /**
     * Request current Unity state from native binary
     */
    public async requestUnityState(): Promise<void> {
        if (!this.isConnected) {
            throw new Error('Not connected to native binary');
        }
        
        await this.sendMessage(MessageType.GetUnityState, '');
    }
    
    /**
     * Start the native binary process
     */
    private async startNativeBinary(): Promise<void> {
        const binaryPath = this.getNativeBinaryPath();
        
        console.log(`UnityDetector: Starting native binary: ${binaryPath}`);
        
        this.nativeBinary = spawn(binaryPath, [this.projectPath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        this.nativeBinary.on('error', (error) => {
            console.error('UnityDetector: Native binary error:', error);
        });
        
        this.nativeBinary.on('exit', (code) => {
            console.log(`UnityDetector: Native binary exited with code ${code}`);
            this.nativeBinary = null;
        });
        
        // Give the binary time to start
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    /**
     * Stop the native binary process
     */
    private stopNativeBinary() {
        if (this.nativeBinary) {
            this.nativeBinary.kill();
            this.nativeBinary = null;
        }
    }
    
    /**
     * Get the path to the native binary
     */
    private getNativeBinaryPath(): string {
        // Use the provided extension root path
        return path.join(this.extensionRoot, 'bin', 'win_64', 'unity_code_native.exe');
    }
    
    /**
     * Connect to the native binary via UDP
     */
    private async connectUdp(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.udpClient = dgram.createSocket('udp4');
            
            this.udpClient.on('message', (msg) => {
                this.handleMessage(msg);
            });
            
            this.udpClient.on('error', (error) => {
                console.error('UnityDetector: UDP error:', error);
                reject(error);
            });
            
            this.udpClient.bind(() => {
                this.isConnected = true;
                console.log(`UnityDetector: UDP client connected on port ${this.port}`);
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
            this.isConnected = false;
        }
    }
    
    /**
     * Start keep-alive mechanism
     */
    private startKeepAlive(): void {
        this.keepAliveInterval = setInterval(async () => {
            try {
                await this.sendMessage(MessageType.None, '');
            } catch (error) {
                console.error('UnityDetector: Keep-alive failed:', error);
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
     * Send message to native binary
     */
    private async sendMessage(messageType: MessageType, payload: string): Promise<void> {
        if (!this.udpClient || !this.isConnected) {
            throw new Error('UDP client not connected');
        }
        
        const payloadBuffer = Buffer.from(payload, 'utf8');
        const messageBuffer = Buffer.allocUnsafe(5 + payloadBuffer.length);
        
        // Message format: 1 byte type + 4 bytes length (little endian) + payload
        messageBuffer.writeUInt8(messageType, 0);
        messageBuffer.writeUInt32LE(payloadBuffer.length, 1);
        payloadBuffer.copy(messageBuffer, 5);
        
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
     * Handle incoming message from native binary
     */
    private handleMessage(buffer: Buffer): void {
        if (buffer.length < 5) {
            console.error('UnityDetector: Invalid message length');
            return;
        }
        
        const messageType = buffer.readUInt8(0);
        const payloadLength = buffer.readUInt32LE(1);
        
        if (buffer.length < 5 + payloadLength) {
            console.error('UnityDetector: Message payload length mismatch');
            return;
        }
        
        const payload = buffer.subarray(5, 5 + payloadLength).toString('utf8');
        
        switch (messageType) {
            case MessageType.GetUnityState:
                this.handleUnityStateMessage(payload);
                break;
            case MessageType.None:
                // Keep-alive response, no action needed
                break;
            default:
                console.warn(`UnityDetector: Unknown message type: ${messageType}`);
        }
    }
    
    /**
     * Handle Unity state message
     */
    private handleUnityStateMessage(payload: string): void {
        try {
            const newState: ProcessState = JSON.parse(payload);
            const previousState = { ...this.currentState };
            this.currentState = newState;
            
            // Check if state changed
            const stateChanged = 
                previousState.UnityProcessId !== newState.UnityProcessId ||
                previousState.IsHotReloadEnabled !== newState.IsHotReloadEnabled;
            
            if (stateChanged) {
                console.log(`UnityDetector: Unity state changed - PID: ${newState.UnityProcessId}, Hot Reload: ${newState.IsHotReloadEnabled}`);
                
                const eventData: UnityDetectionEvent = {
                    isRunning: newState.UnityProcessId > 0,
                    processId: newState.UnityProcessId > 0 ? newState.UnityProcessId : undefined,
                    isHotReloadEnabled: newState.IsHotReloadEnabled
                };
                
                this.onUnityStateChanged.emit(eventData);
            }
        } catch (error) {
            console.error('UnityDetector: Failed to parse Unity state message:', error);
        }
    }
}
