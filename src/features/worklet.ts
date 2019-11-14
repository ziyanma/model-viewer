import {ModelGraft} from '../3dom/scene-graft.js';
import {initializeWorklet} from '../3dom/worklet.js';
import ModelViewerElementBase, {$needsRender, $scene} from '../model-viewer-base.js';
import {Constructor} from '../utilities.js';

const $onLoad = Symbol('onLoad');
const $loadHandler = Symbol('loadHandler');
const $worklet = Symbol('worklet');
const $modelGraft = Symbol('modelGraft');

export interface WorkletInterface {}

export const WorkletMixin = <T extends Constructor<ModelViewerElementBase>>(
    ModelViewerElement: T): Constructor<WorkletInterface>&T => {
  class WorkletModelViewerElement extends ModelViewerElement {
    protected[$loadHandler] = () => this[$onLoad]();
    protected[$worklet]: Worker|null = null;
    protected[$modelGraft]: ModelGraft|null = null;

    get worklet() {
      return this[$worklet];
    }

    connectedCallback() {
      super.connectedCallback();
      const script = this.querySelector('script[type="model-viewer-worklet"]');

      if (script == null) {
        return;
      }

      const scriptText = script.textContent;

      const workletScript = `
${initializeWorklet.toString()};

initializeWorklet();

${scriptText};`;

      const blob = new Blob([workletScript], {type: 'text/javascript'});
      const url = URL.createObjectURL(blob);

      this[$worklet] = new Worker(url);
      this.addEventListener('load', this[$loadHandler]);
    }

    [$onLoad]() {
      if (this[$worklet] == null) {
        return;
      }

      const channel = new MessageChannel();
      const port = channel.port1;

      this[$modelGraft] = new ModelGraft(this[$scene]);
      this[$worklet]!.postMessage(
          {type: 'initialize-model', model: this[$modelGraft]!.toJSON()},
          [channel.port2]);

      port.addEventListener('message', (event: MessageEvent) => {
        const [id, property, value] = event.data as [number, string, any[]];

        const node = this[$modelGraft]!.getNodeByInternalId(id);

        if (node != null) {
          // Hacky
          (node as any)[property] = value;
        }

        this[$needsRender]();
      });
      port.start();
    }
  }

  return WorkletModelViewerElement;
};