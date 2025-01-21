# THREE.JS MPEG-I SD extensions

This project is an initial push to support MPEG-I SD extensions in THREE.js.
Isaac Nealey 2023 - contact: inealey@ucsd.edu 
- 'main' branch for latest changes and simple demo
- 'HTMLMediaElement' branch for implementation that uses HTMLMediaElement API for audio/video playback.
- 'develop' branch for experiments and proposed changes

## Run Demo:

#### 1. Install Node.js / npm
```
https://nodejs.org/en/download
```

#### 2. clone this repository
```
git clone https://github.com/inealey/threejs-mpeg-extensions.git
cd threejs-mpeg-extentions
```

#### 3. install dependencies
```
npm install
```

#### 4. start HTTP server
```
npx vite
```

#### 5. click on the generated link to visit browser
```
http://localhost:5173
```

## Project Overview:

* **three-gltf-extensions**  
  * **pipelines**  
    * **demuxer**
      * `mp4_pull_demuxer.js`:  pull-based demuxing of mp4 files. mp4box.js and WebCodecs. supports audio and video tracks
      * `mp4_demuxer_base`: base class to be extended by demuxer implementations
    * `constants.js`: dictionaries for type conversion
    * `format_converter.js`: function for handling color space conversion with OpenCV
    * `media.js`: base MediaPipeline class to be extended by concrete MPEG_media pipeline implementations
    * `video.js`: class for processing video frames for MPEG_texture_video. to be executed in WebWorker
  * **third_party**
    * `opencv/4.8.0/opencv.js`: OpenCV.js version 4.8.0
    * `ringbuf/ringbuf.js`: thread-safe ring buffer: https://github.com/padenot/ringbuf.js/
  * `EXT_MPEG_accessor_timed.js`: support for the MPEG_accessor_timed extension. to be loaded by glTF parser
  * `EXT_MPEG_buffer_circular.js`: support for the MPEG_buffer_circular extension. to be loaded by glTF parser
  * `EXT_MPEG_media.js`: support for the MPEG_media extension. to be loaded by glTF parser
  * `EXT_MPEG_texture_video.js`: support for the MPEG_texture_video extension. to be loaded by glTF parser  
  * `GLTFLoader.js`: glTFLoader class for parsing glTF files. use this one until changes can be merged with THREE  
* `index.html`: simple HTML web page to display THREE.js canvas
* `main.css`: cascading style sheet for our page. contains 'start button' config
* `main.js`: this demo's main driver script. demonstrates the setup and animation of a scene with THREE.js with glTF content, lights, and controls. registers glTF extensions and loads a model from file
* `vite.config.js`: CORS header settings for Vite JS. needed for SharedArrayBuffer support

### Notes from the dev:

* the code is heavily commented to encourage readbility and further development
* comments items marked `TODO` I consider to be places where the implemention is incomplete and needs more work before formal presentation of this software
* comments marked `MAYBE` are just ideas I had during development, such as the optimal places to perform certain tasks

#### Major TODO items:
* THREE.js
  * PR with support for parsing buffer and accessor extensions in glTF. see GLTFLoader. 
  * implement logic for a 'media' dependency type when parsing glTF. this will make the cascading dependencies more obvious while parsing, and can then adjust `EXT_MPEG_media.js` accrdingly
  
* Media Pipeline:
  * support for playback controls, i.e. pause play seek
  * select proper tracks for playback
  * check media alternatives to see if content playback is supported
  
* Video Pipeline:
  
* Support for spatial audio
  *  `mp4_pull_demuxer.js` is prepared to demux audio tracks. need to implement THREE.js glTF extension to read the buffer and pass audio frames to WebAudio
