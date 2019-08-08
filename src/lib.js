/* eslint-disable require-jsdoc */
const request = require('request');

const THREE = require('./collada.js').hotpatch(
    require('./orbit.js').hotpatch(require('three')));
const JSZip = require('jszip');

module.exports.ensureShowpadLibLoaded = function() {
  return new Promise((resolve, reject) => {
    if (typeof window.ShowpadLib === 'undefined') {
      setTimeout(() => {
        reject(new Error('Showpad lib load timed out'));
      }, 5000);
      window.onShowpadLibLoaded = () => {
        resolve();
      };
    } else {
      resolve();
    }
  });
};

module.exports.getApiConfig = function() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Showpad API config timed out'));
    }, 5000);
    window.ShowpadLib.getShowpadApi((data) => {
      if (data.error === null) {
        window.clearTimeout(timer);
        resolve(data);
      } else {
        reject(data.error);
      }
    });
  });
};

module.exports.getAssetById = function(id, apiConfig) {
  return new Promise((resolve, reject) => {
    request.get({url: `${apiConfig.url}/api/v3/assets/${id}.json`,
      headers: {'Authorization': `Bearer ${apiConfig.accessToken}`}},
    (err, res, body) => {
      if (err) reject(err);
      try {
        body = JSON.parse(body);
      } catch (e) {
        reject(e);
      }
      resolve(body.response);
    });
  });
};

module.exports.getConfigJson = function() {
  return new Promise((resolve, reject) => {
    function getCfg() {
      const configUrl = decodeURIComponent(
          window.frameElement.src.split('configUrl=')[1]).split('&')[0];
      fetch(configUrl)
          .then((dat) => {
            return dat.json();
          })
          .then(resolve)
          .catch(reject);
    }
    if (!window.ShowpadLib) {
      const timer = setTimeout(() => {
        reject(new Error('Failed to load ShowpadLib.'));
      }, 5000);
      window.onShowpadLibLoaded = () => {
        clearTimeout(timer);
        getCfg();
      };
    } else {
      getCfg();
    }
  });
};

module.exports.parseVec3 = function(str) {
  try {
    // strip whitespace and split by commas
    const parsed = str.replace(/\s/g, '').split(',')
        .map((i) => Number(i));
    return new THREE.Vector3(...parsed);
  } catch (e) {
    throw new Error(`Failed to parse user string: ${e}.`);
  }
};

// loads first mesh it finds in the scene
module.exports.loadCollada = function(url) {
  return new Promise((resolve, reject) => {
    (new THREE.ColladaLoader()).load(url, function(data) {
      // instead, maybe combine all of the meshes into one mesh
      // OR make all of the meshes children of one object and
      // return that
      if (data.scene.children[0]) {
        resolve(data.scene.children[0]);
      } else {
        reject(new Error('Failed to find a mesh in the .dae'));
      }
    }, (_) => {}, reject);
  });
};

module.exports.loadColladaFromZip = function(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
        .then((response) => {
          return response.arrayBuffer();
        })
        .then((data) => {
          return JSZip.loadAsync(data);
        })
        .then((zip) => {
          const keys = Object.keys(zip.files).filter((n) => n.endsWith('.dae'));
          if (keys.length > 0) {
            // extracts the first one it finds
            return zip.files[keys[0]].async('base64');
          } else {
            reject(new Error('Couldn\'t find a .dae file in the zip.'));
          }
        })
        .then((b64) => {
          return module.exports.loadCollada('data:text/plain;base64,' + b64);
        })
        .then(resolve)
        .catch(reject);
  });
};

