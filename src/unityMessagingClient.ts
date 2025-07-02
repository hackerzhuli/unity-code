import * as dgram from 'dgram';
import * as net from 'net';
import { UnityDetector, UnityDetectionEvent } from './unityDetector';
import { logWithLimit } from './utils';
import { EventEmitter } from './eventEmitter';
import { wait } from './asyncUtils';

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
    Online = 102,
    Offline = 103,
    IsPlaying = 104
}

export interface UnityMessage {
    type: MessageType;
    value: string;
    origin?: string;
}

export enum TestNodeType {
    Solution = 0,
    Assembly = 1,
    Namespace = 2,
    Class = 3,
    Method = 4,
    TestCase = 5
}

export interface TestAdaptor {
    Id: string;
    Name: string;
    FullName: string;
    Type: TestNodeType;
    Parent: number;
    Source: string;
    TestCount: number;
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
    TestId: string;
    PassCount: number;
    FailCount: number;
    InconclusiveCount: number;
    SkipCount: number;
    ResultState: string;
    StackTrace: string;
    TestStatus: TestStatusAdaptor;
    AssertCount: number;
    Duration: number;
    StartTime: number;
    EndTime: number;
    Message: string;
    Output: string;
    HasChildren: boolean;
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
 * 
 * ## Rate Limiting
 * 
 * The client implements configurable rate limiting to prevent issues with Unity operations:
 * 
 * **Why Rate Limiting is Necessary:**
 * - **Test Operations**: Unity test execution can take several seconds to minutes depending on test complexity
 * - **Asset Database Refresh**: Refreshing Unity's asset database triggers recompilation and can take significant time
 * - **Build Operations**: Unity builds are resource-intensive and should not be triggered rapidly
 * - **Preventing Unity Overload**: Rapid successive commands can overwhelm Unity Editor and cause instability
 * 
 * **Rate Limiting Behavior:**
 * - Each message type can have its own configurable minimum interval between sends
 * - Messages that violate rate limits are immediately discarded with an error
 * - Heartbeat messages (Ping/Pong) are exempt from rate limiting to maintain connection health
 */
export class UnityMessagingClient {
    /**
     * UDP socket for communication with Unity
     * @private
     */
    private socket: dgram.Socket | null = null;

    /**
     * Port number for Unity communication (calculated based on process ID)
     * @private
     */
    private unityPort: number = 0;

    /**
     * IP address for Unity communication (always localhost)
     * @private
     */
    private unityAddress: string = '127.0.0.1';

    /**
     * Map of message type handlers for processing incoming Unity messages
     * @private
     */
    private messageHandlers: Map<MessageType, (message: UnityMessage) => void> = new Map();

    /**
     * Rate limiting configuration - maps MessageType to minimum interval in milliseconds
     */
    private rateLimitConfig: Map<MessageType, number> = new Map();

    /**
     * Track last send time for each message type
     */
    private lastSendTimes: Map<MessageType, number> = new Map();

    /**
     * Indicates whether we have detected a Unity process and established a UDP socket connection.
     * This does NOT guarantee Unity is ready to receive messages - use isUnityOnline for that.
     * 
     * Connection flow:
     * 1. isConnected = true: Unity process detected, UDP socket bound, initial ping sent
     * 2. isUnityOnline = true: Unity responded with pong or OnLine message, ready for communication
     * @private
     */
    private isConnected: boolean = false;

    /**
     * Indicates whether Unity is online and responding to messages
     * @private
     */
    private isUnityOnline: boolean = false;

    /**
     * Indicates whether Unity Editor is currently in play mode
     * @private
     */
    private isUnityEditorPlaying: boolean = false;

    /**
     * Timer for sending periodic heartbeat messages to Unity
     * @private
     */
    private heartbeatInterval: NodeJS.Timeout | null = null;

    /**
     * Maximum size for UDP message buffer
     * @private
     */
    private readonly UDP_BUFFER_SIZE = 8192;

    /**
     * Timeout duration for TCP fallback connections
     * @private
     */
    private readonly TCP_TIMEOUT = 5000;

    /**
     * Name of the Unity package currently loaded
     * @private
     */
    private packageName: string = '';

