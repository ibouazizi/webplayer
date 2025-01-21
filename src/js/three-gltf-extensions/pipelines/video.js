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

import 'mp4box';
import './format_converter.js';
import './media.js';
import './constants.js';
import { bufferManager } from '../utils/buffer_manager.js';

// Create a promise that resolves when OpenCV is ready
let opencvReady = new Promise((resolve) => {
    self.onOpenCvReady = () => {
        resolve();
    };
});

import '../third_party/opencv/4.8.0/opencv.js';


// listen for an initialization message from main
self.addEventListener( "message", async function( msg ) {
    switch( msg.data.command ) {
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

            // initialize pipeline with buffer manager
            const bufferId = `video-${msg.data.textureIndex}`;
            await pipeline.initialize(msg.data.sab);
            
            // Register pipeline with buffer manager
            bufferManager.registerPipeline(bufferId, pipeline);

            break;

        default:
            console.warn( "unexpected message from main thread" );
            break;
    }
}, {once: true} );


/**
 *  Pipeline class to prepare video frames from an MPEG_media
 *  source for rendering ( audio handled seperately )
 */   
class MP4VideoPipeline extends MediaPipeline {

    constructor( uri, track, type, componentType, width, height, format, options ) {
        super( 'video/mp4', uri, type, componentType, options );
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
    async initialize( sab ) {
        // Wait for OpenCV to be ready
        await opencvReady;

        // initialize RingBuffer
        super.initialize( sab );

        // Calculate frame size in bytes (RGBA = 4 channels)
        this.frameSize = this.height * this.width * 4;
        
        // Calculate maximum number of frames the buffer can hold
        this.maxBufferFrames = Math.floor(this.buffer.capacity() / this.frameSize);
        
        // Verify buffer can hold at least 2 frames as per spec
        if (this.maxBufferFrames < 2) {
            throw new Error(`Ring buffer too small. Capacity: ${this.buffer.capacity()} bytes, ` +
                          `Frame size: ${this.frameSize} bytes, Can hold: ${this.maxBufferFrames} frames`);
        }
        
        debugLog('Ring buffer initialized:', {
            bufferCapacity: this.buffer.capacity(),
            frameSize: this.frameSize,
            maxFrames: this.maxBufferFrames,
            dimensions: `${this.width}x${this.height}`,
            channels: 4
        });

        // spec declares buffer must hold >= 2 frames
        console.assert( this.maxBufferFrames >= 2 );

        // dynamic import demuxer
        let demuxerModule = await import( './demuxer/mp4_pull_demuxer.js' );
        // attach to pipeline
        this.demuxer = new demuxerModule.MP4PullDemuxer( this.uri );
        await this.demuxer.initialize( VIDEO_STREAM_TYPE ); // ! silent error here if bad uri !
        const config = this.demuxer.getDecoderConfig();
        
        // attach a VideoDecoder to this pipeline
        this.decoder = new VideoDecoder({ 
            output: this.bufferFrame.bind( this ),
            error: e => console.error( e ),
        });

        // check for codec support
        // TODO: this should check MPEG_media properties..
        let support = await VideoDecoder.isConfigSupported( config );
        console.assert( support.supported );

        // confiure decoder
        this.decoder.configure( config );

        debugLog( config );

        // init OpenCV memory to process frames
        // TODO: determine Mat size based on pixel format
        //      need height and width format dependent
        //      need  OpenCV type constant, # channels dependent
        // see format_converter.js

        // Create OpenCV Mats only after OpenCV is ready
        if (!self.cv) {
            throw new Error('OpenCV not initialized');
        }
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
        setInterval( this.fillFrameBuffer.bind( this ), FPS );
    }

    async fillFrameBuffer() {
        if (this.buffer.full()) {
            debugLog('frame buffer full');
            return;
        }

        // we may already be awaiting a demuxer read (only one at a time)
        if( this.fillInProgress ) {
            return false;
        }

        this.fillInProgress = true;

        while( this.buffer.available_write() >= 0 && 
            this.decoder.decodeQueueSize < this.maxBufferFrames ) {
                let chunk = await this.demuxer.getNextChunk();
                this.decoder.decode( chunk );
        }

        this.fillInProgress = false;

        // give decoder a cance to work
        // setTimeout( this.fillFrameBuffer.bind(this), 0 );
        return;
    }

    // bound to the VideoDecoder.
    // process an individual frame and push into the buffer
    // MAYBE: implement timing logic here?
    async bufferFrame(frame) {
        try {
            // Verify frame dimensions match expected size
            const needsResize = frame.displayWidth !== this.width || frame.displayHeight !== this.height;
            if (needsResize) {


                // Create resized input mat if needed
                if (!this.resizedInputMat || 
                    this.resizedInputMat.cols !== this.width || 
                    this.resizedInputMat.rows !== this.height * 1.5) {
                    if (this.resizedInputMat) {
                        this.resizedInputMat.delete();
                    }

                    this.resizedInputMat = new self.cv.Mat(this.height * 1.5, this.width, COLOR_CODES.CV_8UC1);
                }
            }

            // Copy frame data to input mat
            await frame.copyTo(this.inputMat.data);


            // Resize if needed
            const sourceMat = needsResize
                ? await this.resizeFrame(this.inputMat, this.resizedInputMat)
                : this.inputMat;

            // Convert YUV to RGBA (required for sRGB encoding)


            const rgbMat = new self.cv.Mat();
            
            // First convert to RGB
            await self.cv.cvtColor(sourceMat, rgbMat, COLOR_CODES.COLOR_YUV2RGB_NV12);

            
            // Then convert to RGBA
            await self.cv.cvtColor(rgbMat, this.outputMat, self.cv.COLOR_RGB2RGBA);
    

            // Verify output format and size
            const expectedSize = this.width * this.height * 4;
            if (this.outputMat.data.length !== expectedSize) {
                const error = `Output size mismatch: got ${this.outputMat.data.length} bytes, expected ${expectedSize} bytes`;
                console.error(error);
                throw new Error(error);
            }

            // Verify buffer space
            const availableSpace = this.buffer.available_write();


            if (availableSpace < this.frameSize) {
                const error = `Insufficient buffer space: need ${this.frameSize}, have ${availableSpace}`;
                console.error(error);
                throw new Error(error);
            }

            // Push frame to circular buffer
            const bytesWritten = await this.buffer.push(this.outputMat.data);

            if (bytesWritten !== this.frameSize) {
                const error = `Buffer write incomplete: wrote ${bytesWritten} of ${this.frameSize} bytes`;
                console.error(error);
                throw new Error(error);
            }

            // Clean up
            rgbMat.delete();

        } catch (error) {
            console.error('Frame processing failed:', error);
        } finally {
            frame.close();
        }
    }

    async resizeFrame(sourceMat, targetMat) {

        // Create temporary mats for resizing
        const tempMat = new self.cv.Mat();
        try {
            // Resize YUV data
            const targetSize = new self.cv.Size(this.width, this.height * 1.5);

            self.cv.resize(
                sourceMat,
                tempMat,
                targetSize,
                0,
                0,
                self.cv.INTER_LINEAR
            );

            // Copy to target
            tempMat.copyTo(targetMat);

            return targetMat;
        } catch (error) {
            console.error('Resize operation failed:', error);
            throw error;
        } finally {
            tempMat.delete();
        }
    }
      }

    // implement more video specific functions here as needed ..