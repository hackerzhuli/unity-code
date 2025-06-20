import * as dgram from 'dgram';
import * as net from 'net';
import { UnityProcessDetector, UnityProcess } from './unityProcessDetector.js';

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
    CompilationFinished = 26
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

export class UnityMessagingClient {
    private socket: dgram.Socket | null = null;
    private unityPort: number = 0;
    private unityAddress: string = '127.0.0.1';
    private messageHandlers: Map<MessageType, (message: UnityMessage) => void> = new Map();
    private isConnected: boolean = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_INTERVAL = 3000; // 3 seconds
    private readonly UDP_BUFFER_SIZE = 8192;
    private readonly TCP_TIMEOUT = 5000;

    constructor() {
        this.setupSocket();
    }

    /**
     * Calculate Unity's messaging port based on process ID
     */
    private calculateUnityPort(): number {
        // This will be set when we detect Unity process
        return 56002; // Default fallback
    }

    private processDetector = new UnityProcessDetector();

    /**
     * Detect Unity Editor processes and return their process IDs
     */
    private async detectUnityProcesses(): Promise<number[]> {
        const unityProcesses = await this.processDetector.detectUnityProcesses();
        const processIds = unityProcesses.map((proc: UnityProcess) => proc.pid);
        
        console.log(`UnityCode: Detected ${processIds.length} Unity process PIDs: [${processIds.join(', ')}]`);
        return processIds;
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
     * Find the correct Unity process and port by testing connectivity
     */
    private async findActiveUnityPort(): Promise<number | null> {
        console.log('UnityCode: Starting Unity port detection...');
        
        const processIds = await this.detectUnityProcesses();
        
        if (processIds.length === 0) {
            console.warn('UnityCode: No Unity processes detected');
            console.log('UnityCode: Trying default port 56002 as fallback...');
            
            // Test default port as fallback
            if (await this.testPort(56002)) {
                console.log('UnityCode: Successfully connected to Unity on default port 56002');
                return 56002;
            }
            
            console.error('UnityCode: No Unity Editor found on default port either');
            return null;
        }

        console.log(`UnityCode: Found ${processIds.length} Unity process(es): ${processIds.join(', ')}`);
        console.log('UnityCode: Testing each process for connectivity...');

        // Test each process to see which one responds
        for (let i = 0; i < processIds.length; i++) {
            const processId = processIds[i];
            const port = this.calculatePortForProcess(processId);
            
            console.log(`UnityCode: [${i + 1}/${processIds.length}] Testing Unity process ${processId} on port ${port}`);
            console.log(`UnityCode: Sending test ping to ${this.unityAddress}:${port}...`);
            
            const startTime = Date.now();
            const isResponding = await this.testPort(port);
            const duration = Date.now() - startTime;
            
            if (isResponding) {
                console.log(`UnityCode: ✓ Unity process ${processId} responded on port ${port} (${duration}ms)`);
                return port;
            } else {
                console.log(`UnityCode: ✗ Unity process ${processId} did not respond on port ${port} (${duration}ms timeout)`);
            }
        }

        console.error('UnityCode: No Unity processes responded to ping');
        console.log('UnityCode: Trying default port 56002 as final fallback...');
        
        // Final fallback to default port
        if (await this.testPort(56002)) {
            console.log('UnityCode: Successfully connected to Unity on default port 56002');
            return 56002;
        }
        
        console.error('UnityCode: All connection attempts failed');
        return null;
    }

    /**
     * Test if Unity is listening on a specific port
     */
    private async testPort(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            console.log(`UnityCode: Creating test socket for port ${port}`);
            const testSocket = dgram.createSocket('udp4');
            const message = this.serializeMessage({ type: MessageType.Ping, value: '' });
            let responded = false;
            
            console.log(`UnityCode: Test message prepared: ${message.length} bytes`);
            console.log(`UnityCode: Test message content: ${JSON.stringify(message.toString('hex'))}`);

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                try {
                    testSocket.close();
                } catch (_error) {
                    // Socket might already be closed
                }
            };
            
            const timeoutId = setTimeout(() => {
                if (!responded) {
                    console.log(`UnityCode: Test port ${port} timed out after 2000ms`);
                    responded = true;
                    cleanup();
                    resolve(false);
                }
            }, 2000); // 2 second timeout

            testSocket.on('message', (buffer: Buffer, rinfo: dgram.RemoteInfo) => {
                if (!responded) {
                    console.log(`UnityCode: ✓ Received response from ${rinfo.address}:${rinfo.port}`);
                    console.log(`UnityCode: Response size: ${buffer.length} bytes`);
                    console.log(`UnityCode: Response content: ${JSON.stringify(buffer.toString('hex'))}`);
                    responded = true;
                    cleanup();
                    resolve(true);
                }
            });

            testSocket.on('error', (error: Error) => {
                console.log(`UnityCode: Test port ${port} error:`, error.message || error);
                if (!responded) {
                    responded = true;
                    cleanup();
                    resolve(false);
                }
            });

            testSocket.on('close', () => {
                console.log(`UnityCode: Test socket closed for port ${port}`);
            });

            console.log(`UnityCode: Sending ${message.length} byte ping to ${this.unityAddress}:${port}`);
            testSocket.send(message, port, this.unityAddress, (error) => {
                if (error && !responded) {
                    console.error(`UnityCode: Failed to send test message to port ${port}:`, error.message);
                    console.error(`UnityCode: Send error code: ${(error as NodeJS.ErrnoException).code || 'unknown'}`);
                    responded = true;
                    cleanup();
                    resolve(false);
                } else if (!error) {
                    console.log(`UnityCode: Test message sent successfully to ${this.unityAddress}:${port}`);
                }
            });
        });
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
            this.isConnected = false;
        });

        this.socket.on('close', () => {
            console.log('UnityCode: Socket closed');
            this.isConnected = false;
            this.stopHeartbeat();
        });
    }

    /**
     * Connect to Unity Editor
     */
    async connect(): Promise<boolean> {
        if (!this.socket) {
            return false;
        }

        try {
            // First, detect Unity processes and find the active port
            const activePort = await this.findActiveUnityPort();
            if (activePort === null) {
                console.error('UnityCode: No active Unity Editor found');
                return false;
            }

            // Update the port
            this.unityPort = activePort;
            console.log(`UnityCode: Connecting to Unity on port ${this.unityPort}`);

            // Set connected state before sending initial ping
            this.isConnected = true;
            
            // Send initial ping to establish connection
            await this.sendMessage(MessageType.Ping, '');
            this.startHeartbeat();
            console.log('UnityCode: Successfully connected to Unity Editor');
            return true;
        } catch (error) {
            console.error('UnityCode: Failed to connect to Unity:', error);
            this.isConnected = false; // Reset connection state on failure
            return false;
        }
    }

    /**
     * Disconnect from Unity Editor
     */
    disconnect(): void {
        this.isConnected = false;
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
            if (this.isConnected) {
                this.sendMessage(MessageType.Ping, '').catch(() => {
                    this.isConnected = false;
                });
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
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
        console.log(`UnityCode: Received message - Type: ${message.type} (${MessageType[message.type] || 'Unknown'}), Value: "${message.value}", Origin: ${message.origin || 'unknown'}`);
        
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message);
        } else {
            console.log(`UnityCode: No handler registered for message type ${message.type} (${MessageType[message.type] || 'Unknown'})`);
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

        const buffer = this.serializeMessage({ type, value });
        console.log(`UnityCode: Sending message - Type: ${type} (${MessageType[type]}), Value: "${value}", Size: ${buffer.length} bytes, Target: ${this.unityAddress}:${this.unityPort}`);

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
                        console.log(`UnityCode: UDP message sent successfully`);
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
     * Set Unity port (for when we detect Unity process)
     */
    setUnityPort(processId: number): void {
        this.unityPort = 56002 + (processId % 1000);
    }

    /**
     * Manually refresh Unity process detection and reconnect if needed
     */
    async refreshConnection(): Promise<boolean> {
        if (this.isConnected) {
            this.disconnect();
        }
        
        // Recreate socket
        this.setupSocket();
        
        // Attempt to connect
        return await this.connect();
    }

    /**
     * Get current Unity port
     */
    getCurrentPort(): number {
        return this.unityPort;
    }

    /**
     * Get list of detected Unity processes
     */
    async getUnityProcesses(): Promise<number[]> {
        return await this.detectUnityProcesses();
    }
}