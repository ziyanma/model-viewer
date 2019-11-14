import {Group, Material as ThreeMaterial, Mesh as ThreeMesh, MeshStandardMaterial, Object3D, Scene, SkinnedMesh} from 'three';

export const ModelGraphNodeType = {
  scene: 0,
  node: 1,
  mesh: 2,
  primitive: 3,
  material: 4,
  pbrMetallicRoughness: 5
};

export type RGBA = [number, number, number, number];

const getId = (() => {
  let id = 0;
  return () => id++;
})();


const $relatedObject = Symbol('relatedObject');
const $children = Symbol('children');
const $type = Symbol('type');
const $id = Symbol('id');

/**
 * ModelGraphNode
 */
export abstract class ModelGraftNode {
  protected[$relatedObject]: Object3D|ThreeMaterial;
  protected[$children]: Readonly<Array<ModelGraftNode>> = [];
  protected[$id]: number = getId();

  constructor(relatedObject: Object3D|ThreeMaterial) {
    this[$relatedObject] = relatedObject;
  }

  get children() {
    return this[$children];
  }

  get name() {
    return this[$relatedObject].userData ? this[$relatedObject].userData.name :
                                           null;
  }

  protected abstract get[$type](): number;
  abstract toJSON(): {};
}


export interface PbrMetallicRoughnessJson {
  type: number;
  id: number;
  baseColorFactor: RGBA;
}

const $threeMaterial = Symbol('threeMaterial');

/**
 * PBRMetallicRoughness
 */
export class PbrMetallicRoughness extends ModelGraftNode {
  protected get[$type]() {
    return ModelGraphNodeType.pbrMetallicRoughness;
  }

  protected get[$threeMaterial](): MeshStandardMaterial {
    return this[$relatedObject] as MeshStandardMaterial;
  }

  constructor(material: ThreeMaterial) {
    super(material);
  }

  get baseColorFactor(): RGBA {
    const material = this[$threeMaterial];
    if (material.color) {
      return [...material.color.toArray(), material.opacity] as RGBA;
    } else {
      return [1, 1, 1, 1];
    }
  }

  set baseColorFactor(value: RGBA) {
    console.log(
        'Setting base color factor on main thread material',
        this[$threeMaterial]);
    console.log('New base color factor:', value);
    this[$threeMaterial].color.fromArray(value);
    this[$threeMaterial].opacity = value[3];
  }

  toJSON(): PbrMetallicRoughnessJson {
    return {
      type: this[$type],
      id: this[$id],
      baseColorFactor: this.baseColorFactor
    };
  }
}


export interface MaterialJson {
  type: number;
  id: number;
  name?: string;
  pbrMetallicRoughness: PbrMetallicRoughnessJson;
}

const $pbrMetallicRoughness = Symbol('pbrMetallicRoughness');

/**
 * Material
 */
export class Material extends ModelGraftNode {
  protected get[$type]() {
    return ModelGraphNodeType.material;
  }

  protected[$pbrMetallicRoughness]: PbrMetallicRoughness;

  constructor(material: ThreeMaterial) {
    super(material);

    this[$pbrMetallicRoughness] = new PbrMetallicRoughness(material);
    this[$children] = Object.freeze([this[$pbrMetallicRoughness]]);
  }

  get pbrMetallicRoughness() {
    return this[$pbrMetallicRoughness];
  }

  toJSON(): MaterialJson {
    const result: MaterialJson = {
      type: this[$type],
      id: this[$id],
      pbrMetallicRoughness: this.pbrMetallicRoughness.toJSON()
    };

    if (this.name) {
      result.name = this.name;
    }

    return result;
  }
}


export interface PrimitiveJson {
  type: number;
  id: number;
  material?: MaterialJson;
}

const $material = Symbol('material');

/**
 * Primitive
 */
export class Primitive extends ModelGraftNode {
  protected get[$type]() {
    return ModelGraphNodeType.primitive;
  }

  protected[$material]: Material|null = null;

  constructor(meshLike: ThreeMesh|SkinnedMesh) {
    super(meshLike);

    if (meshLike.material != null) {
      // NOTE(cdata): Technically Three.js meshes can have an array of
      // materials. However, at the time of this writing it does not appear as
      // though any scenes produced by the GLTFLoader will contain meshes with
      // multiple materials.
      // @see https://github.com/mrdoob/three.js/pull/15889
      this[$material] = new Material(meshLike.material as ThreeMaterial);
      this[$children] = Object.freeze([this[$material]!]);
    }
  }

  get material() {
    return this[$material];
  }