    /**
     * Normal heartbeat interval in milliseconds (3 seconds)
     * @private
     */
    private readonly NORMAL_HEARTBEAT = 3000;

    /**
     * Aggressive heartbeat interval for initial connection detection (500ms)
     * @private
     */
    private readonly INITIAL_AGGRESSIVE_HEARTBEAT = 500;

    /**
     * Current heartbeat interval being used
     * @private
     */
    private currentHeartbeatInterval: number = this.INITIAL_AGGRESSIVE_HEARTBEAT;

    /**
     * Timer for initial aggressive heartbeat phase
     * @private
     */
    private initialHeartbeatTimeout: NodeJS.Timeout | null = null;

    /**
     * Flag indicating whether we've received the first response from Unity
     * @private
     */
    private hasReceivedFirstResponse: boolean = false;

    /**
     * Flag indicating whether the client has been disposed
     * @private
     */
    private isDisposed: boolean = false;

    /**
     * Process ID of the currently connected Unity instance for monitoring
     * @private
     */
    private connectedProcessId: number | null = null;

    /**
     * Unity detector instance for active process monitoring
     * @private
     */
    private unityDetector: UnityDetector;

    /**
     * Event emitter for connection status changes
     * Emits true when connected to Unity, false when disconnected
     * @public
     */
    public readonly onConnectionStatus = new EventEmitter<boolean>();

    /**
     * Event emitter for Unity online status changes
     * Emits true when Unity is online and responding, false when offline
     * @public
     */
    public readonly onOnlineStatus = new EventEmitter<boolean>();

    /**
     * Event emitter for Unity play mode status changes
     * Emits true when Unity enters play mode, false when exiting play mode
     * @public
     */
    public readonly onPlayStatus = new EventEmitter<boolean>();

    /**
     * Event emitter for Unity info log messages
     * @public
     */
    public readonly onInfoMessage = new EventEmitter<string>();

    /**
     * Event emitter for Unity warning log messages
     * @public
     */
    public readonly onWarningMessage = new EventEmitter<string>();

    /**
     * Event emitter for Unity error log messages
     * @public
     */
    public readonly onErrorMessage = new EventEmitter<string>();

    constructor(unityDetector: UnityDetector) {
        this.unityDetector = unityDetector;
        this.setupSocket();

        if (this.unityDetector) {
            this.initializeUnityDetectorEvents();
        }

        // Initialize default rate limits for specific message types
        this.initializeDefaultRateLimits();
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

            console.log('UnityMessagingClient: Unity detector events initialized and started');
        } catch (error) {
            console.error('UnityMessagingClient: Failed to initialize Unity detector events:', error);
        }
    }

    /**
     * Calculate messaging port for a given Unity process ID
     */
    private calculatePortForProcess(processId: number): number {
        const port = 58000 + (processId % 1000);
        console.log(`UnityMessagingClient: Calculated port ${port} for process ID ${processId} (formula: 56001 + ${processId} % 1000 = 56001 + ${processId % 1000})`);
        return port;
    }

