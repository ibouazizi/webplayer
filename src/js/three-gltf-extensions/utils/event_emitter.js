/**
 * Simple EventEmitter implementation for browser environments
 */
export class EventEmitter {
    constructor() {
        this._events = new Map();
    }

    /**
     * Add event listener
     * @param {string} event Event name
     * @param {Function} listener Event listener function
     */
    on(event, listener) {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }
        this._events.get(event).push(listener);
        return this;
    }

    /**
     * Remove event listener
     * @param {string} event Event name
     * @param {Function} listener Event listener function
     */
    off(event, listener) {
        if (!this._events.has(event)) return this;
        const listeners = this._events.get(event);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
        return this;
    }

    /**
     * Add one-time event listener
     * @param {string} event Event name
     * @param {Function} listener Event listener function
     */
    once(event, listener) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            listener.apply(this, args);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * Emit event
     * @param {string} event Event name
     * @param {...any} args Event arguments
     */
    emit(event, ...args) {
        if (!this._events.has(event)) return false;
        const listeners = this._events.get(event);
        listeners.forEach(listener => listener.apply(this, args));
        return true;
    }

    /**
     * Remove all listeners for an event
     * @param {string} event Event name
     */
    removeAllListeners(event) {
        if (event) {
            this._events.delete(event);
        } else {
            this._events.clear();
        }
        return this;
    }
}