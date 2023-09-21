/**
 *  Each MediaPipeline variant should run in its own webworker 
 *  to seperate the work for each pipeline and the main thread.
 *  ( 1 pipeline per worker )
 * 
 *  For this reason, we will not use a "driver" script to house 
 *  demuxing / decoding classes and as such each pipeline will need to handle
 *  any communication with the main thread i.e. self.addEventListener
 * 
 *  as mentioned in the webcodecs samples, mp4box.js does not use ES6 modules,
 *  and we must use `importScripts` or dynamic module imports.
 */

importScripts( '../constants.js' );
importScripts( '../third_party/ringbufjs/ringbuf.js' );
 
 /**
 * Generic Pipeline for a MPEG_media item
 */   
class MediaPipeline {

 constructor( mimeType, uri, type, componentType, options ) {
    this.mimeType = mimeType;           // media mimeType
    this.uri = uri;                     // media URI
    this.type = type;                   // accessor data type (buffer elements)
    this.componentType = componentType; // accessor component type 
    this.options = options;             // options for media playback
    this.buffer = null;                 // reference to a RingBuffer
   //  this.isPlaying = false;             // TODO: implement
 }

 // set up RingBuffer
 initialize( sab ) {
    // the underlying data buffer is allocated in MPEG_buffer_circular
    this.buffer = new RingBuffer( sab, GL_COMPONENT_TYPES[this.componentType] );
 }

 // implement more functions here as needed ..

 // i.e. play() pause() seek()
}