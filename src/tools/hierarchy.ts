/* @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Object3D, Scene} from 'three';

import {Mesh, ModelGraft, ModelGraftNode, SceneGraftNode} from '../3dom/scene-graft.js';
import {$gltf, CacheRetainedScene, CachingGLTFLoader} from '../three-components/CachingGLTFLoader.js';
import {GltfJson} from '../three-components/ModelUtils.js';

const getNodeByName = (gltf: GltfJson, name: string) => {
  for (let i = 0; i < gltf.nodes.length; ++i) {
    const node = gltf.nodes[i];
    // console.log(node.name);
    if (node.name === name) {
      return node;
    }
  }
  return null;
};

const getObject3DByName = (scene: Scene, name: string) => {
  const objects = scene.children.slice();

  while (objects.length) {
    const object = objects.shift()!;
    // console.log(object.name);
    if (object.name === name) {
      return object;
    }

    objects.push(...object.children);
  }

  return null;
};

const $loader = Symbol('loader');
const $analyzeNode = Symbol('analyzeNode');
const $analyzeObject3D = Symbol('analyzeObject3D');
const $analyzeModelGraft = Symbol('analyzeModelGraft');

export class HierarchyTool {
  protected[$loader] = new CachingGLTFLoader();

  async analyze(url: string) {
    const scene = await this[$loader].load(url) as Scene;
    const gltf = (scene as CacheRetainedScene)[$gltf];
    const sceneGraft = new ModelGraft(scene);

    console.log(gltf, scene);

    console.log(JSON.stringify(sceneGraft));
    // console.log(JSON.stringify(sceneGraft, null, 2));

    // const targetNode = getNodeByName(gltf, 'UpperLeg.L')!;
    // const targetObject = getObject3DByName(scene, 'UpperLegL')!;

    // console.log(targetNode);
    // this[$analyzeNode](gltf, gltf.nodes.indexOf(targetNode));
    // this[$analyzeObject3D](targetObjext);

    gltf.scenes[gltf.scene].nodes.forEach(
        nodeIndex => this[$analyzeNode](gltf, nodeIndex, true));

    scene.children.forEach(child => this[$analyzeObject3D](child));

    this[$analyzeModelGraft](sceneGraft);
  }

  [$analyzeModelGraft](modelGraftNode: ModelGraftNode) {
    console.group(modelGraftNode.name, modelGraftNode);

    if (modelGraftNode instanceof SceneGraftNode &&
        modelGraftNode.mesh != null) {
      for (const primitive of modelGraftNode.mesh.primitives) {
        console.log(primitive);
      }
    }

    for (const child of modelGraftNode.children) {
      this[$analyzeModelGraft](child);
    }

    console.groupEnd();
  }

  [$analyzeObject3D](object3D: Object3D, recurse: boolean = true) {
    const name = object3D.userData && object3D.userData.name ?
        object3D.userData.name :
        'Generated';
    const label = `${object3D.type}<${name}>`;
    console.group(label);

    if (recurse) {
      for (let child of object3D.children) {
        this[$analyzeObject3D](child);
      }
    }

    console.groupEnd();
  }

  [$analyzeNode](gltf: GltfJson, nodeIndex: number, recurse: boolean = true) {
    const node = gltf.nodes[nodeIndex];
    const label = `Node<${node.name}> ${node.skin != null ? '(skinned)' : ''}`;
    console.group(label);

    if (node.mesh != null) {
      const mesh = gltf.meshes[node.mesh];
      // console.group('Mesh<', mesh);
      for (const primitive of mesh.primitives) {
        console.log('Mesh primitive:', primitive);
      }
    }

    if (recurse && node.children) {
      for (let childIndex of node.children) {
        this[$analyzeNode](gltf, childIndex, true);
      }
    }

    console.groupEnd();
  }
}