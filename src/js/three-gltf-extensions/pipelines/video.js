/**
 * WebWorker script for MPEG_texture_video
 */

const ENABLE_DEBUG_LOGGING = true;

const FPS = 1000 / 6;  // check buffer health at the given interval

function debugLog(msg) {
    if (!ENABLE_DEBUG_LOGGING)
        return;
    console.debug(msg);
}

importScripts('../../node_modules/mp4box/dist/mp4box.all.min.js');
importScripts('./format_converter.js');
importScripts('./media.js');
importScripts('./constants.js');

// Create a promise that resolves when OpenCV is ready
let opencvReady = new Promise((resolve) => {
    self.onOpenCvReady = () => {
        console.log('OpenCV.js is ready in worker');
        resolve();
    };
});

importScripts('../third_party/opencv/4.8.0/opencv.js');

// listen for an initialization message from main
self.addEventListener("message", async function(msg) {
    switch(msg.data.command) {
        case 'initialize':
            // allocate a new video pipeline
            let pipeline = new MP4VideoPipeline(
                msg.data.uri,
                msg.data.track,
                msg.data.type,
                msg.data.componentType,
                msg.data.width,
                msg.data.height,
                msg.data.options
            );

            // initialize pipeline
            await pipeline.initialize(msg.data.sab);

            break;

        default:
            console.warn("unexpected message from main thread");
            break;
    }
}, {once: true});

/**
 *  Pipeline class to prepare video frames from an MPEG_media
 *  source for rendering (audio handled separately)
 */   
class MP4VideoPipeline extends MediaPipeline {
    constructor(uri, track, type, componentType, width, height, format, options) {
        super('video/mp4', uri, type, componentType, options);
        this.track = track; // TODO: implement which video track to use

        // video frame dimensions
        // should match VideoFrame.displayHeight and VideoFrame.displayWidth
        // MAYBE: support resizing?
        this.height = height;
        this.width = width;
        this.format = format; // output pixel format for MPEG_texture_video
        this.maxBufferFrames = null;
    }

    // set the pipeline up for demuxing and decoding frames
    async initialize(sab) {
        // Wait for OpenCV to be ready
        await opencvReady;

        // Calculate buffer size for RGBA frames (4 bytes per pixel)
        const bytesPerPixel = 4;
        const frameSize = this.height * this.width * bytesPerPixel;

        // Initialize RingBuffer with the same parameters as the main thread
        this.buffer = new RingBuffer(sab, Uint8Array);
        this.maxBufferFrames = Math.floor(this.buffer.capacity() / frameSize);

        debugLog('[Worker] Buffer initialized:', {
            capacity: this.buffer.capacity(),
            availableWrite: this.buffer.available_write(),
            frameSize: frameSize,
            maxFrames: this.maxBufferFrames,
            sab: sab.byteLength
        });

        // spec declares buffer must hold >= 2 frames
        console.assert(this.maxBufferFrames >= 2);

        // dynamic import demuxer
        let demuxerModule = await import('./demuxer/mp4_pull_demuxer.js');
        // attach to pipeline
        this.demuxer = new demuxerModule.MP4PullDemuxer(this.uri);
        await this.demuxer.initialize(VIDEO_STREAM_TYPE); // ! silent error here if bad uri !
        const config = this.demuxer.getDecoderConfig();
        
        // attach a VideoDecoder to this pipeline
        this.decoder = new VideoDecoder({ 
            output: this.bufferFrame.bind(this),
            error: e => console.error(e),
        });

        // check for codec support
        // TODO: this should check MPEG_media properties..
        let support = await VideoDecoder.isConfigSupported(config);
        console.assert(support.supported);

        // configure decoder
        this.decoder.configure(config);

        debugLog(config);

        // init OpenCV memory to process frames
        // Create input mat for YUV data (NV12 format)
        this.inputMat = new self.cv.Mat(this.height * 1.5, this.width, COLOR_CODES.CV_8UC1);
        // Create output mat for RGBA (4 channels, 8-bit unsigned)
        this.outputMat = new self.cv.Mat(this.height, this.width, COLOR_CODES.CV_8UC4);

        // Create debug canvas
        const canvas = new OffscreenCanvas(this.width, this.height);
        this.debugCanvas = canvas;
        this.debugCtx = canvas.getContext('2d');

        debugLog('Created OpenCV matrices:', {
            input: {
                size: [this.inputMat.rows, this.inputMat.cols],
                type: this.inputMat.type(),
                channels: this.inputMat.channels()
            },
            output: {
                size: [this.outputMat.rows, this.outputMat.cols],
                type: this.outputMat.type(),
                channels: this.outputMat.channels()
            }
        });

        // start to fill the buffer
        // MAYBE: adapt to display rate
        setInterval(this.fillFrameBuffer.bind(this), FPS);
    }