    /**
     * Connect to Unity with a specific process ID
     */
    private async connectToUnity(processId: number): Promise<void> {
        if (this.isDisposed || this.isConnected) {
            console.log(`UnityMessagingClient: Skipping connection attempt (isDisposed=${this.isDisposed}, isConnected=${this.isConnected})`);
            return;
        }

        console.log(`UnityMessagingClient: Attempting to connect to Unity process ${processId}`);

        try {
            const success = await this.connectInternal(processId);

            if (success) {
                console.log(`UnityMessagingClient: Successfully connected to Unity process ${processId}`);
            } else {
                console.log(`UnityMessagingClient: Failed to connect to Unity process ${processId}`);
            }
        } catch (error) {
            console.log(`UnityMessagingClient: Connection to Unity process ${processId} failed with error:`, error);
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
                console.error('UnityMessagingClient: Error deserializing message:', error);
            }
        });

        this.socket.on('error', (error: Error) => {
            console.error('UnityMessagingClient: Socket error:', error);
            this.handleConnectionLoss();
        });

        this.socket.on('close', () => {
            console.log('UnityMessagingClient: Socket closed');
            this.handleConnectionLoss();
        });
    }

    /**
     * Handle connection loss
     */
    private handleConnectionLoss(): void {
        const wasConnected = this.isConnected;
        const wasOnline = this.isUnityOnline;
        const wasPlaying = this.isUnityEditorPlaying;
        this.isConnected = false;
        this.isUnityOnline = false;
        this.isUnityEditorPlaying = false;
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
        if (wasPlaying) {
            this.onPlayStatus.emit(false);
        }

        console.log('UnityMessagingClient: Connection lost - waiting for Unity detection event to reconnect');
    }

    /**
     * Internal connection method
     */
    private async connectInternal(processId: number): Promise<boolean> {
        if (!this.socket) {
            console.log(`UnityMessagingClient: connectInternal: No socket available`);
            return false;
        }

        try {
            console.log(`UnityMessagingClient: connectInternal: Connecting to Unity process ${processId}`);

            // Store the connected process ID for monitoring
            this.connectedProcessId = processId;
            const activePort = this.calculatePortForProcess(this.connectedProcessId);

            // Update the port
            this.unityPort = activePort;

            // Set connected state before sending initial ping
            this.isConnected = true;
            console.log(`UnityMessagingClient: connectInternal: Connected to Unity process ${this.connectedProcessId} on port ${activePort}`);

            // Send initial ping to establish connection
            await this.sendMessageInternal(MessageType.Ping, '');

            // Unity online status will be determined by first pong or OnLine message
            this.isUnityOnline = false;
            this.hasReceivedFirstResponse = false;

            this.startHeartbeat();

            // Trigger connection event
            console.log(`UnityMessagingClient: connectInternal: Emitting connection event for new Unity connection`);
            this.onConnectionStatus.emit(true);

            return true;
        } catch (error) {
            console.log(`UnityMessagingClient: connectInternal: Failed with error:`, error);
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
            console.log('UnityMessagingClient: First response received, requesting package name and switching to normal heartbeat');

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
                console.log('UnityMessagingClient: Switching from aggressive to normal heartbeat interval');

                this.currentHeartbeatInterval = this.NORMAL_HEARTBEAT;
                console.log(`UnityMessagingClient: Set heartbeat interval to ${this.NORMAL_HEARTBEAT}ms`);

                // Restart heartbeat with normal interval
                if (this.heartbeatInterval) {
                    this.startHeartbeat();
                }
            }
        }, 2000); // Wait 2 seconds after first response before switching
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
        // log messages that needs debug for the moment(None if no need)
        if (message.type === MessageType.None) {
            console.log(`UnityMessagingClient: Received message - Type: ${message.type} (${MessageType[message.type] || 'Unknown'}), payload is ${message.value}`);
        }
        // Skip logging for ping/pong, which is not useful to sett
        // skip log messages(which can be way higher frequency than ping/pong)
        // skip test started/finised(there can be many tests in a test run, too much logs)        
        else if (message.type !== MessageType.Ping && message.type !== MessageType.Pong &&
            message.type !== MessageType.Info && message.type !== MessageType.Warning && message.type !== MessageType.Error &&
            message.type !== MessageType.TestStarted && message.type !== MessageType.TestFinished
        ) {
            console.log(`UnityMessagingClient: Received message - Type: ${message.type} (${MessageType[message.type] || 'Unknown'}), payload is ${message.value.length} bytes`);
        }else if(message.value.length > this.UDP_BUFFER_SIZE && message.type !== MessageType.Info && message.type !== MessageType.Warning && message.type !== MessageType.Error){
            // log large messages for debug
            console.log(`UnityMessagingClient: Received message - Type: ${message.type} (${MessageType[message.type] || 'Unknown'}), payload is ${message.value}`);
        }

        // Handle Unity online/offline state changes
        let messageHandledInternally = false;

        if (message.type === MessageType.Online) {
            messageHandledInternally = true;
            console.log('UnityMessagingClient: Unity online');
            this.isUnityOnline = true;
            this.onOnlineStatus.emit(true);

            this.handleFirstResponse();
        } else if (message.type === MessageType.Offline) {
            messageHandledInternally = true;
            console.log('UnityMessagingClient: Unity went offline');
            this.isUnityOnline = false;
            this.onOnlineStatus.emit(false);
        } else if (message.type === MessageType.Pong) {
            messageHandledInternally = true;
            // Pong response indicates Unity is online and responding
            if (!this.isUnityOnline) {
                console.log('UnityMessagingClient: Unity online (pong received)');
                this.isUnityOnline = true;
                this.onOnlineStatus.emit(true);

            }
            this.handleFirstResponse();
        } else if (message.type === MessageType.PackageName) {
            messageHandledInternally = true;
            if (message.value) {
                this.packageName = message.value;
                console.log(`UnityMessagingClient: Detected Unity package: ${this.packageName}`);
            }
        } else if (message.type === MessageType.Info) {
            messageHandledInternally = true;
            this.onInfoMessage.emit(message.value);
        } else if (message.type === MessageType.Warning) {
            messageHandledInternally = true;
            this.onWarningMessage.emit(message.value);
        } else if (message.type === MessageType.Error) {
            messageHandledInternally = true;
            this.onErrorMessage.emit(message.value);
        } else if (message.type === MessageType.IsPlaying) {
            messageHandledInternally = true;
            const isPlaying = message.value === 'true';
            console.log(`UnityMessagingClient: Unity play mode changed - IsPlaying: ${isPlaying}`);
            this.isUnityEditorPlaying = isPlaying;
            this.onPlayStatus.emit(isPlaying);
        } else if (message.type === MessageType.Tcp) {
            messageHandledInternally = true;
            this.handleTcpMessage(message);
        }

        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message);
        } else if (!messageHandledInternally) {
            console.log(`UnityMessagingClient: No handler registered for message type ${message.type} (${MessageType[message.type] || 'Unknown'})`);
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
                console.error('UnityMessagingClient: Invalid TCP message format');
                return;
            }

            const tcpMessage = await this.receiveTcpMessage(port, length);
            if (tcpMessage) {
                console.log(`receive tcp message success, length: ${length}, type: ${tcpMessage.type}`);
                this.handleMessage(tcpMessage);
            }
        } catch (error) {
            console.error('UnityMessagingClient: Error handling TCP message:', error);
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
     * Send message to Unity with rate limiting
     * @param type The message type to send
     * @param value The message value to send
     * @param timeoutMs Timeout in milliseconds to wait for Unity to come online (default: 30000ms)
     * @returns true if message was sent successfully, false if it was rejected/discarded or timed out
     */
    async sendMessage(type: MessageType, value: string, timeoutMs: number = 30000): Promise<boolean> {
        if (!this.socket || !this.isConnected) {
            console.error('Not connected to Unity');
            return false;
        }

        // Check rate limit for this message type
        if (this.isRateLimited(type)) {
            const rateLimitMs = this.rateLimitConfig.get(type)!;
            const lastSendTime = this.lastSendTimes.get(type) || 0;
            const timeSinceLastSend = Date.now() - lastSendTime;
            console.error(`UnityMessagingClient: Rate limit exceeded for message type ${type} (${MessageType[type]}). ` +
                `Minimum interval: ${rateLimitMs}ms, Time since last send: ${timeSinceLastSend}ms. Message discarded.`);
            return false;
        }

        // Update last send time for rate limiting
        this.updateLastSendTime(type);

        // Wait for Unity to come online for non-heartbeat messages
        const isHeartbeatMessage = type === MessageType.Ping || type === MessageType.Pong;

        if (!this.isUnityOnline && !isHeartbeatMessage) {
            console.log(`UnityMessagingClient: Unity is offline, waiting for Unity to come online - Type: ${type} (${MessageType[type]}), Value: "${value}", Timeout: ${timeoutMs}ms`);

            const startTime = Date.now();

            // Wait for Unity to come online with polling
            while (!this.isUnityOnline && (Date.now() - startTime) < timeoutMs) {
                await wait(1000); // Wait 1 second
            }

            // Check if Unity came online or we timed out
            if (!this.isUnityOnline) {
                console.log(`UnityMessagingClient: Timeout waiting for Unity to come online - Type: ${type} (${MessageType[type]}), Value: "${value}"`);
                return false;
            }

            const elapsedTime = Date.now() - startTime;
            console.log(`UnityMessagingClient: Unity came online after ${elapsedTime}ms, sending message - Type: ${type} (${MessageType[type]}), Value: "${value}"`);
        }

        try {
            await this.sendMessageInternal(type, value);
            return true;
        } catch (_error) {
            return false;
        }
    }

    /**
     * Internal method to actually send message to Unity
     */
    private async sendMessageInternal(type: MessageType, value: string): Promise<void> {
        if (!this.socket || !this.isConnected) {
            const errorMsg = 'Not connected to Unity';
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        const buffer = this.serializeMessage({ type, value });
        // Skip logging for ping/pong messages to reduce console noise
        if (type !== MessageType.Ping && type !== MessageType.Pong) {
            logWithLimit(`UnityMessagingClient: Sending message - Type: ${type} (${MessageType[type]}), Value: "${value}", Size: ${buffer.length} bytes`);
        }

        // Check if message is too large for UDP
        if (buffer.length >= this.UDP_BUFFER_SIZE) {
            const errorMsg = `Message too large for UDP (discarded) (${buffer.length} >= ${this.UDP_BUFFER_SIZE}), discarding message - Type: ${type} (${MessageType[type]}), Value: "${value}"`;
            console.error(`UnityMessagingClient: ${errorMsg}`);
            throw new Error(errorMsg);
        }

        return new Promise((resolve, reject) => {
            this.socket!.send(buffer, this.unityPort, this.unityAddress, (error) => {
                if (error) {
                    console.error(`UnityMessagingClient: UDP send failed:`, error);
                    reject(error);
                } else {
                    //console.log(`UnityMessagingClient: UDP message sent successfully`);
                    resolve();
                }
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
     * @returns true if request was sent or queued successfully, false otherwise
     */
    async requestTestList(testMode: 'EditMode' | 'PlayMode'): Promise<boolean> {
        return await this.sendMessage(MessageType.RetrieveTestList, testMode);
    }

    /**
     * Execute tests in Unity
     * @returns true if request was sent, false otherwise
     */
    async executeTests(testMode: 'EditMode' | 'PlayMode', filter: string): Promise<boolean> {
        const value = filter ? `${testMode}:${filter}` : testMode;
        return await this.sendMessage(MessageType.ExecuteTests, value);
    }

    /**
     * Refresh Unity's asset database to trigger recompilation
     * @returns true if refresh was sent or queued successfully, false otherwise
     */
    async refreshAssetDatabase(): Promise<boolean> {
        if (!this.isConnected) {
            console.log('UnityMessagingClient: Not connected to Unity, cannot refresh asset database');
            return false;
        }

        console.log(`UnityMessagingClient: Sending Refresh message (type ${MessageType.Refresh}) to Unity on port ${this.unityPort}`);
        try {
            const success = await this.sendMessage(MessageType.Refresh, '');
            if (success) {
                console.log('UnityMessagingClient: Refresh asset database message sent successfully');
            } else {
                console.log('UnityMessagingClient: Failed to send refresh asset database message');
            }
            return success;
        } catch (error) {
            console.error('UnityMessagingClient: Failed to send refresh message:', error);
            return false;
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
     * Check if Unity is currently playing
     */
    get unityPlaying(): boolean {
        return this.isUnityEditorPlaying;
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

    /**
     * Initialize default rate limits for message types that need throttling
     */
    private initializeDefaultRateLimits(): void {
        // prevent frequent refreshes, usually a refresh in Unity takes seconds to minutes, so sending it frequently makes no sense
        this.rateLimitConfig.set(MessageType.Refresh, 5000);
        this.rateLimitConfig.set(MessageType.ExecuteTests, 1000);
    }

    /**
     * Check if a message type is currently rate limited
     */
    private isRateLimited(type: MessageType): boolean {
        const rateLimitMs = this.rateLimitConfig.get(type);
        if (!rateLimitMs) {
            return false; // No rate limit configured for this message type
        }

        const lastSendTime = this.lastSendTimes.get(type);
        if (!lastSendTime) {
            return false; // First time sending this message type
        }

        const timeSinceLastSend = Date.now() - lastSendTime;
        return timeSinceLastSend < rateLimitMs;
    }

    /**
     * Update the last send time for a message type
     */
    private updateLastSendTime(type: MessageType): void {
        this.lastSendTimes.set(type, Date.now());
    }
}