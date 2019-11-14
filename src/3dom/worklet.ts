import {MaterialJson, MeshJson, ModelGraftJson, PbrMetallicRoughnessJson, PrimitiveJson, RGBA, SceneGraftNodeJson} from './scene-graft';

export function initializeWorklet() {
  const $id = Symbol('id');
  const $name = Symbol('name');

  const $children = Symbol('children');
  const $port = Symbol('port');

  abstract class ModelGraphNode {
    protected[$id]: number;
    protected[$name]: string;
    protected[$children]: Readonly<Array<ModelGraphNode>> = [];
    protected[$port]: MessagePort;

    get name() {
      return this[$name];
    }

    get children() {
      return this[$children];
    }

    constructor(json: any, port: MessagePort) {
      if (json.id != null) {
        this[$id] = json.id;
      }

      if (json.name != null) {
        this[$name] = json.name;
      }

      this[$port] = port;
    }
  }


  const $baseColorFactor = Symbol('baseColorFactor');

  class PbrMetallicRoughness extends ModelGraphNode {
    protected[$baseColorFactor]: Readonly<RGBA>;

    constructor(json: PbrMetallicRoughnessJson, port: MessagePort) {
      super(json, port);
      this[$baseColorFactor] =
          Object.freeze(json.baseColorFactor) as Readonly<RGBA>;
    }

    async setBaseColorFactor(baseColorFactor: RGBA) {
      this[$port].postMessage([this[$id], 'baseColorFactor', baseColorFactor]);
    }
  }


  const $pbrMetallicRoughness = Symbol('pbrMetallicRoughness');

  class Material extends ModelGraphNode {
    protected[$pbrMetallicRoughness]: PbrMetallicRoughness;

    get pbrMetallicRoughness() {
      return this[$pbrMetallicRoughness];
    }

    constructor(json: MaterialJson, port: MessagePort) {
      super(json, port);

      this[$pbrMetallicRoughness] =
          new PbrMetallicRoughness(json.pbrMetallicRoughness, port);
    }
  }


  const $material = Symbol('material');

  class Primitive extends ModelGraphNode {
    protected[$material]: Material|null = null;

    get material() {
      return this[$material];
    }

    constructor(json: PrimitiveJson, port: MessagePort) {
      super(json, port);

      if (json.material) {
        this[$material] = new Material(json.material, port);
      }
    }
  }


  class Mesh extends ModelGraphNode {
    get primitives() {
      return this[$children];
    }

    constructor(json: MeshJson, port: MessagePort) {
      super(json, port);

      if (json.primitives) {
        const primitives: Array<Primitive> = [];

        for (const primitiveJson of json.primitives) {
          primitives.push(new Primitive(primitiveJson, port));
        }

        this[$children] = Object.freeze(primitives);
      }
    }
  }


  const $mesh = Symbol('mesh');

  class SceneNode extends ModelGraphNode {
    protected[$mesh]: Mesh|null = null;

    get mesh() {
      return this[$mesh];
    }

    constructor(json: SceneGraftNodeJson, port: MessagePort) {
      super(json, port);

      if (json.mesh) {
        this[$mesh] = new Mesh(json.mesh, port);
      }

      if (json.children) {
        const children: Array<SceneNode> = [];
        for (let i = 0; i < json.children.length; ++i) {
          children.push(new SceneNode(json.children[i], port));
        }
        this[$children] = Object.freeze(children);
      }
    }
  }

  class ModelGraph extends ModelGraphNode {
    constructor(json: ModelGraftJson, port: MessagePort) {
      super(json, port);

      if (json.children) {
        const children: Array<SceneNode> = [];
        for (let i = 0; i < json.children.length; ++i) {
          children.push(new SceneNode(json.children[i], port));
        }
        this[$children] = Object.freeze(children);
      }
    }
  }

  self.addEventListener('message', (event: MessageEvent) => {
    if (event.data && event.data.type === 'initialize-model') {
      (self as any).model = new ModelGraph(event.data.model, event.ports[0]);
      self.dispatchEvent(new CustomEvent(
          'model-change', {detail: {model: (self as any).model}}));
    }
  });
}