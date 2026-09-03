import { Injectable, Logger } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Renovate logs via pino, which uses numeric levels rather than strings
const PINO_LEVELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

function normalizeLogLevel(level: unknown): string {
  if (typeof level === 'number') {
    return PINO_LEVELS[level] ?? 'info';
  }
  return typeof level === 'string' ? level : 'info';
}

@Injectable()
export class PlaygroundService {
  private readonly logger = new Logger(PlaygroundService.name);
  private renovateProcess: ChildProcess | null = null;
  private isProcessRunning = false;
  private stderrBuffer = '';
  private stdoutBuffer = '';
  // Collected verbatim so the real failure reason survives even when Renovate exits with code 1
  private capturedErrors: string[] = [];

  runRenovate(token: string, repository: string, config: object): Observable<MessageEvent> {
    // If a process is already running, queue this request
    if (this.isProcessRunning) {
      this.logger.log('Renovate process already running, queueing request');
      return new Observable<MessageEvent>(subscriber => {
        subscriber.next({
          data: 'Renovate process already running, please wait for it to complete',
          type: 'info'
        });
        subscriber.complete();
      });
    }

    // Mark as running to prevent concurrent processes
    this.isProcessRunning = true;
    this.capturedErrors = [];
    return new Observable<MessageEvent>(subscriber => {
      try {
        // Create a temporary directory for Renovate
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renovate-'));
        const configPath = path.join(tempDir, 'config.json');

        // Write config to a temporary file
        fs.writeFileSync(configPath, JSON.stringify({
          ...config,
          // Set the repository to target
          repositories: [repository.replace('https://github.com/', '')],
          // Ensure we're in dry-run mode for the playground
          dryRun: true
        }, null, 2));

        // Prepare Renovate command
        const renovateScriptPath = path.resolve(process.cwd(), 'node_modules/renovate/dist/renovate.js');
        const args = [
          renovateScriptPath
        ];

        this.logger.log(`Starting Renovate with Node.js: node ${args.join(' ')}`);

        // Start Renovate process using Node.js
        this.renovateProcess = spawn('node', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            // Pass the GitHub token
            RENOVATE_TOKEN: token,
            GITHUB_COM_TOKEN: token,
            RENOVATE_PLATFORM: "github",
            // Ensure we don't use any global config
            RENOVATE_CONFIG_FILE: configPath,
            // Set log level
            LOG_LEVEL: 'debug',
            LOG_FORMAT: 'json',
            // Disable certain features for playground
            RENOVATE_DRY_RUN: 'true',
          },
        });

        this.logger.log('Renovate process spawned, PID:', this.renovateProcess.pid);

        // Handle process exit
        this.renovateProcess.on('close', (code) => {
          const exitCode = code ?? -1; // Handle null case
          this.logger.log(`Renovate process exited with code ${exitCode}`);

          // Process any remaining buffered data
          if (this.stderrBuffer.trim()) {
            this.processLogLine(this.stderrBuffer.trim(), 'log', subscriber);
            this.stderrBuffer = '';
          }
          if (this.stdoutBuffer.trim()) {
            this.processLogLine(this.stdoutBuffer.trim(), 'stdout', subscriber);
            this.stdoutBuffer = '';
          }

          // Exit code 1 can mean either "no updates found" or a real failure (bad token, invalid
          // config, repo not found) that also exits 1 - so trust captured error/fatal lines over the code alone
          const hasRealError = exitCode > 1 || this.capturedErrors.length > 0;

          // Send final status message instead of error
          subscriber.next({
            data: `Renovate process completed with exit code ${exitCode}`,
            type: exitCode === 0 ? 'success' : hasRealError ? 'error' : 'warning',
          });

          if (hasRealError) {
            const detail = this.capturedErrors.length > 0
              ? this.capturedErrors.join('\n')
              : `Process failed with exit code ${exitCode}. Check logs for details.`;
            subscriber.next({
              data: detail,
              type: 'error',
            });
          }

          // Complete the stream instead of erroring
          subscriber.complete();
          this.cleanup(tempDir);

          // Mark process as no longer running
          this.isProcessRunning = false;
        });

        // Handle process error
        this.renovateProcess.on('error', (error) => {
          this.logger.error('Renovate process error:', error);
          subscriber.error(error);
          this.cleanup(tempDir);

          // Mark process as no longer running
          this.isProcessRunning = false;
        });

        // Stream stdout
        if (this.renovateProcess.stdout) {
          this.renovateProcess.stdout.on('data', (data) => {
            this.stdoutBuffer += data.toString();
            const lines = this.stdoutBuffer.split('\n');
            
            // Keep the last incomplete line in the buffer
            this.stdoutBuffer = lines.pop() || '';
            
            // Process complete lines
            lines.forEach((line: string) => {
              if (line.trim()) {
                this.processLogLine(line.trim(), 'stdout', subscriber);
              }
            });
          });
        }

        // Stream stderr (where most Renovate logs go)
        if (this.renovateProcess.stderr) {
          this.renovateProcess.stderr.on('data', (data) => {
            this.stderrBuffer += data.toString();
            const lines = this.stderrBuffer.split('\n');
            
            // Keep the last incomplete line in the buffer
            this.stderrBuffer = lines.pop() || '';
            
            // Process complete lines
            lines.forEach((line: string) => {
              if (line.trim()) {
                this.processLogLine(line.trim(), 'log', subscriber);
              }
            });
          });
        }

        // Cleanup on unsubscribe
        return () => {
          if (this.renovateProcess) {
            this.renovateProcess.kill();
            this.renovateProcess = null;
          }
          this.cleanup(tempDir);
          
          // Clear buffers
          this.stderrBuffer = '';
          this.stdoutBuffer = '';

          // Mark process as no longer running
          this.isProcessRunning = false;
        };
      } catch (error) {
        this.logger.error('Error in runRenovate:', error);
        subscriber.error(error);

        // Mark process as no longer running
        this.isProcessRunning = false;

        return () => { /* Cleanup on error */ };
      }
    });
  }

  private processLogLine(line: string, type: string, subscriber: Subscriber<MessageEvent>): void {
    try {
      // Try to parse the line as JSON
      const parsedLine = JSON.parse(line);

      // Extract timestamp if available
      const timestamp = parsedLine.time || new Date().toISOString();
      const normalizedLevel = normalizeLogLevel(parsedLine.level);

      // Check if this is a special message type and set type accordingly
      let messageType = type;
      
      // Log all messages that contain "branch" to debug
      if (parsedLine.msg && typeof parsedLine.msg === 'string' && parsedLine.msg.toLowerCase().includes('branch')) {
        this.logger.log(`[Backend] Branch-related messages: "${parsedLine.msg}"`);
        this.logger.log(`[Backend] Has branchesInformation field: ${!!parsedLine.branchesInformation}`);
      }
  
      
      if (parsedLine.msg === 'packageFiles with updates' && parsedLine.config) {
        this.logger.debug('✅ Backend: Found packageFiles with updates');
        messageType = 'packageFilesWithUpdates';
      } else if (parsedLine.msg === 'packageFiles' && parsedLine.packageFiles) {
        this.logger.debug('✅ Backend: Found packageFiles');
        messageType = 'packageFiles';
      } else if (parsedLine.msg === 'branches info extended' && parsedLine.branchesInformation) {
        this.logger.log(`✅ Backend: Found branches info extended with ${parsedLine.branchesInformation?.length} branches`);
        messageType = 'branchesInfoExtended';
      }

      // Surface real error/fatal lines explicitly so they aren't lost in the debug stream
      // or masked by a misleadingly "normal" exit code later
      if (normalizedLevel === 'error' || normalizedLevel === 'fatal') {
        messageType = 'error';
        if (typeof parsedLine.msg === 'string' && parsedLine.msg) {
          this.capturedErrors.push(parsedLine.msg);
        }
      }

      const { logContext, ...uiLogLine } = parsedLine;

      // Format the message with timestamp
      // Send the ORIGINAL line (already a JSON string) plus metadata
      const messageWithTime: MessageEvent = {
        data: {
          original: JSON.stringify(uiLogLine),
          time: timestamp,
          msg: parsedLine.msg || '',
          level: normalizedLevel
        },
        type: messageType
      };

      subscriber.next(messageWithTime);
    } catch (e) {
      subscriber.next({
        data: {
          original: line,
          time: new Date().toISOString()
        },
        type: type
      });
    }
  }

  private cleanup(tempDir: string) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.logger.error(`Error cleaning up temp directory ${tempDir}:`, error);
    }
  }
}
