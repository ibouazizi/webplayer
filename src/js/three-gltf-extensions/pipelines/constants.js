// OpenCV color codes
export const COLOR_CODES = {
    // YUV to RGB
    COLOR_YUV2RGB_I420: 98,
    COLOR_YUV2RGBA_I420: 102,
    COLOR_YUV2BGR_I420: 99,
    COLOR_YUV2BGRA_I420: 103,
    COLOR_YUV2GRAY_420: 106,
    
    // YUV422 to RGB
    COLOR_YUV2RGB_Y422: 108,
    COLOR_YUV2RGBA_Y422: 112,
    COLOR_YUV2BGR_Y422: 109,
    COLOR_YUV2BGRA_Y422: 113,
    COLOR_YUV2GRAY_Y422: 116,
    
    // NV12 to RGB
    COLOR_YUV2RGB_NV12: 90,
    COLOR_YUV2RGBA_NV12: 94,
    COLOR_YUV2BGR_NV12: 91,
    COLOR_YUV2BGRA_NV12: 95,
    COLOR_YUV2GRAY_NV12: 98,
    
    // RGBA conversions
    COLOR_RGBA2RGB: 2,
    COLOR_RGBA2BGR: 3,
    COLOR_RGBA2BGRA: 5,
    COLOR_RGBA2GRAY: 11,
    
    // BGRA conversions
    COLOR_BGRA2RGB: 14,
    COLOR_BGRA2RGBA: 13,
    COLOR_BGRA2BGR: 12,
    COLOR_BGRA2GRAY: 10,

    // OpenCV Mat types
    CV_8UC1: 0,
    CV_8UC3: 16,
    CV_8UC4: 24  // Add support for RGBA
};

// accessor data types
export const GL_COMPONENT_TYPES = {
        5120: Int8Array,
        5121: Uint8Array,
        5122: Int16Array,
        5123: Uint16Array,
        5125: Uint32Array,
        5126: Float32Array
};

// GL --> OpenCV types
// These values are from OpenCV's constants
export const CV_COMPONENT_TYPES = {
        5120: 1,  // CV_8S
        5121: 0,  // CV_8U
        5122: 3,  // CV_16S
        5123: 2,  // CV_16U
        5125: 4,  // CV_32S
        5126: 6   // CV_64F
}

// number of components for each type
export const GL_TYPE_SIZES = {
        'SCALAR': 1,
        'VEC2': 2,
        'VEC3': 3,
        'VEC4': 4,
        'MAT2': 4,
        'MAT3': 9,
        'MAT4': 16
};

// MPEG_texture_video pixel formats
// size in bytes for each format @ 8bits/sample
export const GL_FORMAT_SIZES = {
        'RED': 1,
        'GREEN': 1,
        'BLUE': 1,
        'RG': 2,
        'RGB': 3,
        'RGBA': 4,
        'BGR': 3,
        'BGRA': 4,
        'DEPTH_COMPONENT': 1
}