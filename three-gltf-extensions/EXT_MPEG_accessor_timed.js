/**
*   MPEG_accessor_timed Extension
*   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_accessor_timed
*         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_accessor_timed
*/
export class GLTFMPEGAccessorTimedExtension {

    constructor( parser ) {
        this.name = 'MPEG_accessor_timed';
        this.parser = parser;
    }

    loadAccessor( accessorIndex ) {

        const parser = this.parser;
		const json = parser.json;
        const accessorDef = json.accessors[ accessorIndex ];

        if ( !accessorDef.extensions || !accessorDef.extensions[ this.name ] ) {
            return null;
        }

        if ( accessorDef.bufferView === undefined ) {
            console.warn( 'no bufferView was specified for accessor ', accessorIndex );
            // TODO: assume buffer of minimum size ( count: 2 ) here?
        }

        // here we are bypassing the normal dependency chain 
        // from accessor --> bufferView --> buffer
        // to
        // accessor --> buffer
        // as parser.loadBufferView() makes a copy and
        // we want to directly access the circular buffer
        // we'll use the bufferView's properties to determine which buffer to access
        // but we won't call `this.getDependency( 'bufferView ... ` at this point
        // see note at the bottom..

        return parser.getDependency( 'buffer', json.bufferViews[ accessorDef.bufferView ].buffer ).then( buffer => {

            // typically, loadAccessor() returns a `BufferAttribute` object, which stores data
            // for `BufferGeometry`. However, we need a direct reference to a SharedArrayBuffer
            // in order to instantiate a pipeline, and we may be referring non-geometry media (audio, video..)
            // so we'll just pass the buffer along here. This implies undefined behavior if a 
            // non-timed object references this accesor
            
            // buffer: reference to shared memory
            // byteLength: amount of buffer to access at a time (i.e. frame size)
            // properties: parsed accessor properties
            return {
                buffer: buffer.buffer,
                byteLength: buffer.properties.byteLength,
                properties: accessorDef
            };
        });
    }
}

/**
 * a case to consider: byteLength differs between bufferView.byteLength and 
 * buffer.byteLength for the timed media.
 * 
 * we assume:
 * bufferView.byteLength == buffer.byteLength 
 * and 
 * bufferView.byteOffset == 0
 * 
 * Here we make the asumption here that the "view" of a circular buffer is always a complete
 * "frame" of whatever media is being decoded (i.e. full video or audio frame, etc.).
 * That is to say, the rendering engine is not using some subset of the data, every byte in the 
 * buffer is consumed/presented. 
 * 
 * note that the spec states that the MPEG_accessor_timed extension may have its own bufferView 
 * property to specify a view of the underlaying data (but must point to same buffer)
 * TODO: handle this case
 * 
 * in order to for the corresponding bufferView (from the accessor containing this extension) to 
 * point to the circular buffer, either
 *     a) the loadBufferView() implementation could support a pass-by-reference approach,
 *          such that the actual [Shared]ArrayBuffer is passed along
 *     b) it could conditionally handle the case where the buffer its referencing has the circular
 *          buffer extension
 */
