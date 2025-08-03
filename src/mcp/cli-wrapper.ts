import { execa } from 'execa';

export interface SessionbaseOptions {
  cwd?: string;
}

export class SessionbaseCLI {
  private options: SessionbaseOptions;

  constructor(options: SessionbaseOptions = {}) {
    this.options = options;
  }

  private async runCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execa('sessionbase', args, {
        cwd: this.options.cwd,
        env: process.env,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      throw new Error(`SessionBase CLI error: ${error}`);
    }
  }

  async listSessions(options: {
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    path?: string;
    global?: boolean;
  } = {}): Promise<string> {
    const args = ['list'];
    if (options.claude) args.push('--claude');
    if (options.gemini) args.push('--gemini');
    if (options.qchat) args.push('--qchat');
    if (options.path) args.push('--path', options.path);
    if (options.global) args.push('--global');
    
    const result = await this.runCommand(args);
    return result.stdout;
  }

  async pushSession(filePath?: string, options: {
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    private?: boolean;
    title?: string;
    tags?: string;
    summary?: string;
  } = {}): Promise<string> {
    const args = ['push'];
    if (filePath) args.push(filePath);
    if (options.claude) args.push('--claude');
    if (options.gemini) args.push('--gemini');
    if (options.qchat) args.push('--qchat');
    if (options.private) args.push('--private');
    if (options.title) args.push('--title', options.title);
    if (options.tags) args.push('--tags', options.tags);
    if (options.summary) args.push('--summary', options.summary);
    
    const result = await this.runCommand(args);
    return result.stdout;
  }

  async login(token?: string): Promise<string> {
    const args = ['login'];
    if (token) args.push('--token', token);
    
    const result = await this.runCommand(args);
    return result.stdout;
  }

  async whoami(): Promise<string> {
    const result = await this.runCommand(['whoami']);
    return result.stdout;
  }

  async logout(): Promise<string> {
    const result = await this.runCommand(['logout']);
    return result.stdout;
  }
}