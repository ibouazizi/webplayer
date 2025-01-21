import { CircularBuffer } from './CircularBuffer.js';

// Test suite for CircularBuffer
async function runTests() {
    console.log('Starting CircularBuffer tests...');

    try {
        // Test allocation
        const buffer = new CircularBuffer();
        const frameSize = 1024; // 1KB per frame
        buffer.allocate(3, frameSize);
        console.assert(buffer.count === 3, 'Buffer allocation failed');
        console.assert(buffer.read_idx === 0, 'Initial read index should be 0');
        console.assert(buffer.write_idx === 0, 'Initial write index should be 0');

        // Test frame writing
        const frame1Data = {
            timestamp: 1n,
            data: new Uint8Array([1, 2, 3, 4]),
            extraFrameInfo: { width: 100, height: 100 }
        };

        buffer.writeFrame(frame1Data);
        console.assert(buffer.write_idx === 1, 'Write index should increment after write');

        // Test frame reading
        const readFrame = await buffer.readFrame();
        console.assert(readFrame.timestamp === 1n, 'Frame timestamp mismatch');
        console.assert(readFrame.length === 4, 'Frame length mismatch');
        console.assert(readFrame.data.slice(0, 4).every((val, idx) => val === frame1Data.data[idx]), 'Frame data mismatch');
        console.assert(readFrame.extraFrameInfo.width === 100, 'Frame width mismatch');
        console.assert(readFrame.extraFrameInfo.height === 100, 'Frame height mismatch');

        // Test timestamp-based reading
        const frame2Data = {
            timestamp: 2n,
            data: new Uint8Array([5, 6]),
            extraFrameInfo: { width: 200, height: 200 }
        };

        buffer.writeFrame(frame2Data);
        const timestampFrame = await buffer.readFrame(2n);
        console.assert(timestampFrame.timestamp === 2n, 'Timestamp-based read failed');
        console.assert(timestampFrame.data.slice(0, 2).every((val, idx) => val === frame2Data.data[idx]), 'Frame data mismatch');

        // Test concurrent access
        const writer = async () => {
            const frame3Data = {
                timestamp: 3n,
                data: new Uint8Array([7, 8, 9]),
                extraFrameInfo: { width: 300, height: 300 }
            };
            buffer.writeFrame(frame3Data);
            return frame3Data;
        };

        const reader = async () => {
            return await buffer.readFrame();
        };

        // Run concurrent read/write operations
        const [writeResult, readResult] = await Promise.all([writer(), reader()]);
        console.assert(readResult.timestamp === writeResult.timestamp, 'Concurrent access failed');

        // Test frame release
        buffer.releaseFrame(0);
        console.assert(buffer.frames[0].length === 0, 'Frame release failed');

        // Test buffer free
        buffer.free();
        console.assert(buffer.count === 0, 'Buffer free failed');

        console.log('All tests completed successfully!');
    } catch (error) {
        console.error('Test failed:', error);
        throw error;
    }
}

// Check if SharedArrayBuffer is available
if (typeof SharedArrayBuffer === 'undefined') {
    console.error('SharedArrayBuffer is not available. Make sure Cross-Origin Isolation is enabled.');
} else {
    // Run the tests
    runTests().catch(console.error);
}