import { PremiereAdapter } from "./premiere-adapter.js";
import { adapterRegistry } from "../base.js";

const adapter = new PremiereAdapter();
adapterRegistry.register(adapter);

export { PremiereAdapter };
