/**
 * Generic Event Emitter that supports only one event type per instance.
 * This design prevents mixing multiple event types and provides type safety.
 * 
 * @template T The type of data that will be emitted with the event
 * 
 * @example
 * ```typescript
 * // Create an event emitter for connection events
 * const connectionEvent = new EventEmitter<void>();
 * 
 * // Subscribe to the event
 * const unsubscribe = connectionEvent.subscribe(() => {
 *     console.log('Connected!');
 * });
 * 
 * // Emit the event
 * connectionEvent.emit();
 * 
 * // Unsubscribe when done
 * unsubscribe();
 * ```
 * 
 * @example
 * ```typescript
 * // Create an event emitter for message events
 * const messageEvent = new EventEmitter<string>();
 * 
 * // Subscribe with multiple handlers
 * const unsubscribe1 = messageEvent.subscribe((msg) => console.log('Handler 1:', msg));
 * const unsubscribe2 = messageEvent.subscribe((msg) => console.log('Handler 2:', msg));
 * 
 * // Emit a message
 * messageEvent.emit('Hello World!');
 * 
 * // Unsubscribe specific handlers
 * unsubscribe1();
 * unsubscribe2();
 * ```
 */
export class EventEmitter<T> {
    private listeners: Set<(data: T) => void> = new Set();

    /**
     * Subscribe to the event with a callback function.
     * 
     * @param callback The function to call when the event is emitted
     * @returns A function that can be called to unsubscribe this specific callback
     */
    subscribe(callback: (data: T) => void): () => void {
        this.listeners.add(callback);
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Unsubscribe a specific callback from the event.
     * 
     * @param callback The callback function to remove
     * @returns true if the callback was found and removed, false otherwise
     */
    unsubscribe(callback: (data: T) => void): boolean {
        return this.listeners.delete(callback);
    }

    /**
     * Unsubscribe all callbacks from the event.
     */
    unsubscribeAll(): void {
        this.listeners.clear();
    }

    /**
     * Emit the event to all subscribed callbacks.
     * 
     * @param data The data to pass to all callback functions
     */
    emit(data: T): void {
        // Create a copy of listeners to avoid issues if callbacks modify the set during iteration
        const currentListeners = Array.from(this.listeners);
        
        for (const listener of currentListeners) {
            try {
                listener(data);
            } catch (error) {
                // Log error but continue with other listeners
                console.error('Error in event listener:', error);
            }
        }
    }

    /**
     * Get the number of currently subscribed listeners.
     * 
     * @returns The number of active subscriptions
     */
    get listenerCount(): number {
        return this.listeners.size;
    }

    /**
     * Check if there are any active listeners.
     * 
     * @returns true if there are active listeners, false otherwise
     */
    get hasListeners(): boolean {
        return this.listeners.size > 0;
    }
}

/**
 * Specialized event emitter for events that don't carry data (void events).
 * This is a convenience class for common use cases like connection/disconnection events.
 * 
 * @example
 * ```typescript
 * const connectionEvent = new VoidEventEmitter();
 * 
 * connectionEvent.subscribe(() => {
 *     console.log('Connected!');
 * });
 * 
 * connectionEvent.emit();
 * ```
 */
export class VoidEventEmitter extends EventEmitter<void> {
    /**
     * Emit the event to all subscribed callbacks.
     * No data parameter needed since this is a void event.
     */
    emit(): void {
        super.emit(undefined as void);
    }

    /**
     * Subscribe to the event with a callback function.
     * 
     * @param callback The function to call when the event is emitted (no parameters)
     * @returns A function that can be called to unsubscribe this specific callback
     */
    subscribe(callback: () => void): () => void {
        return super.subscribe(callback);
    }

    /**
     * Unsubscribe a specific callback from the event.
     * 
     * @param callback The callback function to remove (no parameters)
     * @returns true if the callback was found and removed, false otherwise
     */
    unsubscribe(callback: () => void): boolean {
        return super.unsubscribe(callback);
    }
}