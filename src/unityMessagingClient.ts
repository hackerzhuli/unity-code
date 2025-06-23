import * as dgram from 'dgram';
import * as net from 'net';
import { UnityDetector, UnityDetectionEvent } from './unityDetector.js';
import { logWithLimit } from './utils.js';
import { EventEmitter } from './eventEmitter.js';


/**
 * Unity Visual Studio Editor Messaging Protocol Client
 * Implements UDP-based communication with TCP fallback for large messages
 */

export enum MessageType {
    None = 0,
    Ping = 1,
    Pong = 2,
    Play = 3,
    Stop = 4,
    Pause = 5,
    Unpause = 6,
    Build = 7,
    Refresh = 8,
    Info = 9,
    Error = 10,
    Warning = 11,
    Open = 12,
    Opened = 13,
    Version = 14,
    UpdatePackage = 15,
    ProjectPath = 16,
    Tcp = 17,
    RunStarted = 18,
    RunFinished = 19,
    TestStarted = 20,
    TestFinished = 21,
    TestListRetrieved = 22,
    RetrieveTestList = 23,
    ExecuteTests = 24,
    ShowUsage = 25,
    CompilationFinished = 100,
    PackageName = 101,
    OnLine = 102,
    OffLine = 103
}

export interface UnityMessage {
    type: MessageType;
    value: string;
    origin?: string;
}

export interface TestAdaptor {
    Id: string;
    Name: string;
    FullName: string;
    Type: string;
    Method: string;
    Assembly: string;
    Parent: number;
}

export interface TestAdaptorContainer {
    TestAdaptors: TestAdaptor[];
}

export enum TestStatusAdaptor {
    Passed = 0,
    Skipped = 1,
    Inconclusive = 2,
    Failed = 3
}

export interface TestResultAdaptor {
    Name: string;
    FullName: string;
    PassCount: number;
    FailCount: number;
    InconclusiveCount: number;
    SkipCount: number;
    ResultState: string;
    StackTrace: string;
    TestStatus: TestStatusAdaptor;
    Parent: number;
}

export interface TestResultAdaptorContainer {
    TestResultAdaptors: TestResultAdaptor[];
}

/**
 * Unity Messaging Client - Manages communication with Unity Editor via UDP/TCP protocols.
 * 
 * ## Connection Management
 * 
 * This client uses a sophisticated connection management system that distinguishes between:
 * - **Process Connection**: Unity Editor process detected and UDP socket established
 * - **Message Readiness**: Unity confirmed ready to receive/respond to messages
 * 
 * ## Disconnect Detection Strategy
 * 
 * **Process Monitoring (Primary Method):**
 * - Continuously monitors the Unity Editor process (PID) after connection
 * - Detects actual Unity Editor shutdowns by checking if the process still exists
 * - Triggers immediate reconnection when process termination is detected
 * 
 * **Why NOT Timeout-Based Detection:**
 * - Unity can take minutes to respond during heavy operations (compilation, domain reload, etc.)
 * - Timeout-based detection would cause false disconnections during normal Unity operations
 * - Process monitoring provides accurate detection of actual Unity shutdowns
 * 
 * ## Connection States
 * 
 * 1. **Disconnected**: No Unity process detected, no socket connection
 * 2. **Connected**: Unity process found, socket established, initial ping sent (`isConnected = true`)
 * 3. **Online**: Unity responded with pong/OnLine message, ready for communication (`isUnityOnline = true`)
 * 4. **Offline**: Unity sent OffLine message, process still running but not accepting messages
 * 
 * ## Message Flow
 * 
 * - **Non-heartbeat messages** are queued when Unity is offline for reliability
 * - **Heartbeat messages** (Ping/Pong) are not queued to avoid interference with connection detection
 * - **All queued messages** are processed when Unity comes back online
 */
export class UnityMessagingClient {
    private socket: dgram.Socket | null = null;
    private unityPort: number = 0;
    private unityAddress: string = '127.0.0.1';
    private messageHandlers: Map<MessageType, (message: UnityMessage) => void> = new Map();

