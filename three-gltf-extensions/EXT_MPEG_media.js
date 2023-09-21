/**
*   MPEG_media Extension
*   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_media
*         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_media
*   MPEG_media provides an array of MPEG media items referenced by other extensions in glTF document.
*
*   The MPEG_media metadata should be available by the time any extension tries
*   to instantiate a MediaPipeline object
*   
*   We will attach it to plugins.MPEG_media with a "metadata" class variable
*   This class is mostly a placeholder for now, as we just need to supply metadata like
*   mimeType and URI in order to initialize a pipeline.
*   Down the line, this class may be used for dynamic loading with
*   some modifications to GLTFLoader.js
*/
export class GLTFMPEGMediaExtension {
    
    constructor( parser ) {
        this.name = 'MPEG_media';
        this.parser = parser;

        if( !parser.json.extensions ) {
            console.warn( "no extensions not found in file." );
            return;
        }
        
        if( !this.parser.json.extensions.MPEG_media ) {
            console.warn( "MPEG_media not found in file." );
            return;
        }
        
        this.metadata = this.parser.json.extensions.MPEG_media;

        /** 
         * TODO: add 'media' as a dependency type in the THREE glTF loader
         *  and implement a loadMedia( index ) function here.
         * */   
    }
}