module.exports.SceneManager = function() {
  this.element = undefined; // element we're displaying over
  this.scene = undefined; // overarching scene object
  this.renderer = undefined; // renderer to use for everything
  this.camera = undefined; // main camera
  this.objects = undefined; // object mapping name to object
  this.cameraState = undefined; // tbd
  this.raycaster = undefined; // raycaster for selection and clicks
  this.mouse = undefined; // mouse vec2
  this.controls = undefined; // for moving around
  this.width = 0; // actively updated width
  this.height = 0; // and height
  this.frameCallbacks = []; // custom callbacks called each frame
  this.init = (element, iwidth, iheight) => {
    // set up internal data
    this.width = iwidth;
    this.height = iheight;
    this.element = element;
    this.objects = {};
    this.camera = new THREE.PerspectiveCamera(
        75, this.width / this.height, .01, 1000);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xf0f0f0));

    console.info('Loading HDR environment');
    const hdr_geometry = new THREE.SphereGeometry( 500, 60, 40 );
    const hdr_material = new THREE.MeshBasicMaterial( {
      map: new THREE.TextureLoader().load( 'surgery_2k.png' ),
    } );
    let hdrMesh = new THREE.Mesh( hdr_geometry, hdr_material );
    hdrMesh.scale.set( - 1, 1, 1 );
    this.scene.add( hdrMesh );

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // clear background
    });
    this.renderer.setSize(this.width, this.height);
    element.appendChild(this.renderer.domElement);
    // set up orbit controls (enabled by default)
    this.controls = new THREE.OrbitControls(
        this.camera, this.renderer.domElement);
    this.controls.maxDistance = 10;
    this.controls.minDistance = 1;
    this.controls.enableDamping = true;
    this.controls.rotateSpeed = 0.5;
    this.controls.enablePan = false;

    // set up callbacks
    // handle resizing
    const thisref = this; // antipatterns! :)
    window.onresize = () => {
      thisref.width = element.offsetWidth;
      thisref.height = element.offsetHeight;
      thisref.renderer.setSize(thisref.width, thisref.height);
      thisref.camera.aspect = thisref.width / thisref.height;
      thisref.camera.updateProjectionMatrix();
      // console.log(thisref.width, thisref.height);
    };
    // mouse movement
    window.addEventListener( 'mousemove', (event) => {
      thisref.mouse.x = ( event.offsetX / thisref.width ) * 2 - 1;
      thisref.mouse.y = - ( event.offsetY / thisref.height ) * 2 + 1;
      // console.log(thisref.mouse.x, thisref.mouse.y);
    }, false );
    // mouse click
    window.addEventListener( 'mousedown', (event) => {
      thisref.raycaster.setFromCamera( thisref.mouse, thisref.camera );
      const intersects = thisref
          .raycaster.intersectObjects( thisref.scene.children );
      if (intersects[0]) {
        console.log('clicked', intersects[0].object.name);
        if (intersects[0].object._onclick) {
          intersects[0].object._onclick();
        }
      }
    }, false );
  };
  this.addObject = (mesh, name, clickCallback) => {
    if (this.objects[name]) {
      throw new Error(`Object of name "${name}" already exists.`);
    }
    mesh.name = name;
    mesh._onclick = clickCallback;
    this.objects[name] = mesh;
    this.scene.add(mesh);
  };
  this.addFrameCallback = (callback) => {
    this.frameCallbacks.push(callback);
  };
  this.animate = () => { // ---------------------------------- // animation loop
    requestAnimationFrame(this.animate);
    this.controls.update(); // camera orbit controls
    // allows user-specified frame callbacks
    for (const callback of this.frameCallbacks) {
      callback(this); // allow callback to access the whole object
    }
    this.renderer.render(this.scene, this.camera);
  }; // ------------------------------------------------------ // animation loop
  this.interpolateCameraPos = (attrs) => {
    // change position, rotation and call controls.update each tick
    // probably with setinterval
    this.controls.update(); // call this every time
  };
  this.cameraLookAt = (vec3) => {
    this.camera.lookAt(vec3);
    this.controls.target = vec3;
    this.controls.update();
  };
  this.setControlTarget = (vec) => {
    this.controls.target = vec;
    this.controls.update();
  };
  this.setOrbitEnabled = (tf) => {
    this.controls.enabled = tf;
    this.controls.update();
  };
  return this;
};
