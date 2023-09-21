/**
 *  we need to elegantly handle the
 *  WebCodecs VideoFrame --> OpenGL pixel format conversions.
 * 
 *  This function returns:
 *  1) the necessary sizes of the I/O buffers
 *  2) the OpenCV color conversion code needed for cvtColor()
 *  
 *  see: https://docs.opencv.org/4.8.0/d8/d01/group__imgproc__color__conversions.html
 * 
 *  we're assuming all images have 8 bits/sample (VideoFrame only supports 8 bpc formats)
 *  although it may be prudent in the future to support any componentType for output pixel samples,
 *  i.e. for DEPTH_COMPONENT
 * 
 *  This could enable support for hdr textures and 3d-coded video media like v-pcc
 * 
 * 
 *  height, width are the image dimensions in pixels
 *  inputFormat may be one of: 'I420', 'I420A', 'I422', 'I444', 'NV12', 'RGBA', 'RGBX', 'BGRA', 'BGRX'
 *  outputFormat may be one of: 'RED', 'GREEN', 'BLUE', 'RG', 'RGB', 'RGBA', 'BGR', 'BGRA', 'DEPTH_COMPONENT'
 * 
 *  TODO: handle channel interleaving to return red, green, blue, and red/green formats.
 *          for now, just return RGB in those cases (and in the default case).
 * 
 *  as we are returning cv.XXX color codes directly this function assumes that the OpenCV module is loaded.
 * 
 *  if color code is returned 'null' no conversion is necessary and the cvtColor() call can be skipped
 * 
 */

function convertPixelInfo(  height,
                            width,
                            inputFormat, 
                            outputFormat ) {

    let inputBytes = null;
    let outputBytes = null;
    let colorCode = null;

    if( !height || !width ) {
        console.error( 'height and width required for format conversion' );
        return false;
    }

    if( !inputFormat ) {
        console.error( 'input format required for pixel conversion' );
        return false;
    }

    // handle cases where input format is 'I420'
    if( inputFormat === 'I420' ) {
        inputBytes = height * width * ( 3 / 2 );
        switch( outputFormat ) {
            case 'RED':
            case 'GREEN':
            case 'BLUE':
            case 'RG':
            case 'RGB':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_I420;
                break;
            case 'RGBA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2RGBA_I420;
                break;
            case 'BGR':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2BGR_I420;
                break;
            case 'BGRA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2BGRA_I420;
                break;
            case 'DEPTH_COMPONENT':
                // TODO: we'll convert to GRAY here, but really that should
                // not be the case. probably need to support
                // a single channel with >8 bit depth
                outputBytes = height * width;
                colorCode = cv.COLOR_YUV2GRAY_420;
                break;
            default:
                // convert to RGB by default
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_I420;
                break;
        }
    }

    // TODO: OpenCV does not support I420A, throw an error in this case
    else if( inputFormat === 'I420A' ) {
        console.error( 'OpenCV does not support conversion of I420A frames :(' );
        return false;
    }

    // handle cases where input format is 'I422'
    else if( inputFormat === 'I422' ) {
        inputBytes = height * width * 2;
        switch( outputFormat ) {
            case 'RED':
            case 'GREEN':
            case 'BLUE':
            case 'RG':
            case 'RGB':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_Y422;
                break;
            case 'RGBA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2RGBA_Y422;
                break;
            case 'BGR':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2BGR_Y422;
                break;
            case 'BGRA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2BGRA_Y422;
                break;
            case 'DEPTH_COMPONENT':
                // TODO: we'll convert to GRAY here, but really that should
                // not be the case. probably need to support
                // a single channel with >8 bit depth
                outputBytes = height * width;
                colorCode = cv.COLOR_YUV2GRAY_Y422;
                break;
            default:
                // convert to RGB by default
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_Y422;
                break;
        }
    }

    // TODO: OpenCV does not support I444, throw an error in this case
    else if(  inputFormat === 'I444' ) {
        console.error( 'OpenCV does not support conversion of I444 frames :(' );
        return false;
    }

    // handle cases where input format is 'NV12'
    else if( inputFormat === 'NV12' ) {
        inputBytes = height * width * ( 3 / 2 );
        switch( outputFormat ) {
            case 'RED':
            case 'GREEN':
            case 'BLUE':
            case 'RG':
            case 'RGB':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_NV12;
                break;
            case 'RGBA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2RGBA_NV12;
                break;
            case 'BGR':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2BGR_NV12;
                break;
            case 'BGRA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_YUV2BGRA_NV12;
                break;
            case 'DEPTH_COMPONENT':
                // TODO: we'll convert to GRAY here, but really that should
                // not be the case. probably need to support
                // a single channel with >8 bit depth
                outputBytes = height * width;
                colorCode = cv.COLOR_YUV2GRAY_NV12;
                break;
            default:
                // convert to RGB by default
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_YUV2RGB_NV12;
                break;
        }
    }

    // handle cases where input format is 'RGBA'
    // possible no-conversion case.
    // for our purposes, 'RGBX' is the same as 'RGBA'
    else if( inputFormat === 'RGBA' || inputFormat === 'RGBX') {
        inputBytes = height * width * 4;
        switch( outputFormat ) {
            case 'RED':
            case 'GREEN':
            case 'BLUE':
            case 'RG':
            case 'RGB':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_RGBA2RGB;
                break;
            case 'RGBA':
                outputBytes = height * width * 4;
                // leave colorCode 'null'. no conversion needed!
                break;
            case 'BGR':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_RGBA2BGR;
                break;
            case 'BGRA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_RGBA2BGRA;
                break;
            case 'DEPTH_COMPONENT':
                // TODO: we'll convert to GRAY here, but really that should
                // not be the case. probably need to support
                // a single channel with >8 bit depth
                outputBytes = height * width;
                colorCode = cv.COLOR_RGBA2GRAY;
                break;
            default:
                // convert to RGB by default
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_RGBA2RGB;
                break;
        }
    }

    // handle cases where input format is 'BGRA'
    // possible no-conversion case.
    // for our purposes, 'BGRX' is the same as 'RGBA'
    else if( inputFormat === 'BGRA' || inputFormat === 'BGRX') {
        inputBytes = height * width * 4;
        switch( outputFormat ) {
            case 'RED':
            case 'GREEN':
            case 'BLUE':
            case 'RG':
            case 'RGB':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_BGRA2RGB;
                break;
            case 'RGBA':
                outputBytes = height * width * 4;
                colorCode = cv.COLOR_BGRA2RGBA;
                break;
            case 'BGR':
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_BGRA2BGR;
                break;
            case 'BGRA':
                outputBytes = height * width * 4;
                // leave colorCode 'null'. no conversion needed!
                break;
            case 'DEPTH_COMPONENT':
                // TODO: we'll convert to GRAY here, but really that should
                // not be the case. probably need to support
                // a single channel with >8 bit depth
                outputBytes = height * width;
                colorCode = cv.COLOR_BGRA2GRAY;
                break;
            default:
                // convert to RGB by default
                outputBytes = height * width * 3;
                colorCode = cv.COLOR_BGRA2RGB;
                break;
        }
    }

    return { inputSize: inputBytes,
             outputSize: outputBytes,
             code: colorCode };

}