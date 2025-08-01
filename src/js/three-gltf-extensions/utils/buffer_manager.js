import { RingBuffer } from '../third_party/ringbufjs/ringbuf.module.js';

/**
 * Manages shared ring buffers for video frames
 */
export class BufferManager {
    constructor() {
        this.buffers = new Map();  // Map<bufferId, BufferInfo>
        this.consumers = new Map(); // Map<bufferId, Set<consumer>>
        this.pipelines = new Map(); // Map<bufferId, pipeline>
    }

    /**
     * Create a new ring buffer
     * @param {string} bufferId Unique identifier for the buffer
     * @param {number} width Frame width
     * @param {number} height Frame height
     * @param {number} channels Number of channels (e.g., 4 for RGBA)
     * @param {number} maxFrames Maximum number of frames to store
     * @param {Function} componentType Array type (e.g., Uint8Array)
     * @returns {RingBuffer} The created ring buffer
     */
    createBuffer(bufferId, width, height, channels, maxFrames, componentType) {
        if (this.buffers.has(bufferId)) {
            throw new Error(`Buffer ${bufferId} already exists`);
        }

        const frameSize = width * height * channels;
        const totalSize = frameSize * maxFrames;
        const sab = RingBuffer.getStorageForCapacity(totalSize, componentType);
        const buffer = new RingBuffer(sab, componentType);

        // Store buffer info
        this.buffers.set(bufferId, {
            buffer,
            width,
            height,
            channels,
            frameSize,
            maxFrames,
            componentType
        });

        // Initialize consumer and pipeline sets
        this.consumers.set(bufferId, new Set());
        this.pipelines.set(bufferId, null);

        return buffer;
    }

    /**
     * Get an existing buffer
     * @param {string} bufferId Buffer identifier
     * @returns {RingBuffer} The requested buffer
     */
    getBuffer(bufferId) {
        const bufferInfo = this.buffers.get(bufferId);
        if (!bufferInfo) {
            throw new Error(`Buffer ${bufferId} not found`);
        }
        return bufferInfo.buffer;
    }

    /**
     * Register a consumer for a buffer
     * @param {string} bufferId Buffer identifier
     * @param {Object} consumer Consumer object
     */
    registerConsumer(bufferId, consumer) {
        if (!this.consumers.has(bufferId)) {
            throw new Error(`Buffer ${bufferId} not found`);
        }
        this.consumers.get(bufferId).add(consumer);
    }

    /**
     * Register a pipeline for a buffer
     * @param {string} bufferId Buffer identifier
     * @param {Object} pipeline Pipeline object
     */
    registerPipeline(bufferId, pipeline) {
        if (!this.buffers.has(bufferId)) {
            throw new Error(`Buffer ${bufferId} not found`);
        }
        this.pipelines.set(bufferId, pipeline);
    }

    /**
     * Get buffer information
     * @param {string} bufferId Buffer identifier
     * @returns {Object} Buffer information
     */
    getBufferInfo(bufferId) {
        return this.buffers.get(bufferId);
    }

    /**
     * Get all consumers for a buffer
     * @param {string} bufferId Buffer identifier
     * @returns {Set} Set of consumers
     */
    getConsumers(bufferId) {
        return this.consumers.get(bufferId);
    }

    /**
     * Get the pipeline for a buffer
     * @param {string} bufferId Buffer identifier
     * @returns {Object} Pipeline object
     */
    getPipeline(bufferId) {
        return this.pipelines.get(bufferId);
    }

    /**
     * Remove a buffer and clean up its resources
     * @param {string} bufferId Buffer identifier
     */
    removeBuffer(bufferId) {
        this.buffers.delete(bufferId);
        this.consumers.delete(bufferId);
        this.pipelines.delete(bufferId);
    }
}

// Create singleton instance
export const bufferManager = new BufferManager();