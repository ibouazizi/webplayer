/**
*   MPEG_buffer_circular Extension
*   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_buffer_circular
*         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_buffer_circular
*
*    the standard loadBuffer returns an ArrayBuffer with the contents
*    of the file specified with buffer.uri
*
*    here loadBuffer() returns the circular buffer to be used
*    with MPEG_media
*/
export class GLTFMPEGBufferCircularExtension {

    constructor( parser ) {
        this.name = 'MPEG_buffer_circular';
        this.parser = parser;
    }

    loadBuffer( bufferIndex ) {
        const parser = this.parser;
		const json = parser.json;
        const bufferDef = json.buffers[ bufferIndex ];

        if ( !bufferDef.extensions || !bufferDef.extensions[ this.name ] ) {
            return null;
        }

        const bufferExtensionDef = bufferDef.extensions[ this.name ];

        // just like getStorageForCapacity()
        // allocate some extra space for buffer read/write pointers
        let bytes = 8 + 1 + ( bufferDef.byteLength * bufferExtensionDef.count );

        return Promise.resolve({
            buffer: new SharedArrayBuffer( bytes ),
            properties: bufferDef 
        });

        // TOD0: some track selection logic may need to happen here, as 'track' is specified
        // in MPEG_buffer_circular
    }
}