    /**
     * Indicates whether we have detected a Unity process and established a UDP socket connection.
     * This does NOT guarantee Unity is ready to receive messages - use isUnityOnline for that.
     * 
     * Connection flow:
     * 1. isConnected = true: Unity process detected, UDP socket bound, initial ping sent
     * 2. isUnityOnline = true: Unity responded with pong or OnLine message, ready for communication
     * 
     * @private
     */
    private isConnected: boolean = false;
    private isUnityOnline: boolean = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly UDP_BUFFER_SIZE = 8192;
    private readonly TCP_TIMEOUT = 5000;
    private packageName: string = '';
    private messageQueue: Array<{ type: MessageType; value: string; resolve: () => void; reject: (error: Error) => void }> = [];
    private readonly OFFICIAL_PACKAGE_HEARTBEAT = 3000; // 3 seconds for official package (4s timeout)
    private readonly CUSTOM_PACKAGE_HEARTBEAT = 30000; // 30 seconds for custom package (60s timeout)
    private readonly INITIAL_AGGRESSIVE_HEARTBEAT = 500; // 500ms for initial connection detection
    private currentHeartbeatInterval: number = this.INITIAL_AGGRESSIVE_HEARTBEAT;
    private initialHeartbeatTimeout: NodeJS.Timeout | null = null;
    private hasReceivedFirstResponse: boolean = false;
    
    private isDisposed: boolean = false;
    
    // Process monitoring for smart disconnection detection
    private connectedProcessId: number | null = null;
    
    // Unity detector for active monitoring
    private unityDetector: UnityDetector | null = null;
    
    // Connection status event - emits true for connected, false for disconnected
    public readonly onConnectionStatus = new EventEmitter<boolean>();
    
    // Online status event - emits true for online, false for offline
    public readonly onOnlineStatus = new EventEmitter<boolean>();

    constructor(unityDetector: UnityDetector) {
        this.unityDetector = unityDetector;
        this.setupSocket();
        
        if (this.unityDetector) {
            this.initializeUnityDetectorEvents();
        }
    }

    /**
     * Initialize Unity detector events for active monitoring
     */
    private async initializeUnityDetectorEvents(): Promise<void> {
        if (!this.unityDetector) {
            return;
        }
        
        try {
            // Subscribe to Unity state changes
            this.unityDetector.onUnityStateChanged.subscribe((event: UnityDetectionEvent) => {
                console.log(`UnityMessagingClient: Unity state changed - Running: ${event.isRunning}, PID: ${event.processId}, Hot Reload: ${event.isHotReloadEnabled}`);
                
                if (event.isRunning && event.processId) {
                    // Unity started or changed - attempt connection once
                    if (!this.isConnected || this.connectedProcessId !== event.processId) {
                        console.log(`UnityMessagingClient: New Unity process detected (PID: ${event.processId}), attempting connection`);
                        this.connectToUnity(event.processId);
                    }
                } else {
                    // Unity stopped - handle disconnection
                    if (this.isConnected) {
                        console.log('UnityMessagingClient: Unity process stopped, handling disconnection');
                        this.handleConnectionLoss();
                    }
                }
            });
            
            await this.unityDetector.start();
            console.log('UnityMessagingClient: Unity detector events initialized and started');
        } catch (error) {
            console.error('UnityMessagingClient: Failed to initialize Unity detector events:', error);
        }
    }

    /**
     * Calculate messaging port for a given Unity process ID
     */
    private calculatePortForProcess(processId: number): number {
        const port = 56002 + (processId % 1000);
        console.log(`UnityCode: Calculated port ${port} for process ID ${processId} (formula: 56001 + ${processId} % 1000 = 56001 + ${processId % 1000})`);
        return port;
    }

    /**
     * Connect to Unity with a specific process ID
     */
    private async connectToUnity(processId: number): Promise<void> {
        if (this.isDisposed || this.isConnected) {
            console.log(`UnityCode: Skipping connection attempt (isDisposed=${this.isDisposed}, isConnected=${this.isConnected})`);
            return;
        }
        
        console.log(`UnityCode: Attempting to connect to Unity process ${processId}`);
        
        try {
            const success = await this.connectInternal(processId);
            
            if (success) {
                console.log(`UnityCode: Successfully connected to Unity process ${processId}`);
            } else {
                console.log(`UnityCode: Failed to connect to Unity process ${processId}`);
            }
        } catch (error) {
            console.log(`UnityCode: Connection to Unity process ${processId} failed with error:`, error);
        }
    }