  toJSON() {
    const result: PrimitiveJson = {type: this[$type], id: this[$id]};

    if (this[$material] != null) {
      result.material = this.material!.toJSON();
    }

    return result;
  }
}


export interface MeshJson {
  type: number;
  id: number;
  name?: string;
  primitives?: Array<PrimitiveJson>;
}

const $primitives = Symbol('primitives');

/**
 * Mesh
 */
export class Mesh extends ModelGraftNode {
  protected get[$type]() {
    return ModelGraphNodeType.mesh;
  }

  protected[$primitives]: Readonly<Array<Primitive>>;

  constructor(groupOrMesh: Group|ThreeMesh) {
    super(groupOrMesh);

    const primitives = [];

    if ((groupOrMesh as Group).isGroup) {
      // TODO: Figure out if extensions might add things like lights and cameras
      // to this group
      for (const meshLike of groupOrMesh.children) {
        primitives.push(new Primitive(meshLike as ThreeMesh | SkinnedMesh));
      }
    } else {
      primitives.push(new Primitive(groupOrMesh as ThreeMesh | SkinnedMesh));
    }

    this[$primitives] = Object.freeze(primitives);
    this[$children] = Object.freeze(this[$primitives].slice());
  }

  get primitives() {
    return this[$primitives];
  }

  toJSON() {
    const result: MeshJson = {type: this[$type], id: this[$id]};

    if (this.name) {
      result.name = this.name;
    }

    if (this.primitives.length) {
      result.primitives = this.primitives.map(primitive => primitive.toJSON());
    }

    return result;
  }
}


export interface SceneGraftNodeJson {
  type: number;
  id: number;
  name?: string;
  mesh?: MeshJson;
  children?: Array<SceneGraftNodeJson>;
}

const $mesh = Symbol('mesh');

/**
 * SceneNode
 */
export class SceneGraftNode extends ModelGraftNode {
  protected get[$type]() {
    return ModelGraphNodeType.node;
  }

  protected[$mesh]: Mesh|null = null;

  constructor(object3D: Object3D) {
    super(object3D);

    if ((object3D as Group).isGroup || (object3D as ThreeMesh).isMesh) {
      this[$mesh] = new Mesh(object3D as Group | ThreeMesh);
    }

    // The implication here is that a group is only created as a leaf that
    // represents the multiple primitives associated with a given glTF Mesh
    if (!(object3D as Group).isGroup) {
      const children: Array<ModelGraftNode> = [];

      for (const child of object3D.children) {
        children.push(new SceneGraftNode(child));
      }

      this[$children] = Object.freeze(children);
    }
  }

  get mesh() {
    return this[$mesh];
  }

  toJSON() {
    const result: SceneGraftNodeJson = {type: this[$type], id: this[$id]};

    if (this.mesh) {
      result.mesh = this.mesh.toJSON();
    }

    if (this.name) {
      result.name = this.name;
    }

    if (this.children.length) {
      result.children = this.children.map(child => child.toJSON()) as
          Array<SceneGraftNodeJson>;
    }

    return result;
  }
}


export interface ModelGraftJson {
  type: number;
  id: number;
  children?: Array<SceneGraftNodeJson>;
}

/**
 * ModelGraft
 */
export class ModelGraft extends ModelGraftNode {
  // NOTE: Least optimal approach follows
  getNodeByInternalId<T extends ModelGraftNode>(id: number): T|null {
    const nodes: Array<ModelGraftNode> = [this];

    while (nodes.length) {
      const next = nodes.shift()!;
      // console.log(next, next.children);

      if (next[$id] === id) {
        return next as T;
      }

      nodes.push(...next.children);
      if ((next as any).mesh) {
        nodes.push((next as any).mesh);
      }

      if ((next as any).material) {
        nodes.push((next as any).material);
      }

      if ((next as any).pbrMetallicRoughness) {
        nodes.push((next as any).pbrMetallicRoughness);
      }

      if ((next as any).primitives) {
        nodes.push(...(next as any).primitives);
      }
    }

    return null;
  }

  protected get[$type]() {
    return ModelGraphNodeType.scene;
  }

  constructor(scene: Scene) {
    super(scene);

    const children: Array<ModelGraftNode> = [];

    for (const child of scene.children) {
      children.push(new SceneGraftNode(child));
    }

    this[$children] = Object.freeze(children);
  }

  toJSON(): ModelGraftJson {
    const result: ModelGraftJson = {type: this[$type], id: this[$id]};

    if (this.children.length) {
      result.children = this.children.map(child => child.toJSON()) as
          Array<SceneGraftNodeJson>;
    }

    return result;
  }
}