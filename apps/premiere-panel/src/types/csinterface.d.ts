/**
 * Minimal type definition for Adobe's CSInterface.
 * Avoids using `any` when communicating with ExtendScript.
 */

declare global {
  interface Window {
    CSInterface: typeof CSInterface;
  }
}

export class CSInterface {
  constructor();
  
  /** Evaluates an ExtendScript string and passes the result to the callback. */
  evalScript(script: string, callback?: (result: string) => void): void;
  
  /** Retrieves a system path (e.g. extension path, common files, etc.). */
  getSystemPath(pathType: string): string;
}
