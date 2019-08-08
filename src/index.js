const lib = require('./lib.js');

// create scene manager
const scene = new lib.SceneManager();
// grab the element we're projecting over
const viewer = document.getElementById('tjsviewer');
// assign the scene to said element
scene.init(viewer, viewer.offsetWidth, viewer.offsetHeight);
console.info('Loaded base scene.');
let apiConfig = undefined;
let mode = 'overview';
let focused = undefined;
scene.setOrbitEnabled(false);
scene.camera.position.set(0, 20, -20);
document.getElementById('backbutton').style.visibility = 'hidden';
// put back button callback init here
document.getElementById('backbutton').addEventListener('click', function() {
  console.info('going back');
  mode = 'overview';
  scene.setOrbitEnabled(false);
  scene.camera.position.set(0, 20, -20);
  scene.camera.rotation.set(0, 0, 0);
  scene.camera.updateProjectionMatrix();
  scene.cameraLookAt(lib.parseVec3('0,0,0'));
  document.getElementById('backbutton').style.visibility = 'hidden';
  focused = undefined;
});

console.info('Loading assets from config.json');
lib.ensureShowpadLibLoaded()
    .then(() => {
      return lib.getApiConfig();
    })
    .then((cfg) => {
      apiConfig = cfg;
      return lib.getConfigJson();
    })
    .then((cjson) => {
      console.info(cjson);
      for (const i in cjson.contents) {
        if (cjson.contents[i].model.result[0]) {
          lib.getAssetById(cjson.contents[i].model.result[0], apiConfig)
              .then((data) => {
                console.info(data);
                return lib.loadColladaFromZip(data.shortLivedDownloadLink);
              })
              .then((mesh) => {
                console.info(mesh);
                // Apply transformations
                console.info('Applying transforms to mesh');
                try {
                  if (cjson.labels[`${i}_position`].value != '') {
                    mesh.position.set(...cjson.labels[`${i}_position`]
                        .value.split(',').map((i) => Number(i)));
                  }
                  if (cjson.labels[`${i}_rotation`].value != '') {
                    const rot = cjson.labels[`${i}_rotation`]
                        .value.split(',').map((i) => Number(i));
                    mesh.rotation.x += rot[0];
                    mesh.rotation.y += rot[1];
                    mesh.rotation.z += rot[2];
                  }
                  if (cjson.labels[`${i}_scale`].value != '') {
                    mesh.scale.set(...cjson.labels[`${i}_scale`]
                        .value.split(',').map((i) => Number(i)));
                  }
                  console.info(mesh.position, mesh.rotation, mesh.scale);
                } catch (e) {
                  console.error(e);
                }
                try {
                  // mesh.material.color.set(0x808080);
                } catch (e) {
                  console.error(e);
                }
                // Add object to scene with click callbacks
                scene.addObject(mesh, cjson.labels[i].value, () => {
                  if (mode == 'detail' && focused == mesh.name) {
                    window.open(cjson.contents[i].page_link.value, '_blank');
                  } else if (mode == 'overview') {
                    scene.cameraLookAt(mesh.position);
                    scene.setOrbitEnabled(true);
                    document.getElementById('backbutton')
                        .style.visibility = 'visible';
                    mode = 'detail';
                    focused = mesh.name;
                  }
                });
              })
              .catch(console.error);
        }
      }
    });

scene.animate(); // begin rendering
// wait for showpadlib
// get config json
// for each asset in config.json,
// / download the asset zipfile from the showpad instance
// / unzip the asset zip and parse the collada
// / bring the asset into the scene
// / resize the asset accordingly
// / move the asset accordingly
// finally, replace the skybox and cubemap with assets
