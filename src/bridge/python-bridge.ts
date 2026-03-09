import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";

export interface MonitorMessage {
  type: "message" | "image" | "status" | "error";
  data: Record<string, unknown>;
}

export class PythonBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private pythonCommand: string;
  private scriptPath: string;
  private configPath: string;

  constructor(pythonCommand = "python", scriptDir?: string) {
    super();
    this.pythonCommand = pythonCommand;
    this.scriptPath = path.join(scriptDir ?? path.join(__dirname, "../../python"), "monitor.py");
    this.configPath = path.join(scriptDir ?? path.join(__dirname, "../../python"), "monitor_config.json");
  }

  parseMessage(raw: string): MonitorMessage | null {
    if (!raw || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed.type && parsed.data) {
        return parsed as MonitorMessage;
      }
      return null;
    } catch {
      return null;
    }
  }

  start(): void {
    this.process = spawn(this.pythonCommand, [this.scriptPath], {
      env: { ...process.env, MONITOR_CONFIG: this.configPath },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    this.process.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const msg = this.parseMessage(line);
        if (msg) {
          this.emit(msg.type, msg.data);
        }
      }
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.emit("error", { message: chunk.toString("utf-8") });
    });

    this.process.on("exit", (code) => {
      this.emit("exit", { code });
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
