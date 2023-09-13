/**
 *  Each MediaPipeline variant should be ran in its own webworker 
 *  to seperate the work for each pipeline.
 * 
 *  For this reason, we will not use a "driver" script to house the 
 *  demuxing / decoding classes and each pipeline will need to handle
 *  any communication with the main thread
 * 
 *  as mentioned in the webcodecs samples, mp4box.js does not use ES6 modules,
 *  and as such we must use `importScripts` or dynamic module imports.
 */

const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
    if (!ENABLE_DEBUG_LOGGING)
        return;
    console.debug(msg);
}

importScripts('../node_modules/mp4box/dist/mp4box.all.min.js');
importScripts('../third_party/opencv/4.8.0/opencv.js');
importScripts('./format_converter.js');
importScripts('./media.js');

/**
 *  Pipeline class to prepare video frames from an MPEG_media
 *  source for rendering ( audio handled seperately )
 */   
class MP4VideoPipeline extends MediaPipeline {

    constructor( uri, bufferCapacity, type, componentType, track, width, height, format, options ) {
        super( 'video/mp4', uri, bufferCapacity, type, componentType, options );
        this.track = track; // TODO: implement which video track to use

        // video frame dimensions
        // should match VideoFrame.displayHeight and VideoFrame.displayWidth
        // TODO: support resizing?
        this.height = height;
        this.width = width;
        this.format = format; // output pixel format for MPEG_texture_video

        // buffer size (in video frames)
        this.maxBufferFrames = bufferCapacity / 
            ( height * width * 
                GL_COMPONENT_TYPES[this.componentType].BYTES_PER_ELEMENT *
                GL_TYPE_SIZES[this.type] );

        console.assert( this.maxBufferFrames >= 2 );
    }

    // set the pipeline up for demuxing and decoding frames
    async initialize() {
        // dynamic import demuxer
        let demuxerModule = await import( './demuxer/mp4_pull_demuxer.js' );
        // attach to pipeline
        this.demuxer = new demuxerModule.MP4PullDemuxer( this.uri );
        await this.demuxer.initialize( VIDEO_STREAM_TYPE ); // silent error here if bad path!!
        const config = this.demuxer.getDecoderConfig();
        
        // attach a VideoDecoder to this pipeline
        this.decoder = new VideoDecoder({ 
            output: this.bufferFrame.bind( this ),
            error: e => console.error( e ),
        });

        // check for codec support
        let support = await VideoDecoder.isConfigSupported( config );
        console.assert( support.supported );
        
        this.decoder.configure( config );

        debugLog( config );

        // init OpenCV memory to process frames
        // TODO: determine Mat size based on pixel format
        //      need height and width format dependent
        //      need  OpenCV type constant, # channels dependent

        this.inputMat = new cv.Mat( this.height * 1.5, this.width, cv.CV_8UC1 );
        this.outputMat = new cv.Mat( this.height, this.width, cv.CV_8UC3 );

        // start to fill the buffer
        this.fillFrameBuffer();
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

        // Give decoder a chance to work, see if we saturated the pipeline.
        setTimeout(this.fillFrameBuffer.bind( this), 0);
        return;
    }

    // bound to the VideoDecoder.
    // process an individual frame and push into the buffer
    // TODO: implement timing logic here
    async bufferFrame( frame ) {
        debugLog(`bufferFrame(${frame.timestamp})`);

        await frame.copyTo( this.inputMat.data );

        frame.close();

        // TODO: set color codes based on accessor !!
        await cv.cvtColor( this.inputMat, this.outputMat, cv.COLOR_YUV2RGB_NV12 );
        // await cv.cvtColor( this.inputMat, this.outputMat, cv.COLOR_YUV2RGBA_NV12 );

        this.buffer.push( this.outputMat.data );
      }

    // implement more video specific functions here as needed ..
}

// initialize a media pipeline for video
// let pipeline = new MP4VideoPipeline( "video/mp4", "../videos/bbb_360p_48k.mp4", 2073600, "VEC3", 5121, 0, 640, 360, {} );

// using RGBA to see if texture upload works - 3 frames of RGBA
// let pipeline = new MP4VideoPipeline( "video/mp4", "../videos/bbb_360p_48k.mp4", 2764800, "VEC4", 5121, 0, 640, 360, {} );

// 10 frames of RGBA    
// let pipeline = new MP4VideoPipeline( "video/mp4", "../videos/bbb_360p_48k.mp4", 9216000, "VEC4", 5121, 0, 640, 360, {} );

// // 3 frames of RGBA @ 1280 x 720
// let pipeline = new MP4VideoPipeline( "video/mp4", "https://w3c.github.io/webcodecs/samples/data/bbb_video_avc_frag.mp4",
// 11059200, "VEC4", 5121, 0, 1280, 720, {} );

// // 10 frames of RGBA @ 1280 x 720s
// let pipeline = new MP4VideoPipeline( "video/mp4", "https://w3c.github.io/webcodecs/samples/data/bbb_video_avc_frag.mp4",
// 36864000, "VEC4", 5121, 0, 1280, 720, {} );

// 10 frames of RGB @ 1280 x 720s
let pipeline = new MP4VideoPipeline( "https://w3c.github.io/webcodecs/samples/data/bbb_video_avc_frag.mp4",
27648000, "VEC3", 5121, 0, 1280, 720, {} );


// listen for messages from the main threads
self.addEventListener( "message", async function( msg ) {
    switch( msg.data.command ) {
        case 'initialize':
            await pipeline.initialize();
            self.postMessage({
                command:  "initialization-done",
                sab: pipeline.buffer.buf
            });
            break;

        case 'fill-buffer':
            await pipeline.fillFrameBuffer();
            break;
    }

});