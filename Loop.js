import { Clock } from "three";

const clock = new Clock();

class Loop {
  constructor( camera, scene, renderer ) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this.updatables = [];
  }


  // start animating
  start() {
    // define animation loop
    this.renderer.setAnimationLoop( () => {

      // tick animated objects forward one frame
      this.tick();

      // render a frame
      this.renderer.render( this.scene, this.camera );

    });
  }


  // stop animation loop
  stop() {
    this.renderer.setAnimationLoop( null );
  }


  // tick forward one frame
  tick() {
    // time elapsed since last frame
    const delta = clock.getDelta();

    // update scene objects
    for ( const object of this.updatables ) {
      object.tick( delta );
    }
  }
  
}

export { Loop };