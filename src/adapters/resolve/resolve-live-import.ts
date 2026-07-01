import { spawn } from "child_process";
import * as path from "path";
import * as url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export interface LiveImportOptions {
  timelineName?: string;
  redactMediaPaths?: boolean;
}

export interface LiveImportResult {
  success: boolean;
  data?: any;
  error?: string;
  errorType?: string;
}

export class ResolveLiveImporter {
  
  /**
   * Spawns the Python bridge to extract live timeline data from DaVinci Resolve.
   */
  async runImport(options: LiveImportOptions = {}): Promise<LiveImportResult> {
    return new Promise((resolve, reject) => {
      const pythonExec = process.env.EDITVCS_PYTHON_PATH || "python";
      const scriptPath = path.join(__dirname, "bridge", "resolve_export.py");
      
      const args = [scriptPath, "--active-timeline"];
      if (options.redactMediaPaths) {
        args.push("--redact-media-paths");
      }

      const child = spawn(pythonExec, args);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          // If python crashes or has syntax errors
          return resolve({
            success: false,
            error: `Python process exited with code ${code}.\nStderr: ${stderr}`,
            errorType: "ProcessExitError"
          });
        }

        try {
          const parsed = JSON.parse(stdout);
          
          if (!parsed.success) {
             return resolve({
               success: false,
               error: parsed.error,
               errorType: parsed.errorType
             });
          }

          // In a real production system, use Zod for runtime schema validation here.
          // For MVP, basic duck-typing check
          if (!parsed.timeline || !parsed.project) {
             return resolve({
               success: false,
               error: "Invalid JSON schema returned by Python bridge.",
               errorType: "SchemaValidationError"
             });
          }

          resolve({
            success: true,
            data: parsed
          });

        } catch (e: any) {
          resolve({
            success: false,
            error: `Failed to parse Python bridge output. Error: ${e.message}\nOutput: ${stdout}`,
            errorType: "JSONParseError"
          });
        }
      });
      
      child.on("error", (err) => {
        resolve({
          success: false,
          error: `Failed to spawn Python process. Is Python installed? Error: ${err.message}`,
          errorType: "SpawnError"
        });
      });
    });
  }
}
