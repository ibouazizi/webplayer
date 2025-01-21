// Implementation of the Buffer API as per MPEG-I specifications

class Frame {
    constructor(index, sharedBuffer, frameOffset, frameSize, metadataBuffer, metadataOffset) {
        this.index = index;
        // Frame data in shared memory
        this.data = new Uint8Array(sharedBuffer, frameOffset, frameSize);
        // Metadata in shared memory for thread-safe access
        const metadataView = new DataView(metadataBuffer, metadataOffset);
        
        // Getters/setters for metadata using Atomic operations
        Object.defineProperties(this, {
            timestamp: {
                get: () => {
                    const high = Atomics.load(new BigInt64Array(metadataBuffer, metadataOffset), 0);
                    const low = Atomics.load(new BigInt64Array(metadataBuffer, metadataOffset + 8), 0);
                    return (high << 32n) | low;
                },
                set: (value) => {
                    const high = value >> 32n;
                    const low = value & 0xFFFFFFFFn;
                    Atomics.store(new BigInt64Array(metadataBuffer, metadataOffset), 0, high);
                    Atomics.store(new BigInt64Array(metadataBuffer, metadataOffset + 8), 0, low);
                }
            },
            length: {
                get: () => Atomics.load(new Int32Array(metadataBuffer, metadataOffset + 16), 0),
                set: (value) => Atomics.store(new Int32Array(metadataBuffer, metadataOffset + 16), 0, value)
            },
            extraFrameInfo: {
                get: () => ({
                    width: Atomics.load(new Int32Array(metadataBuffer, metadataOffset + 20), 0),
                    height: Atomics.load(new Int32Array(metadataBuffer, metadataOffset + 24), 0)
                }),
                set: (value) => {
                    Atomics.store(new Int32Array(metadataBuffer, metadataOffset + 20), 0, value.width);
                    Atomics.store(new Int32Array(metadataBuffer, metadataOffset + 24), 0, value.height);
                }
            }
        });
    }
}

export class CircularBuffer {
    #frames = [];
    #count = 0;
    #headerLength = 0;
    #onframewrite = null;
    #onframeread = null;
    #sharedBuffer = null;
    #metadataBuffer = null;
    #indexBuffer = null;
    #frameSize = 0;
    #metadataSize = 28; // 16 bytes timestamp + 4 bytes length + 8 bytes extraFrameInfo

    constructor() {
        // Initialize with default values
        this.#frames = [];
        this.#count = 0;
        
        // Create shared buffer for read/write indices
        this.#indexBuffer = new SharedArrayBuffer(8); // 2 x 32-bit integers for read/write indices
    }

