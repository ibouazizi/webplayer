import { EventEmitter } from '../utils/event_emitter.js';
import { RingBuffer } from '../third_party/ringbufjs/ringbuf.module.js';
import { GL_COMPONENT_TYPES } from './constants.js';

/**
 * Generic Pipeline for a MPEG_media item
 * Can run in both worker and non-worker environments
 */
export class MediaPipeline extends EventEmitter {
    constructor(mimeType, uri, type, componentType, options) {
        super();
        this.mimeType = mimeType;           // media mimeType
        this.uri = uri;                     // media URI
        this.type = type;                   // accessor data type (buffer elements)
        this.componentType = componentType; // accessor component type 
        this.options = options;             // options for media playback
        this.buffer = null;                 // reference to a RingBuffer
        this.isInitialized = false;
    }

    /**
     * Initialize the pipeline
     * @param {SharedArrayBuffer} sab Shared array buffer for ring buffer
     */
    initialize(sab) {
        if (this.isInitialized) {
            console.warn('Pipeline already initialized');
            return;
        }

        // Create ring buffer
        this.buffer = new RingBuffer(sab, GL_COMPONENT_TYPES[this.componentType]);
        this.isInitialized = true;
    }

    /**
     * Start playback
     */
    play() {
        throw new Error('Not implemented');
    }

    /**
     * Pause playback
     */
    pause() {
        throw new Error('Not implemented');
    }

    /**
     * Seek to a specific time
     * @param {number} time Time in seconds
     */
    seek(time) {
        throw new Error('Not implemented');
    }

    /**
     * Get current playback time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        throw new Error('Not implemented');
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.buffer = null;
        this.isInitialized = false;
    }
}