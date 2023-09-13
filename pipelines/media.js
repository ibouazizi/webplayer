importScripts( '../constants.js' );
importScripts( '../third_party/ringbufjs/ringbuf.js' );
 
 /**
 * Generic Pipeline for a MPEG_media item
 */   
class MediaPipeline {

 constructor( mimeType, uri, bufferCapacity, type, componentType, options ) {
    this.mimeType = mimeType;           // media mimeType
    this.uri = uri;                     // media URI
    this.bufferCapacity = bufferCapacity; // max number of elements in buffer 
    this.type = type;                   // accessor data type (buffer elements)
    this.componentType = componentType; // accessor component type 
    this.options = options;             // options for media playback
    this.isPlaying = false;             // pipeline is currently active

    let sab = RingBuffer.getStorageForCapacity( 
        this.bufferCapacity,
        GL_COMPONENT_TYPES[this.componentType] );

    this.buffer = new RingBuffer( sab, GL_COMPONENT_TYPES[this.componentType] );

 }

 // implement more functions here as needed ..
}