    // Getters for readonly attributes using atomic operations
    get read_idx() {
        return Atomics.load(new Int32Array(this.#indexBuffer), 0);
    }

    get write_idx() {
        return Atomics.load(new Int32Array(this.#indexBuffer), 1);
    }

    // Helper method to update indices atomically
    #updateReadIndex(value) {
        return Atomics.store(new Int32Array(this.#indexBuffer), 0, value);
    }

    #updateWriteIndex(value) {
        return Atomics.store(new Int32Array(this.#indexBuffer), 1, value);
    }

    #waitOnWriteIndex() {
        const currentIdx = this.write_idx;
        return Atomics.wait(new Int32Array(this.#indexBuffer), 1, currentIdx);
    }

    #notifyNewFrame() {
        Atomics.notify(new Int32Array(this.#indexBuffer), 1, 1);
    }

    // Getters for readonly attributes
    get frames() {
        return [...this.#frames]; // Return a copy to maintain encapsulation
    }

    get count() {
        return this.#count;
    }

    get read_idx() {
        return this.#readIdx;
    }

    get write_idx() {
        return this.#writeIdx;
    }

    // Header length getter/setter
    get headerLength() {
        return this.#headerLength;
    }

    set headerLength(value) {
        this.#headerLength = value;
    }

    // Event handlers
    get onframewrite() {
        return this.#onframewrite;
    }

    set onframewrite(handler) {
        this.#onframewrite = handler;
    }

    get onframeread() {
        return this.#onframeread;
    }

    set onframeread(handler) {
        this.#onframeread = handler;
    }

    /**
     * Allocates a circular buffer with the specified number of frames and frame size
     * @param {number} count - Number of frames to allocate
     * @param {number} frameSize - Size of each frame in bytes
     */
    allocate(count, frameSize) {
        if (count <= 0) {
            throw new Error('Count must be greater than 0');
        }
        if (frameSize <= 0) {
            throw new Error('Frame size must be greater than 0');
        }

        this.#count = count;
        this.#frameSize = frameSize;

        // Create shared buffers
        const totalDataSize = count * frameSize;
        const totalMetadataSize = count * this.#metadataSize;
        
        try {
            this.#sharedBuffer = new SharedArrayBuffer(totalDataSize);
            this.#metadataBuffer = new SharedArrayBuffer(totalMetadataSize);
        } catch (e) {
            throw new Error('SharedArrayBuffer allocation failed. Make sure Cross-Origin Isolation is enabled.');
        }

        // Initialize indices
        this.#updateReadIndex(0);
        this.#updateWriteIndex(0);

        // Initialize frames with shared memory views
        this.#frames = new Array(count);
        for (let i = 0; i < count; i++) {
            const frameOffset = i * frameSize;
            const metadataOffset = i * this.#metadataSize;
            this.#frames[i] = new Frame(
                i,
                this.#sharedBuffer,
                frameOffset,
                frameSize,
                this.#metadataBuffer,
                metadataOffset
            );
        }
    }

    /**
     * Writes a frame to the buffer
     * @param {object} frameData - Frame data to write
     * @param {Uint8Array} frameData.data - The actual frame data
     * @param {bigint} frameData.timestamp - Frame timestamp
     * @param {object} frameData.extraFrameInfo - Extra frame information
     */
    writeFrame(frameData) {
        if (this.#count === 0) {
            throw new Error('Buffer not allocated');
        }

        const writeIdx = this.write_idx;
        const nextWriteIdx = (writeIdx + 1) % this.#count;

        // Check if buffer is full using atomic operations
        if (nextWriteIdx === this.read_idx) {
            throw new Error('Buffer full');
        }

        const frame = this.#frames[writeIdx];

        // Copy frame data using typed array
        new Uint8Array(frame.data.buffer).set(frameData.data);
        frame.timestamp = frameData.timestamp;
        frame.length = frameData.data.length;
        frame.extraFrameInfo = frameData.extraFrameInfo;

        // Update write index atomically
        this.#updateWriteIndex(nextWriteIdx);
        
        // Notify waiting readers
        this.#notifyNewFrame();

        // Trigger onframewrite event
        if (this.#onframewrite) {
            this.#onframewrite(frame);
        }
    }

    /**
     * Reads a frame from the buffer
     * @param {bigint} [timestamp] - Optional timestamp for random access
     * @returns {Frame} The read frame
     */
    async readFrame(timestamp = null) {
        if (this.#count === 0) {
            throw new Error('Buffer not allocated');
        }

        // If buffer is empty, wait for new frame
        while (this.read_idx === this.write_idx) {
            const result = this.#waitOnWriteIndex();
            if (result === 'timed-out') {
                throw new Error('Buffer read timeout');
            }
        }

        let frameToRead;
        const readIdx = this.read_idx;

        if (timestamp !== null) {
            // Find frame with matching timestamp
            for (let i = 0; i < this.#count; i++) {
                const frame = this.#frames[i];
                if (frame.timestamp === timestamp) {
                    frameToRead = frame;
                    break;
                }
            }
            if (!frameToRead) {
                throw new Error('Frame with specified timestamp not found');
            }
        } else {
            // Read next frame in sequence
            frameToRead = this.#frames[readIdx];
            this.#updateReadIndex((readIdx + 1) % this.#count);
        }

        // Trigger onframeread event
        if (this.#onframeread) {
            this.#onframeread(frameToRead);
        }

        return frameToRead;
    }

    /**
     * Releases a frame at the specified index
     * @param {number} index - Index of frame to release
     */
    releaseFrame(index) {
        if (index < 0 || index >= this.#count) {
            throw new Error('Invalid frame index');
        }

        const frame = this.#frames[index];
        frame.length = 0;
        // No need to clear data buffer as it will be overwritten
    }

    /**
     * Frees the buffer and associated resources
     */
    free() {
        this.#frames = [];
        this.#count = 0;
        this.#updateReadIndex(0);
        this.#updateWriteIndex(0);
        this.#headerLength = 0;
        this.#onframewrite = null;
        this.#onframeread = null;
        // SharedArrayBuffers will be garbage collected when no references remain
        this.#sharedBuffer = null;
        this.#metadataBuffer = null;
    }
}