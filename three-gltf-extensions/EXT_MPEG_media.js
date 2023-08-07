const VALID_MIMETYPES = [
    "video/mp4"
];

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
    // populate media before traversing scene graph
    beforeRoot(  ) {
        const parser = this.parser;
        const json = parser.json;

        // will return null if outer "extensions" does not contain MPEG_media
        if( !json.extensions || !json.extensions[ this.name ] ) {
            return null;
        }

        // MPEG Media extension parsed from from .extensions
        const mediaEXT = json.extensions[ this.name ];

        if( !mediaEXT.media || mediaEXT.media.length <= 0 ) {
            console.warn( 'MPEG_media: missing required property "media" ' );
            return null;
        }

        let mediaIndex = 0; // for naming the HTML elements

        // handle each entry in the glTF under MPEG_media.media:
        for( const currentMedia of mediaEXT.media ) {
            
            // check required alternatives property
            // an array of alternatives of the same media (e.g. different codecs used)
            if( !currentMedia.alternatives || !currentMedia.alternatives.length ) {
                console.warn( 'MPEG_media.media: \
                 missing required property "alternatives" ' );
                 continue;
            }

            // define an HTML video element to support playback of the current media
            let currentMediaElement = document.createElement( 'video' );
            currentMediaElement.id = 'MPEG_media_' + mediaIndex;
            // currentMediaElement.style.display = 'none';
            // currentMediaElement.muted = true;


            // set the non-required default properties defined in the spec
            currentMediaElement.playsInline = true;
            currentMediaElement.loop = false;
            currentMediaElement.controls = false;
            currentMediaElement.autoplay = true;
            

            // create attributes for non-native settings
            currentMediaElement.setAttribute( 'starttime', 0 );
            currentMediaElement.setAttribute( 'starttimeoffset',  0 );
            currentMediaElement.setAttribute( 'endtimeoffset', 0 );
            currentMediaElement.setAttribute( 'autoplaygroup', 0 );
            // TODO: extensions and extras
            // currentMediaElement.setAttribute( 'extensions', Object );
            // currentMediaElement.setAttribute( 'extras', [] );

            // step through this media's properties
            for( const key in currentMedia ) {
                if( currentMedia.hasOwnProperty( key ) ) {

                    switch ( key ) {

                        // TODO: force enumerated media ids? or allow custom names?
                        case 'name':
                            currentMediaElement.id = currentMedia[ 'name' ];
                            break;

                        case 'startTime':
                            currentMediaElement.starttime = currentMedia[ 'startTime' ];
                            break;

                        case 'startTimeOffset':
                            currentMediaElement.starttimeoffset = currentMedia[ 'startTimeOffset' ];
                            break;

                        case 'endTimeOffset':
                            currentMediaElement.endtimeoffset = currentMedia[ 'endTimeOffset' ];
                            break;

                        case 'autoplay':
                            currentMediaElement.autoplay = currentMedia[ 'autoplay' ];
                            break;

                        case 'autoplayGroup':
                            currentMediaElement.autoplaygroup = currentMedia[ 'autoplayGroup' ];
                            break;

                        case 'loop':
                            currentMediaElement.loop = currentMedia[ 'loop' ];
                            break;

                        case 'controls':
                            currentMediaElement.controls = currentMedia[ 'controls' ];
                            break;

                        case 'alternatives':
                            
                            // step through each media alternative
                            for( const mediaAlternative of currentMedia.alternatives ) {

                                // check if required properties are present
                                if( !mediaAlternative.mimeType ) {
                                    console.warn( 'MPEG_media.media.alternatives: missing \
                                        required property "mimeType"' );
                                    continue;
                                }

                                if( !mediaAlternative.uri ) {
                                    console.warn( 'MPEG_media.media.alternatives: missing \
                                        required property "uri"' );
                                    continue;
                                }

                                // check if mimeType is supported by MPEG-I SD
                                // as declared in the spec
                                if( !VALID_MIMETYPES.includes( mediaAlternative.mimeType ) ) {
                                    console.warn( 'MPEG_media.media.alternatives: mimeType not recognised.' );
                                    continue;
                                }

                                // ensure track and codecs properties are present within 'tracks'
                                if( !mediaAlternative.tracks || !mediaAlternative.tracks.length ) {
                                    console.warn( 'MPEG_media.media.alternative: missing required property "tracks"' );
                                    continue;
                                }

                                // generate codecs string for HTML MediaSource
                                // see IETF RFC 6381 for spec / examples:
                                // https://datatracker.ietf.org/doc/html/rfc6381
                                let mimeCodecString = mediaAlternative.mimeType + ';codecs=';
                                let codecStrings = [];
                                for( const track of mediaAlternative.tracks ) {
                                    if( !track.track ) {
                                        console.warn( 'MPEG_media.media.alternative.track: \
                                            missing required property "track"' );
                                        continue;
                                    }
                                    else if ( !track.codecs ) {
                                        console.warn( 'MPEG_media.media.alternative.track: \
                                            missing required property "codecs"' );
                                        continue;
                                    }
                                    codecStrings.push( track.codecs );
                                }

                                // string to check for codec support
                                mimeCodecString += codecStrings.join( "," );

                                // ensure that playback of all tracks is supported by the browser
                                if( MediaSource.isTypeSupported( mimeCodecString ) ) {
                                    let source = document.createElement( 'source' );
                                    source.setAttribute( 'src', parser.options.path + mediaAlternative.uri );
                                    source.setAttribute( 'type', mimeCodecString );
                                    currentMediaElement.appendChild( source ); // add to html video element
                                }
                                else {
                                    console.warn( 'MPEG_media.media.alternative: unsupported codec');
                                }
                            }
                            break;
                    } // end switch
                }
            }

            // add HTML element to document body
            document.body.appendChild( currentMediaElement );
            mediaIndex++;
        }
    }
}