    /**
     * Setup UDP socket for communication
     */
    private setupSocket(): void {
        this.socket = dgram.createSocket('udp4');
        // Port will be set when we detect Unity process

        this.socket.on('message', (buffer: Buffer, rinfo: dgram.RemoteInfo) => {
            try {
                const message = this.deserializeMessage(buffer);
                message.origin = `${rinfo.address}:${rinfo.port}`;
                this.handleMessage(message);
            } catch (error) {
                console.error('UnityCode: Error deserializing message:', error);
            }
        });

        this.socket.on('error', (error: Error) => {
            console.error('UnityCode: Socket error:', error);
            this.handleConnectionLoss();
        });

        this.socket.on('close', () => {
            console.log('UnityCode: Socket closed');
            this.handleConnectionLoss();
        });
    }
    
    /**
     * Handle connection loss
     */
    private handleConnectionLoss(): void {
        const wasConnected = this.isConnected;
        const wasOnline = this.isUnityOnline;
        this.isConnected = false;
        this.isUnityOnline = false;
        this.connectedProcessId = null;
        this.hasReceivedFirstResponse = false;
        this.currentHeartbeatInterval = this.INITIAL_AGGRESSIVE_HEARTBEAT; // Reset to aggressive heartbeat for next connection
        this.stopHeartbeat();

        // Emit status change events
        if (wasConnected) {
            this.onConnectionStatus.emit(false);
        }
        if (wasOnline) {
            this.onOnlineStatus.emit(false);
        }
        
        console.log('UnityCode: Connection lost - waiting for Unity detection event to reconnect');
    }

    /**
     * Internal connection method
     */
    private async connectInternal(processId: number): Promise<boolean> {
        if (!this.socket) {
            console.log(`UnityCode: connectInternal: No socket available`);
            return false;
        }

        try {
            console.log(`UnityCode: connectInternal: Connecting to Unity process ${processId}`);
            
            // Store the connected process ID for monitoring
            this.connectedProcessId = processId;
            const activePort = this.calculatePortForProcess(this.connectedProcessId);

            // Update the port
            this.unityPort = activePort;

            // Set connected state before sending initial ping
            this.isConnected = true;
            console.log(`UnityCode: connectInternal: Connected to Unity process ${this.connectedProcessId} on port ${activePort}`);
            
            // Send initial ping to establish connection
            await this.sendMessageInternal(MessageType.Ping, '');
            
            // Unity online status will be determined by first pong or OnLine message
            this.isUnityOnline = false;
            this.hasReceivedFirstResponse = false;
            
            this.startHeartbeat();
            
            // Trigger connection event
            console.log(`UnityCode: connectInternal: Emitting connection event for new Unity connection`);
            this.onConnectionStatus.emit(true);
            
            return true;
        } catch (error) {
            console.log(`UnityCode: connectInternal: Failed with error:`, error);
            this.isConnected = false; // Reset connection state on failure
            this.connectedProcessId = null;
            return false;
        }
    }

