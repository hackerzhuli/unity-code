import { EventEmitter, VoidEventEmitter } from '../eventEmitter';
import * as assert from 'assert';

describe('EventEmitter', () => {
    describe('EventEmitter<T>', () => {
        it('should emit events to subscribed listeners', () => {
            const emitter = new EventEmitter<string>();
            let receivedValue = '';
            
            emitter.subscribe((value) => {
                receivedValue = value;
            });
            
            emitter.emit('test message');
            assert.strictEqual(receivedValue, 'test message');
        });
        
        it('should support multiple listeners', () => {
            const emitter = new EventEmitter<number>();
            const results: number[] = [];
            
            emitter.subscribe((value) => results.push(value * 2));
            emitter.subscribe((value) => results.push(value * 3));
            
            emitter.emit(5);
            assert.deepStrictEqual(results, [10, 15]);
        });
        
        it('should allow unsubscribing via returned function', () => {
            const emitter = new EventEmitter<string>();
            let callCount = 0;
            
            const unsubscribe = emitter.subscribe(() => {
                callCount++;
            });
            
            emitter.emit('test1');
            assert.strictEqual(callCount, 1);
            
            unsubscribe();
            emitter.emit('test2');
            assert.strictEqual(callCount, 1); // Should not increment
        });
        
        it('should allow unsubscribing via unsubscribe method', () => {
            const emitter = new EventEmitter<string>();
            let callCount = 0;
            
            const callback = () => {
                callCount++;
            };
            
            emitter.subscribe(callback);
            emitter.emit('test1');
            assert.strictEqual(callCount, 1);
            
            const removed = emitter.unsubscribe(callback);
            assert.strictEqual(removed, true);
            
            emitter.emit('test2');
            assert.strictEqual(callCount, 1); // Should not increment
        });
        
        it('should unsubscribe all listeners', () => {
            const emitter = new EventEmitter<string>();
            let callCount = 0;
            
            emitter.subscribe(() => callCount++);
            emitter.subscribe(() => callCount++);
            
            emitter.emit('test1');
            assert.strictEqual(callCount, 2);
            
            emitter.unsubscribeAll();
            emitter.emit('test2');
            assert.strictEqual(callCount, 2); // Should not increment
        });
        
        it('should report listener count correctly', () => {
            const emitter = new EventEmitter<string>();
            
            assert.strictEqual(emitter.listenerCount, 0);
            assert.strictEqual(emitter.hasListeners, false);
            
            const unsubscribe1 = emitter.subscribe(() => {});
            assert.strictEqual(emitter.listenerCount, 1);
            assert.strictEqual(emitter.hasListeners, true);
            
            const unsubscribe2 = emitter.subscribe(() => {});
            assert.strictEqual(emitter.listenerCount, 2);
            
            unsubscribe1();
            assert.strictEqual(emitter.listenerCount, 1);
            
            unsubscribe2();
            assert.strictEqual(emitter.listenerCount, 0);
            assert.strictEqual(emitter.hasListeners, false);
        });
        
        it('should handle errors in listeners gracefully', () => {
            const emitter = new EventEmitter<string>();
            let successfulCallCount = 0;
            
            // Add a listener that throws an error
            emitter.subscribe(() => {
                throw new Error('Test error');
            });
            
            // Add a listener that should still execute
            emitter.subscribe(() => {
                successfulCallCount++;
            });
            
            // Emit should not throw, and the second listener should still execute
            assert.doesNotThrow(() => {
                emitter.emit('test');
            });
            
            assert.strictEqual(successfulCallCount, 1);
        });
        
        it('should work with boolean events for connection status', () => {
            const connectionEmitter = new EventEmitter<boolean>();
            const statusHistory: boolean[] = [];
            
            connectionEmitter.subscribe((isConnected) => {
                statusHistory.push(isConnected);
            });
            
            // Simulate connection events
            connectionEmitter.emit(true);  // Connected
            connectionEmitter.emit(false); // Disconnected
            connectionEmitter.emit(true);  // Reconnected
            
            assert.deepStrictEqual(statusHistory, [true, false, true]);
        });
        
        it('should work with boolean events for online status', () => {
            const onlineEmitter = new EventEmitter<boolean>();
            let currentStatus = false;
            
            onlineEmitter.subscribe((isOnline) => {
                currentStatus = isOnline;
            });
            
            // Simulate online/offline events
            onlineEmitter.emit(true);
            assert.strictEqual(currentStatus, true);
            
            onlineEmitter.emit(false);
            assert.strictEqual(currentStatus, false);
        });
    });
    
    describe('VoidEventEmitter', () => {
        it('should emit void events', () => {
            const emitter = new VoidEventEmitter();
            let called = false;
            
            emitter.subscribe(() => {
                called = true;
            });
            
            emitter.emit();
            assert.strictEqual(called, true);
        });
        
        it('should support multiple void listeners', () => {
            const emitter = new VoidEventEmitter();
            let callCount = 0;
            
            emitter.subscribe(() => callCount++);
            emitter.subscribe(() => callCount++);
            
            emitter.emit();
            assert.strictEqual(callCount, 2);
        });
        
        it('should allow unsubscribing void listeners', () => {
            const emitter = new VoidEventEmitter();
            let callCount = 0;
            
            const unsubscribe = emitter.subscribe(() => {
                callCount++;
            });
            
            emitter.emit();
            assert.strictEqual(callCount, 1);
            
            unsubscribe();
            emitter.emit();
            assert.strictEqual(callCount, 1); // Should not increment
        });
    });
});