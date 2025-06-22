import { EventEmitter, VoidEventEmitter } from '../eventEmitter.js';
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
            let goodListenerCalled = false;
            
            // Add a listener that throws
            emitter.subscribe(() => {
                throw new Error('Test error');
            });
            
            // Add a good listener
            emitter.subscribe(() => {
                goodListenerCalled = true;
            });
            
            // Should not throw and should call the good listener
            assert.doesNotThrow(() => {
                emitter.emit('test');
            });
            
            assert.strictEqual(goodListenerCalled, true);
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