    async fillFrameBuffer() {
        if (this.buffer.full()) {
            debugLog('frame buffer full');
            return;
        }

        // we may already be awaiting a demuxer read (only one at a time)
        if (this.fillInProgress) {
            return false;
        }

        this.fillInProgress = true;

        while (this.buffer.available_write() >= 0 && 
            this.decoder.decodeQueueSize < this.maxBufferFrames) {
                let chunk = await this.demuxer.getNextChunk();
                this.decoder.decode(chunk);
        }

        this.fillInProgress = false;
        return;
    }

    // bound to the VideoDecoder.
    // process an individual frame and push into the buffer
    // MAYBE: implement timing logic here?
    async bufferFrame(frame) {
        debugLog(`bufferFrame(${frame.timestamp})`);

        await frame.copyTo(this.inputMat.data);

        // Convert YUV to RGBA (required for sRGB encoding)
        try {
            // First convert to RGB
            const rgbMat = new self.cv.Mat();
            await self.cv.cvtColor(this.inputMat, rgbMat, COLOR_CODES.COLOR_YUV2RGB_NV12);

            // Then convert to RGBA
            await self.cv.cvtColor(rgbMat, this.outputMat, self.cv.COLOR_RGB2RGBA);
            
            // Verify output format
            debugLog('Color conversion successful');
            debugLog('Output Mat:', {
                channels: this.outputMat.channels(),
                type: this.outputMat.type(),
                size: this.outputMat.size(),
                dataLength: this.outputMat.data.length,
                firstPixel: Array.from(new Uint8Array(this.outputMat.data.buffer, 0, 4))
            });

            // Clean up temporary matrix
            rgbMat.delete();

            // Debug logging only
            if (ENABLE_DEBUG_LOGGING) {
                const firstPixel = new Uint8Array(this.outputMat.data.buffer, 0, 4);
                debugLog('First pixel RGBA:', Array.from(firstPixel));
            }

        } catch (error) {
            console.error('Color conversion failed:', error);
        }

        // Verify buffer state before pushing
        debugLog('[Buffer] Pre-push state:', {
            availableWrite: this.buffer.available_write(),
            frameSize: this.outputMat.data.length,
            outputChannels: this.outputMat.channels(),
            outputType: this.outputMat.type()
        });

        try {
            // Convert Mat data to Uint8Array for RGBA
            const frameData = new Uint8Array(this.outputMat.data.buffer);
            
            // Verify frame data before pushing
            debugLog('[Worker] Frame data:', {
                length: frameData.length,
                firstPixel: Array.from(frameData.slice(0, 4)),
                availableWrite: this.buffer.available_write(),
                capacity: this.buffer.capacity()
            });

            // Verify buffer has space
            if (this.buffer.available_write() < frameData.length) {
                debugLog('[Worker] Buffer full, skipping frame');
                return;
            }

            // push converted frame to circular buffer in chunks
            let written = 0;
            const chunkSize = 16384; // 16KB chunks to avoid blocking
            
            for (let offset = 0; offset < frameData.length; offset += chunkSize) {
                const chunk = frameData.slice(offset, Math.min(offset + chunkSize, frameData.length));
                const chunkWritten = await this.buffer.push(chunk);
                written += chunkWritten;
                
                // Verify chunk write
                debugLog('[Worker] Chunk write:', {
                    offset,
                    chunkSize: chunk.length,
                    written: chunkWritten,
                    totalWritten: written,
                    remaining: frameData.length - written
                });
                
                // Small delay to allow other operations
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            // Verify final push result
            debugLog('[Worker] Push complete:', {
                written,
                frameSize: frameData.length,
                availableWrite: this.buffer.available_write(),
                availableRead: this.buffer.available_read(),
                capacity: this.buffer.capacity()
            });

            if (written !== frameData.length) {
                console.error('[Worker] Warning: Incomplete frame write', {
                    written,
                    expected: frameData.length
                });
            }
        } catch (error) {
            console.error('[Worker] Frame push error:', error);
        }

        frame.close();
    }
}