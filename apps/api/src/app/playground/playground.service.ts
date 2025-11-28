import { Injectable, Logger } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

@Injectable()
export class PlaygroundService {
  private readonly logger = new Logger(PlaygroundService.name);
  private renovateProcess: ChildProcess | null = null;
  private isProcessRunning = false;
  private stderrBuffer = '';
  private stdoutBuffer = '';

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

          // Send final status message instead of error
          subscriber.next({
            data: `Renovate process completed with exit code ${exitCode}`,
            type: exitCode === 0 ? 'success' : 'warning',
          });

          // For Renovate, exit code 1 is often normal (no updates found)
          // Only treat codes > 1 as actual errors
          if (exitCode > 1) {
            subscriber.next({
              data: `Process failed with exit code ${exitCode}. Check logs for details.`,
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

      // Format the message with timestamp
      // Send the ORIGINAL line (already a JSON string) plus metadata
      const messageWithTime: MessageEvent = {
        data: {
          original: line,
          time: timestamp,
          msg: parsedLine.msg || '',
          level: parsedLine.level || 'info'
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
