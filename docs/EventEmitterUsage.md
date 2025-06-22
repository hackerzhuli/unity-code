# EventEmitter Usage Guide

This document explains how to use the new `EventEmitter` class that replaces the old callback pattern in the Unity Code extension.

## Overview

The `EventEmitter` class provides a type-safe, flexible way to handle events. Each instance supports only one event type, preventing mixing of different event types and providing better type safety.

## Basic Usage

### VoidEventEmitter (for events without data)

```typescript
import { VoidEventEmitter } from './eventEmitter.js';

// Create an event emitter for connection events
const connectionEvent = new VoidEventEmitter();

// Subscribe to the event
const unsubscribe = connectionEvent.subscribe(() => {
    console.log('Connected to Unity!');
});

// Emit the event
connectionEvent.emit();

// Unsubscribe when done
unsubscribe();
```

### EventEmitter<T> (for events with data)

```typescript
import { EventEmitter } from './eventEmitter.js';

// Create an event emitter for message events
const messageEvent = new EventEmitter<string>();

// Subscribe with multiple handlers
const unsubscribe1 = messageEvent.subscribe((msg) => {
    console.log('Handler 1:', msg);
});

const unsubscribe2 = messageEvent.subscribe((msg) => {
    console.log('Handler 2:', msg);
});

// Emit a message
messageEvent.emit('Hello World!');

// Unsubscribe specific handlers
unsubscribe1();
unsubscribe2();
```

## Migration from Callback Pattern

### Before (Old Pattern)

```typescript
// Old callback-based approach
class UnityMessagingClient {
    private connectionCallback: (() => void) | null = null;
    
    onConnection(callback: () => void): void {
        this.connectionCallback = callback;
    }
    
    private triggerConnection(): void {
        if (this.connectionCallback) {
            this.connectionCallback();
        }
    }
}

// Usage
const client = new UnityMessagingClient();
client.onConnection(() => {
    console.log('Connected!');
});
```

### After (New Event Pattern)

```typescript
// New event-based approach
class UnityMessagingClient {
    public readonly onConnection = new VoidEventEmitter();
    
    private triggerConnection(): void {
        this.onConnection.emit();
    }
}

// Usage
const client = new UnityMessagingClient();
const unsubscribe = client.onConnection.subscribe(() => {
    console.log('Connected!');
});

// Can unsubscribe later
unsubscribe();
```

## Advanced Usage

### Multiple Subscribers

```typescript
const statusEvent = new EventEmitter<{ status: string; timestamp: number }>();

// Multiple components can subscribe
const loggerUnsubscribe = statusEvent.subscribe((data) => {
    console.log(`[${new Date(data.timestamp).toISOString()}] Status: ${data.status}`);
});

const uiUnsubscribe = statusEvent.subscribe((data) => {
    updateStatusBar(data.status);
});

const analyticsUnsubscribe = statusEvent.subscribe((data) => {
    trackEvent('status_change', { status: data.status });
});

// Emit to all subscribers
statusEvent.emit({ status: 'connected', timestamp: Date.now() });
```

### Conditional Unsubscribing

```typescript
const messageEvent = new EventEmitter<string>();

// Subscribe with automatic unsubscribe after first message
const unsubscribe = messageEvent.subscribe((message) => {
    console.log('First message:', message);
    unsubscribe(); // Unsubscribe after first message
});

// Or unsubscribe all listeners
messageEvent.unsubscribeAll();
```

### Checking Listener Status

```typescript
const event = new EventEmitter<string>();

console.log(event.hasListeners); // false
console.log(event.listenerCount); // 0

const unsubscribe = event.subscribe(() => {});

console.log(event.hasListeners); // true
console.log(event.listenerCount); // 1
```

## Benefits of the New Pattern

1. **Type Safety**: Each event emitter is strongly typed for its specific event data
2. **Multiple Subscribers**: Multiple components can subscribe to the same event
3. **Flexible Unsubscribing**: Can unsubscribe individual callbacks or all at once
4. **Error Handling**: Errors in one listener don't affect others
5. **Memory Management**: Easy to clean up subscriptions to prevent memory leaks
6. **Single Responsibility**: Each event emitter handles only one event type

## Real-World Example: Unity Connection Events

```typescript
// In UnityMessagingClient
export class UnityMessagingClient {
    public readonly onConnection = new VoidEventEmitter();
    public readonly onDisconnection = new VoidEventEmitter();
    public readonly onMessage = new EventEmitter<UnityMessage>();
    
    // ... implementation
}

// In UnityTestProvider
export class UnityTestProvider {
    constructor(private messagingClient: UnityMessagingClient) {
        // Subscribe to connection events
        this.messagingClient.onConnection.subscribe(() => {
            this.discoverTestsSilently();
        });
        
        // Subscribe to specific messages
        this.messagingClient.onMessage.subscribe((message) => {
            if (message.type === MessageType.TestFinished) {
                this.handleTestResult(message);
            }
        });
    }
}
```

This pattern provides a clean, type-safe, and flexible way to handle events throughout the Unity Code extension.