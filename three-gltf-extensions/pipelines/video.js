/**
 * WebWorker script for MPEG_texture_video
 */

const ENABLE_DEBUG_LOGGING = false;

const FPS = 1000 / 6;  // check buffer health at the given interval

function debugLog(msg) {
    if (!ENABLE_DEBUG_LOGGING)
        return;
    console.debug(msg);
}

importScripts('../../node_modules/mp4box/dist/mp4box.all.min.js');
importScripts('../third_party/opencv/4.8.0/opencv.js');
importScripts('./format_converter.js');
importScripts('./media.js');


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

            // initialize pipeline
            await pipeline.initialize( msg.data.sab );

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

        // initialize RingBuffer
        super.initialize( sab );

        // get buffer size (in video frames)
        this.maxBufferFrames = ( this.buffer.capacity() ) / 
            ( this.height * this.width * 
                GL_COMPONENT_TYPES[this.componentType].BYTES_PER_ELEMENT *
                GL_TYPE_SIZES[this.type] );

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

        this.inputMat = new cv.Mat( this.height * 1.5, this.width, cv.CV_8UC1 );
        this.outputMat = new cv.Mat( this.height, this.width, cv.CV_8UC3 );

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
    async bufferFrame( frame ) {
        debugLog(`bufferFrame(${frame.timestamp})`);

        await frame.copyTo( this.inputMat.data );

        // TODO: set color codes based on accessor !!
        await cv.cvtColor( this.inputMat, this.outputMat, cv.COLOR_YUV2RGB_NV12 );

        // i.e. RGBA would use:
        // await cv.cvtColor( this.inputMat, this.outputMat, cv.COLOR_YUV2RGBA_NV12 );

        // push converted frame to circular buffer
        await this.buffer.push( this.outputMat.data );

        frame.close();
      }

    // implement more video specific functions here as needed ..
}