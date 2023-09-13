// accessor data types
const GL_COMPONENT_TYPES = {
	5120: Int8Array,
	5121: Uint8Array,
	5122: Int16Array,
	5123: Uint16Array,
	5125: Uint32Array,
	5126: Float32Array
};

// GL --> OpenCV types
const CV_COMPONENT_TYPES = {
	5120: cv.CV_8S,
	5121: cv.CV_8U,
	5122: cv.CV_16S,
	5123: cv.CV_16U,
	5125: cv.CV_32U,
	5126: cv.CV_64F
}

// number of components for each type
const GL_TYPE_SIZES = {
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
const GL_FORMAT_SIZES = {
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