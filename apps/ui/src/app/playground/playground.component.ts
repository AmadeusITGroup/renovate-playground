import { Component, ViewChild, ElementRef, OnInit, AfterViewChecked, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PlaygroundService, RenovateLogMessage, RenovateRunResult } from './playground.service';
import { Subscription } from 'rxjs';
// Define the Dependency interface outside the component class
interface Dependency {
  type: string;
  name: string;
  currentVersion: string;
  newVersion: string;
  manager?: string;
  depType?: string;
  status?: 'discovered' | 'update-available';
}

// Define the LogEntry interface for displaying logs with time
interface LogEntry {
  message: string;
  time: string;
  level: string;
  type: string;
  raw?: unknown;
}

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule], // Add CommonModule for *ngFor/*ngIf
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.css'],
})
export class PlaygroundComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('logContainer') private readonly logContainer: ElementRef;

  renovateForm: FormGroup;
  isRunning = false;
  logs: LogEntry[] = [];
  dependencies: Dependency[] = [];
  private currentEventSource: { close: () => void } | null = null;
  private currentSubscription: Subscription | null = null;
  private shouldAutoScroll = true;

  constructor(
    private readonly fb: FormBuilder,
    private readonly playgroundService: PlaygroundService,
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.renovateForm = this.fb.group({
      repositoryUrl: ['', [Validators.required, this.urlValidator]],
      githubToken: ['', Validators.required],
      renovateConfig: [
        '{\n  "extends": ["config:recommended"]\n}',
        [Validators.required, this.jsonValidator],
      ],
    });
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  runRenovate(): void {
    if (this.renovateForm.invalid) {
      return;
    }

    // Clean up any existing connections before starting a new one
    this.cleanupConnections();

    this.isRunning = true;
    this.logs = [];
    this.dependencies = [];
    this.shouldAutoScroll = true; // Reset auto-scroll when starting new run

    const { repositoryUrl, githubToken, renovateConfig } = this.renovateForm.value;

    try {
      const parsedConfig = JSON.parse(renovateConfig);
      const result: RenovateRunResult = this.playgroundService.runRenovate(githubToken, repositoryUrl, parsedConfig);

      // Store the EventSource for later cleanup
      this.currentEventSource = result.eventSource;

      // Subscribe to the messages
      this.currentSubscription = result.messages.subscribe({
        next: (logMessage: RenovateLogMessage) => {
          // Run inside Angular zone to trigger change detection
          this.ngZone.run(() => {
            console.log('Received log message:', logMessage);
            console.log('Received log message:', logMessage);

            // Create a log entry from the message
            const logEntry: LogEntry = {
              message: logMessage.msg || '',
              time: this.formatTimestamp(logMessage.time) || this.getCurrentTimestamp(),
              level: logMessage.level || 'info',
              type: logMessage.type || 'log',
              raw: logMessage
            };

            this.logs.push(logEntry);
            // Process packageFiles if present
            if (logMessage.type === 'packageFilesWithUpdates' && logMessage.config) {
              this.processPackageFilesWithUpdates(logMessage.config);
            } else if (logMessage.type === 'packageFiles' && logMessage.packageFiles) {
              this.processPackageFiles(logMessage.packageFiles);
            } else if (logMessage.type === 'branchesInfoExtended' && logMessage.branchesInformation) {
              // TODO: Replace with proper logging mechanism if needed
              this.processBranchesInfoExtended(logMessage.branchesInformation);
            } else if (logMessage.msg === 'branches info extended' && logMessage.branchesInformation) {
              // Fallback: Check msg directly in case type wasn't set
              this.processBranchesInfoExtended(logMessage.branchesInformation);
            } else {
              // Still try the regex-based approach as fallback
              this.parseDependencyUpdate(logEntry.message);
            }
            // Force change detection and scroll to bottom
            this.cdr.detectChanges();
            this.scrollToBottom();
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.logs.push({
              message: `Error: ${message}`,
              time: this.getCurrentTimestamp(),
              level: 'error',
              type: 'error'
            });
            this.isRunning = false;
            this.cdr.detectChanges();
          });
        },
        complete: () => {
          this.ngZone.run(() => {
            this.isRunning = false;
            this.logs.push({
              message: 'Renovate process completed.',
              time: this.getCurrentTimestamp(),
              level: 'success',
              type: 'success'
            });
            this.cdr.detectChanges();
          });
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logs.push({
        message: `Error parsing Renovate config: ${message}`,
        time: this.getCurrentTimestamp(),
        level: 'error',
        type: 'error'
      });
      this.isRunning = false;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.logContainer && this.logContainer.nativeElement && this.shouldAutoScroll) {
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
          if (this.logContainer && this.logContainer.nativeElement && this.shouldAutoScroll) {
            this.logContainer.nativeElement.scrollTop = this.logContainer.nativeElement.scrollHeight;
          }
        }, 0);
      }
    } catch (err) {
      // Silently ignore errors
    }
  }

  checkScrollPosition(): void {
    try {
      if (this.logContainer && this.logContainer.nativeElement) {
        const element = this.logContainer.nativeElement;
        const threshold = 5; // pixels from bottom
        this.shouldAutoScroll = element.scrollTop + element.clientHeight >= element.scrollHeight - threshold;
      }
    } catch (err) {
      // Silently ignore errors
    }
  }

  private parseDependencyUpdate(log: string): void {
    const regex = /Upgrading dependency (\S+) from (\S+) to (\S+)/;
    const match = log.match(regex);

    if (match) {
      const dep: Dependency = {
        type: 'npm', // This can be enhanced to detect other types
        name: match[1],
        currentVersion: match[2],
        newVersion: match[3],
      };
      if (!this.dependencies.some((d) => d.name === dep.name && d.newVersion === dep.newVersion)) {
        this.dependencies.push(dep);
      }
    }
  }

  private processPackageFiles(packageFiles: unknown): void {
    if (!packageFiles || !Array.isArray(packageFiles)) {
      return;
    }

    // Process each package file
    for (const pkgFile of packageFiles) {
      if (pkgFile.deps) {
        // Process each dependency in the package file
        for (const [depName, depInfo] of Object.entries(pkgFile.deps)) {
          const dep = depInfo as Record<string, unknown>;
          if (dep.updates && Array.isArray(dep.updates) && dep.updates.length > 0) {
            // Get the latest update
            const update = dep.updates[dep.updates.length - 1] as Record<string, unknown>;

            const dependency: Dependency = {
              type: pkgFile.manager || 'npm',
              name: depName,
              currentVersion: (dep.currentVersion as string) || 'unknown',
              newVersion: (update.newVersion as string) || 'unknown',
              manager: pkgFile.manager,
              depType: (dep.depType as string) || undefined
            };

            // Check if this dependency is already in the array
            if (!this.dependencies.some((d) => d.name === dependency.name && d.newVersion === dependency.newVersion)) {
              this.dependencies.push(dependency);
            }
          }
        }
      }
    }
  }

  private processPackageFilesWithUpdates(config: unknown): void {
    const configObj = config as Record<string, unknown>;
    if (!configObj || !configObj.regex || !Array.isArray(configObj.regex)) {
      return;
    }

    // Process each regex configuration
    for (const regexConfig of configObj.regex) {
      if (regexConfig.deps && Array.isArray(regexConfig.deps)) {
        // Process each dependency in the regex config
        for (const dep of regexConfig.deps) {
          if (dep.updates && Array.isArray(dep.updates) && dep.updates.length > 0) {
            // Process each update for this dependency
            for (const update of dep.updates) {
              const dependency: Dependency = {
                type: dep.datasource || 'unknown',
                name: dep.packageName || dep.depName || 'unknown',
                currentVersion: dep.currentVersion || dep.currentValue || 'unknown',
                newVersion: update.newVersion || update.newValue || 'unknown',
                manager: regexConfig.packageFile ? 'regex' : dep.datasource,
                depType: dep.depType || update.updateType
              };

              this.addOrUpdateDependency(dependency);
            }
          }
        }
      }
    }
  }

  private processBranchesInfoExtended(branchesInformation: unknown[]): void {
    if (!branchesInformation || !Array.isArray(branchesInformation)) {
      return;
    }

    // Logging: Starting to process branchesInformation

    // Process each branch
    for (const branch of branchesInformation) {
      const branchObj = branch as Record<string, unknown>;
      // Check if upgrades exist
      if (branchObj.upgrades && Array.isArray(branchObj.upgrades)) {
        // Process each upgrade in the branch
        for (const upgrade of branchObj.upgrades) {
          const upgradeObj = upgrade as Record<string, unknown>;
          const dependency: Dependency = {
            type: (upgradeObj.datasource as string) || 'unknown',
            name: (upgradeObj.depName as string) || (upgradeObj.packageName as string) || 'unknown',
            currentVersion: (upgradeObj.currentVersion as string) || (upgradeObj.fixedVersion as string) || 'unknown',
            newVersion: (upgradeObj.newVersion as string) || 'unknown',
            manager: upgradeObj.datasource as string,
            depType: upgradeObj.updateType as string,
            // Set status based on prNo - null means repo is not onboarded yet
            status: branchObj.prNo === null ? 'discovered' : 'update-available'
          };

          this.addOrUpdateDependency(dependency);
          // dependencyCount++;
        }
      }
    }

    // For production, consider using a proper logging service instead of console.log
    // Example: this.logger.info(`[UI Component] Extracted ${dependencyCount} dependencies. Total in table: ${this.dependencies.length}`);
  }

  private addOrUpdateDependency(dependency: Dependency): void {
    // Check if this dependency is already in the array
    const existingIndex = this.dependencies.findIndex((d) =>
      d.name === dependency.name &&
      d.newVersion === dependency.newVersion &&
      d.currentVersion === dependency.currentVersion
    );

    if (existingIndex === -1) {
      // Add new dependency
      this.dependencies.push(dependency);
    } else {
      // Update existing dependency (e.g., update status if it changed)
      this.dependencies[existingIndex] = {
        ...this.dependencies[existingIndex],
        ...dependency
      };
    }
  }

  private formatTimestamp(timestamp: string): string {
    if (!timestamp) return this.getCurrentTimestamp();

    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return timestamp;
    }
  }

  private jsonValidator(control: AbstractControl): ValidationErrors | null {
    try {
      JSON.parse(control.value);
    } catch (e) {
      return { jsonInvalid: true };
    }
    return null;
  }

  private urlValidator(control: AbstractControl): ValidationErrors | null {
    const urlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
    if (!control.value || !urlPattern.test(control.value)) {
      return { urlInvalid: true };
    }
    return null;
  }

  ngOnDestroy(): void {
    this.cleanupConnections();
  }

  private cleanupConnections(): void {
    // Clean up subscription if it exists
    if (this.currentSubscription) {
      this.currentSubscription.unsubscribe();
      this.currentSubscription = null;
    }

    // Close EventSource if it exists
    if (this.currentEventSource) {
      this.currentEventSource.close();
      this.currentEventSource = null;
    }
  }

  getLogClass(log: LogEntry): string {
    if (log.level === 'error' || log.message.toLowerCase().includes('error') || log.message.toLowerCase().includes('failed') || log.message.toLowerCase().includes('fatal')) {
      return 'log-error';
    }
    if (log.level === 'warn' || log.message.toLowerCase().includes('warn') || log.message.toLowerCase().includes('warning')) {
      return 'log-warning';
    }
    if (log.level === 'success' || log.message.toLowerCase().includes('success') || log.message.toLowerCase().includes('completed') || log.message.toLowerCase().includes('done')) {
      return 'log-success';
    }
    if (log.level === 'info' || log.message.toLowerCase().includes('info') || log.message.toLowerCase().includes('starting') || log.message.toLowerCase().includes('running')) {
      return 'log-info';
    }
    return 'log-default';
  }

  getLogMessage(log: LogEntry): string {
    // Remove common log prefixes to clean up the message
    return log.message
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/, '') // ISO timestamp
      .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '') // [HH:MM:SS] format
      .replace(/^(INFO|WARN|ERROR|DEBUG):\s*/i, '') // Log level prefixes
      .trim();
  }

  getLogIcon(log: LogEntry): string {
    const logClass = this.getLogClass(log);
    switch (logClass) {
      case 'log-error':
        return '❌';
      case 'log-warning':
        return '⚠️';
      case 'log-success':
        return '✅';
      case 'log-info':
        return 'ℹ️';
      default:
        return '📝';
    }
  }

  getCurrentTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getStatusBadgeClass(status?: string): string {
    switch (status) {
      case 'discovered':
        return 'badge bg-info';
      case 'update-available':
        return 'badge bg-success';
      default:
        return 'badge bg-secondary';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'discovered':
        return 'Discovered';
      case 'update-available':
        return 'Update Available';
      default:
        return 'Unknown';
    }
  }
}