    /**
     * Dispose the client and clean up all resources
     */
    dispose(): void {
        this.isDisposed = true;
        const wasConnected = this.isConnected;
        const wasOnline = this.isUnityOnline;
        this.isConnected = false;
        this.isUnityOnline = false;
        this.hasReceivedFirstResponse = false;
        
        // Emit status change events
        if (wasConnected) {
            this.onConnectionStatus.emit(false);
        }
        if (wasOnline) {
            this.onOnlineStatus.emit(false);
        }
        
        this.stopHeartbeat();

        // Clear message queue and reject pending messages
        this.messageQueue.forEach(queuedMessage => {
            queuedMessage.reject(new Error('Client disposed'));
        });
        
        this.messageQueue = [];
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    /**
     * Start heartbeat to keep connection alive
     */
    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && !this.isDisposed) {
                this.sendMessageInternal(MessageType.Ping, '').catch(() => {
                    this.handleConnectionLoss();
                });
            }
        }, this.currentHeartbeatInterval);
    }
    
    /**
     * Handle first response from Unity - request package name and switch to normal heartbeat
     */
    private handleFirstResponse(): void {
        if (!this.hasReceivedFirstResponse) {
            this.hasReceivedFirstResponse = true;
            console.log('UnityCode: First response received, requesting package name and switching to normal heartbeat');
            
            // Request package name now that Unity is responding
            this.sendMessageInternal(MessageType.PackageName, '').catch(error => {
                console.warn('UnityCode: Failed to request package name:', error);
            });
            
            // Switch to normal heartbeat after a delay
            this.scheduleNormalHeartbeat();
        }
    }
    
    /**
     * Schedule transition to normal heartbeat interval after initial aggressive period
     */
    private scheduleNormalHeartbeat(): void {
        if (this.initialHeartbeatTimeout) {
            clearTimeout(this.initialHeartbeatTimeout);
        }
        
        this.initialHeartbeatTimeout = setTimeout(() => {
            if (!this.isDisposed && this.hasReceivedFirstResponse) {
                console.log('UnityCode: Switching from aggressive to normal heartbeat interval');
                
                // Determine the correct heartbeat interval based on package (if known)
                const isCustomPackage = this.packageName === 'com.hackerzhuli.ide.visualstudio';
                const normalInterval = isCustomPackage ? this.CUSTOM_PACKAGE_HEARTBEAT : this.OFFICIAL_PACKAGE_HEARTBEAT;
                
                this.currentHeartbeatInterval = normalInterval;
                console.log(`UnityCode: Set heartbeat interval to ${normalInterval}ms for package '${this.packageName || 'unknown'}'`);
                
                // Restart heartbeat with normal interval
                if (this.heartbeatInterval) {
                    this.startHeartbeat();
                }
            }
        }, 2000); // Wait 2 seconds after first response before switching
    }

    /**
     * Update heartbeat interval based on detected package
     */
    private updateHeartbeatInterval(): void {
        // Only update heartbeat interval if we've already switched from aggressive mode
        if (!this.hasReceivedFirstResponse) {
            console.log(`UnityCode: Package detected (${this.packageName}) but still in aggressive heartbeat mode, will update later`);
            return;
        }
        
        const isCustomPackage = this.packageName === 'com.hackerzhuli.ide.visualstudio';
        const newInterval = isCustomPackage ? this.CUSTOM_PACKAGE_HEARTBEAT : this.OFFICIAL_PACKAGE_HEARTBEAT;
        
        if (newInterval !== this.currentHeartbeatInterval) {
            console.log(`UnityCode: Updating heartbeat interval from ${this.currentHeartbeatInterval}ms to ${newInterval}ms for package ${this.packageName}`);
            this.currentHeartbeatInterval = newInterval;
            
            // Restart heartbeat with new interval if currently running
            if (this.heartbeatInterval) {
                this.startHeartbeat();
            }
        }
    }

    /**
     * Process queued messages when Unity comes back online
     */
    private processMessageQueue(): void {
        if (this.messageQueue.length === 0) {
            return;
        }
        
        console.log(`UnityCode: Processing ${this.messageQueue.length} queued messages`);
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        
        queue.forEach(async (queuedMessage) => {
            try {
                await this.sendMessageInternal(queuedMessage.type, queuedMessage.value);
                queuedMessage.resolve();
            } catch (error) {
                queuedMessage.reject(error as Error);
            }
        });
    }

    /**
     * Stop heartbeat
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.initialHeartbeatTimeout) {
            clearTimeout(this.initialHeartbeatTimeout);
            this.initialHeartbeatTimeout = null;
        }
    }

    /**
     * Register message handler for specific message type
     */
    onMessage(type: MessageType, handler: (message: UnityMessage) => void): void {
        this.messageHandlers.set(type, handler);
    }

    /**
     * Handle incoming message
     */
    private handleMessage(message: UnityMessage): void {
        // Skip logging for ping/pong messages to reduce console noise
        if (message.type !== MessageType.Ping && message.type !== MessageType.Pong) {
            logWithLimit(`UnityCode: Received message - Type: ${message.type} (${MessageType[message.type] || 'Unknown'}), Value: "${message.value}", Origin: ${message.origin || 'unknown'}`);
        }
        
        // Handle Unity online/offline state changes
        let messageHandledInternally = false;
        
        if (message.type === MessageType.OnLine) {
            console.log('UnityCode: Unity online');
            this.isUnityOnline = true;
            this.onOnlineStatus.emit(true);
            this.processMessageQueue();
            this.handleFirstResponse();
            messageHandledInternally = true;
        } else if (message.type === MessageType.OffLine) {
            console.log('UnityCode: Unity went offline');
            this.isUnityOnline = false;
            this.onOnlineStatus.emit(false);
            messageHandledInternally = true;
        } else if (message.type === MessageType.Pong) {
            // Pong response indicates Unity is online and responding
            if (!this.isUnityOnline) {
                console.log('UnityCode: Unity online (pong received)');
                this.isUnityOnline = true;
                this.onOnlineStatus.emit(true);
                this.processMessageQueue();
            }
            this.handleFirstResponse();
            messageHandledInternally = true;
        } else if (message.type === MessageType.PackageName && message.value) {
            this.packageName = message.value;
            console.log(`UnityCode: Detected Unity package: ${this.packageName}`);
            this.updateHeartbeatInterval();
            messageHandledInternally = true;
        }
        
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message);
        } else if (!messageHandledInternally) {
            // Skip logging for ping/pong messages to reduce console noise
            if (message.type !== MessageType.Ping && message.type !== MessageType.Pong) {
                console.log(`UnityCode: No handler registered for message type ${message.type} (${MessageType[message.type] || 'Unknown'})`);
            }
        }

        // Handle TCP fallback messages
        if (message.type === MessageType.Tcp) {
            this.handleTcpMessage(message);
        }
    }

    /**
     * Handle TCP fallback message
     */
    private async handleTcpMessage(message: UnityMessage): Promise<void> {
        try {
            const [portStr, lengthStr] = message.value.split(':');
            const port = parseInt(portStr);
            const length = parseInt(lengthStr);

            if (isNaN(port) || isNaN(length)) {
                console.error('UnityCode: Invalid TCP message format');
                return;
            }

            const tcpMessage = await this.receiveTcpMessage(port, length);
            if (tcpMessage) {
                this.handleMessage(tcpMessage);
            }
        } catch (error) {
            console.error('UnityCode: Error handling TCP message:', error);
        }
    }

    /**
     * Receive large message via TCP
     */
    private async receiveTcpMessage(port: number, length: number): Promise<UnityMessage | null> {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            const buffer = Buffer.alloc(length);
            let bytesReceived = 0;

            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error('TCP receive timeout'));
            }, this.TCP_TIMEOUT);

            client.connect(port, this.unityAddress, () => {
                // Connected, wait for data
            });

            client.on('data', (data: Buffer) => {
                const bytesToCopy = Math.min(data.length, length - bytesReceived);
                data.copy(buffer, bytesReceived, 0, bytesToCopy);
                bytesReceived += bytesToCopy;

                if (bytesReceived >= length) {
                    clearTimeout(timeout);
                    client.destroy();
                    try {
                        const message = this.deserializeMessage(buffer);
                        resolve(message);
                    } catch (error) {
                        reject(error);
                    }
                }
            });

            client.on('error', (error: Error) => {
                clearTimeout(timeout);
                reject(error);
            });

            client.on('close', () => {
                clearTimeout(timeout);
                if (bytesReceived < length) {
                    reject(new Error('Connection closed before receiving complete message'));
                }
            });
        });
    }

    /**
     * Send message to Unity
     */
    async sendMessage(type: MessageType, value: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            throw new Error('Not connected to Unity');
        }

        // Queue all non-heartbeat messages when Unity is offline for reliability
        const isHeartbeatMessage = type === MessageType.Ping || type === MessageType.Pong;
        
        if (!this.isUnityOnline && !isHeartbeatMessage) {
            console.log(`UnityCode: Unity is offline, queuing message - Type: ${type} (${MessageType[type]}), Value: "${value}"`);
            return new Promise((resolve, reject) => {
                this.messageQueue.push({ type, value, resolve, reject });
            });
        }

        return this.sendMessageInternal(type, value);
    }

    /**
     * Internal method to actually send message to Unity
     */
    private async sendMessageInternal(type: MessageType, value: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            throw new Error('Not connected to Unity');
        }

        const buffer = this.serializeMessage({ type, value });
        // Skip logging for ping/pong messages to reduce console noise
        if (type !== MessageType.Ping && type !== MessageType.Pong) {
            logWithLimit(`UnityCode: Sending message - Type: ${type} (${MessageType[type]}), Value: "${value}", Size: ${buffer.length} bytes, Target: ${this.unityAddress}:${this.unityPort}`);
        }

        // Check if message is too large for UDP
        if (buffer.length >= this.UDP_BUFFER_SIZE) {
            console.log(`UnityCode: Message too large for UDP (${buffer.length} >= ${this.UDP_BUFFER_SIZE}), using TCP fallback`);
            await this.sendTcpMessage({ type, value });
        } else {
            return new Promise((resolve, reject) => {
                this.socket!.send(buffer, this.unityPort, this.unityAddress, (error) => {
                    if (error) {
                        console.error(`UnityCode: UDP send failed:`, error);
                        reject(error);
                    } else {
                        //console.log(`UnityCode: UDP message sent successfully`);
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Send large message via TCP
     */
    private async sendTcpMessage(message: UnityMessage): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            const messageBuffer = this.serializeMessage(message);

            server.listen(0, () => {
                const address = server.address() as net.AddressInfo;
                const tcpPort = address.port;

                // Send TCP coordination message via UDP
                const tcpMessage = {
                    type: MessageType.Tcp,
                    value: `${tcpPort}:${messageBuffer.length}`
                };

                const tcpBuffer = this.serializeMessage(tcpMessage);
                this.socket!.send(tcpBuffer, this.unityPort, this.unityAddress, (error) => {
                    if (error) {
                        server.close();
                        reject(error);
                        return;
                    }

                    // Wait for Unity to connect
                    const timeout = setTimeout(() => {
                        server.close();
                        reject(new Error('TCP send timeout'));
                    }, this.TCP_TIMEOUT);

                    server.on('connection', (socket) => {
                        clearTimeout(timeout);
                        socket.write(messageBuffer);
                        socket.end();
                        server.close();
                        resolve();
                    });
                });
            });

            server.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Serialize message to binary format
     */
    private serializeMessage(message: UnityMessage): Buffer {
        const valueBuffer = Buffer.from(message.value, 'utf8');
        const buffer = Buffer.alloc(8 + valueBuffer.length);

        // Write message type (4 bytes, little-endian)
        buffer.writeInt32LE(message.type, 0);
        
        // Write string length (4 bytes, little-endian)
        buffer.writeInt32LE(valueBuffer.length, 4);
        
        // Write string value
        valueBuffer.copy(buffer, 8);

        return buffer;
    }

    /**
     * Deserialize message from binary format
     */
    private deserializeMessage(buffer: Buffer): UnityMessage {
        if (buffer.length < 8) {
            throw new Error('Invalid message format: buffer too short');
        }

        // Read message type (4 bytes, little-endian)
        const type = buffer.readInt32LE(0) as MessageType;
        
        // Read string length (4 bytes, little-endian)
        const stringLength = buffer.readInt32LE(4);
        
        if (buffer.length < 8 + stringLength) {
            throw new Error('Invalid message format: incomplete string data');
        }

        // Read string value
        const value = buffer.subarray(8, 8 + stringLength).toString('utf8');

        return { type, value };
    }

    /**
     * Request test list from Unity
     */
    async requestTestList(testMode: 'EditMode' | 'PlayMode'): Promise<void> {
        await this.sendMessage(MessageType.RetrieveTestList, testMode);
    }

    /**
     * Execute tests in Unity
     */
    async executeTests(testMode: 'EditMode' | 'PlayMode', testName: string): Promise<void> {
        await this.sendMessage(MessageType.ExecuteTests, `${testMode}:${testName}`);
    }

    /**
     * Refresh Unity's asset database to trigger recompilation
     */
    async refreshAssetDatabase(): Promise<void> {
        console.log(`UnityCode: Sending Refresh message (type ${MessageType.Refresh}) to Unity on port ${this.unityPort}`);
        try {
            await this.sendMessage(MessageType.Refresh, '');
            console.log('UnityCode: Refresh message sent successfully');
        } catch (error) {
            console.error('UnityCode: Failed to send refresh message:', error);
            throw error;
        }
    }

    /**
     * Check if connected to Unity
     */
    get connected(): boolean {
        return this.isConnected;
    }

    /**
     * Check if Unity is online (responding to messages)
     */
    get unityOnline(): boolean {
        return this.isUnityOnline;
    }

    /**
     * Get Unity package name
     */
    get unityPackageName(): string {
        return this.packageName;
    }

    /**
     * Get current heartbeat interval
     */
    get currentHeartbeat(): number {
        return this.currentHeartbeatInterval;
    }

    /**
     * Get number of queued messages
     */
    get queuedMessageCount(): number {
        return this.messageQueue.length;
    }

    /**
     * Get current Unity port (0 if not connected)
     */
    get currentPort(): number {
        return this.unityPort;
    }

    /**
     * Get connected Unity process ID
     */
    get connectedUnityProcessId(): number | null {
        return this.connectedProcessId;
    }
}