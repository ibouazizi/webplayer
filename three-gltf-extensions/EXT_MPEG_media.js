/**
*   MPEG_media Extension
*   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_media
*         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_media
*   MPEG_media provides an array of MPEG media items referenced by other extensions in glTF document.
*/
export default class GLTFMPEGMediaExtension {
    
    constructor( parser ) {
        this.name = 'MPEG_media';
        this.parser = parser;
    }

    // called during parse by GLTFLoader
    afterRoot( gltf ) {
        const parser = this.parser;
        const json = parser.json;

        // will return null if outer "extensions" does not contain MPEG_media
        if ( !json.extensions || !json.extensions[ this.name ] ) {
            return null;
        }

        // MPEG Media extension
        const mediaEXT = json.extensions[ this.name ];

        if( !mediaEXT.media || mediaEXT.media.length <= 0 ) {
            console.warn( 'THREE.GLTFLoader.MPEG_media: missing required property "media" ' );
            return null;
        }

        // handle each entry in MPEG_media.media
        for( const mediaIndex in mediaEXT.media ) {
            
            // an array of alternatives of the same media (e.g. different codecs used)
            if( !mediaEXT.media[ mediaIndex ].alternatives || 
                mediaEXT.media[ mediaIndex ].alternatives.length <= 0 ) {
                    console.warn( 'THREE.GLTFLoader.MPEG_media.media[ ' + 
                        mediaIndex + ' ] : missing required property "alternatives" ' );
                    return null;
            }

            const currentMedia = mediaEXT.media[ mediaIndex ];

            // console.log( currentMedia );

            console.log( document );

            // step through this media's properties
            for( const key in currentMedia ) {
                if( currentMedia.hasOwnProperty( key ) ) {
                    console.log( key );
                    // console.log( currentMedia[ key ] );
                }
            }


        }
    }
}