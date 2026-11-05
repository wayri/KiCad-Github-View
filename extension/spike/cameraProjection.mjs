/** Switch real Three.js camera types while preserving the target-plane scale. */
export function resizeProjection(camera,aspect){
 camera.aspect=aspect;
 if(camera.isOrthographicCamera){const height=camera.top-camera.bottom;camera.left=-height*aspect/2;camera.right=height*aspect/2;}
 camera.updateProjectionMatrix();
}
export function fitProjection(camera,distance,aspect=camera.aspect){
 if(camera.isOrthographicCamera){const height=2*distance*Math.tan(Math.PI/8);camera.zoom=1;camera.top=height/2;camera.bottom=-height/2;}
 resizeProjection(camera,aspect);
}
export function projectionCamera(THREE,camera,controls,orthographic){
 if(Boolean(camera.isOrthographicCamera)===Boolean(orthographic))return camera;
 const aspect=camera.aspect||1,distance=Math.max(.001,camera.position.distanceTo(controls.target)),height=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*distance*Math.tan(camera.fov*Math.PI/360)/camera.zoom;
 const next=orthographic?new THREE.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,camera.near,camera.far):new THREE.PerspectiveCamera(45,aspect,camera.near,camera.far);
 next.position.copy(camera.position);next.quaternion.copy(camera.quaternion);next.up.copy(camera.up);
 if(!orthographic){const direction=camera.position.clone().sub(controls.target).normalize();next.position.copy(controls.target).addScaledVector(direction,height/(2*Math.tan(Math.PI/8)));}
 next.aspect=aspect;next.updateProjectionMatrix();next.updateMatrixWorld();controls.object=next;return next;
}
export function projectionPixelsPerMm(camera,height,depth){return camera.isOrthographicCamera?height*camera.zoom/(camera.top-camera.bottom):height*camera.zoom/(2*Math.tan(camera.fov*Math.PI/360)*depth);}
