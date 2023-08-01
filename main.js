import { World } from './World.js';

// ****************************************************************
// load scene once start button is clicked.
// remove button from view.
const startScreen = document.getElementById( 'start-screen' );
startScreen.addEventListener( "click", function () {

        startScreen.style.display = 'none';
        // run program and print errors to console
        main().catch( ( err ) => {
          console.error( err );
        });
});


// ****************************************************************
// main function. create container for three.js scene and init world
async function main() {

  // create container for three js scene
  const container = document.createElement( 'div' );
  container.id = 'threejs-canvas';
	document.body.appendChild( container );

  // create a new world
  const world = new World( container );

  // complete initialization tasks
  await world.init()

  // start the animation loop
  world.start();
}