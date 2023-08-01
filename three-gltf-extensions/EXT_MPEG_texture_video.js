/**
 *   MPEG_texture_video extension
 *   spec: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/MPEG_texture_video
 *         https://github.com/MPEGGroup/Scene-Description/tree/main/MPEG_texture_video
 * 
 *   MPEG_texture_video extension provides the possibility to link a texture object 
 *   defined in glTF 2.0 to media and its respective track, listed by an MPEG_media
 */
export default class GLTFMPEGTextureVideoExtension {

    constructor( parser ) {
        this.name = 'MPEG_texture_video';
        this.parser = parser;
    }

    // called during parse by GLTFLoader
    afterRoot( gltf ) {
        
        // implementation here
       // console.log( this.parser );
        console.log( gltf );
    }
}