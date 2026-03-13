import { Component, ViewChild, ElementRef, OnInit, AfterViewInit, AfterViewChecked, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PlaygroundService, RenovateLogMessage, RenovateRunResult } from './playground.service';
import { Subscription } from 'rxjs';

declare const require: any;
// Define the Dependency interface outside the component class
interface Dependency {
  type: string;
  name: string;
  currentVersion: string;
  newVersion: string;
  manager?: string;
  depType?: string;
  status?: 'discovered' | 'update-available';
  registryUrl?: string;
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
export class PlaygroundComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @ViewChild('logContainer') private readonly logContainer: ElementRef;
  @ViewChild('monacoContainer', { static: false }) private readonly monacoContainer: ElementRef;

  renovateForm: FormGroup;
  isRunning = false;
  logs: LogEntry[] = [];
  dependencies: Dependency[] = [];
  private currentEventSource: { close: () => void } | null = null;
  private currentSubscription: Subscription | null = null;
  private shouldAutoScroll = true;
  private monacoEditor: any;
  private editorInitialized = false;

  // Resizable split pane
  splitPosition = 50; // percentage for left pane
  private readonly MIN_SPLIT = 5; // minimum percentage for either pane
  private readonly MAX_SPLIT = 95; // maximum percentage for either pane
  private isDragging = false;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;

  // Resizable Monaco editor height
  editorHeight = 350; // pixels
  private readonly MIN_EDITOR_HEIGHT = 100;
  private readonly MAX_EDITOR_HEIGHT = 800;
  private isEditorResizing = false;
  private editorResizeStartY = 0;
  private editorResizeStartHeight = 0;
  private boundEditorResizeMove: ((e: MouseEvent) => void) | null = null;
  private boundEditorResizeUp: (() => void) | null = null;

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

  ngAfterViewInit(): void {
    this.initMonaco();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private initMonaco(): void {
    if (this.editorInitialized) return;

    const onGotAmdLoader = () => {
      const vsPath = 'assets/monaco/vs';
      (window as any).require.config({ paths: { vs: vsPath } });
      (window as any).require(['vs/editor/editor.main'], () => {
        this.ngZone.run(() => this.createEditor());
      });
    };

    // Load AMD loader if not already loaded
    if (!(window as any).require) {
      const loaderScript = document.createElement('script');
      loaderScript.type = 'text/javascript';
      loaderScript.src = 'assets/monaco/vs/loader.js';
      loaderScript.addEventListener('load', onGotAmdLoader);
      document.body.appendChild(loaderScript);
    } else {
      onGotAmdLoader();
    }
  }

  private createEditor(): void {
    if (!this.monacoContainer?.nativeElement) return;

    const monaco = (window as any).monaco;
    const initialValue = this.renovateForm.get('renovateConfig')?.value || '{}';

    this.monacoEditor = monaco.editor.create(this.monacoContainer.nativeElement, {
      value: initialValue,
      language: 'json',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      tabSize: 2,
      formatOnPaste: true,
      formatOnType: true,
    });

    // Sync editor content back to the form control
    this.monacoEditor.onDidChangeModelContent(() => {
      const value = this.monacoEditor.getValue();
      this.renovateForm.get('renovateConfig')?.setValue(value, { emitEvent: false });
      this.renovateForm.get('renovateConfig')?.updateValueAndValidity();
    });

    // Listen for form control changes to update editor
    this.renovateForm.get('renovateConfig')?.valueChanges.subscribe((value: string) => {
      if (this.monacoEditor && value !== this.monacoEditor.getValue()) {
        this.monacoEditor.setValue(value);
      }
    });

    this.editorInitialized = true;
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

  private processPackageFilesWithUpdates(config: unknown): void {
    const configObj = config as Record<string, unknown>;
    
    // Process all manager types dynamically (npm, regex, docker, maven, etc.)
    for (const [managerKey, managerValue] of Object.entries(configObj)) {
      if (!Array.isArray(managerValue)) continue;
      
      for (const packageFile of managerValue) {
        if (packageFile.deps && Array.isArray(packageFile.deps)) {
          for (const dep of packageFile.deps) {
            // Check if there are updates for this dependency
            if (dep.updates && Array.isArray(dep.updates) && dep.updates.length > 0) {
              // Process each update
              for (const update of dep.updates) {
                const packageName = dep.packageName || dep.depName || 'unknown';
                const registryUrl = this.constructFullPackageUrl(
                  dep.registryUrl || dep.sourceUrl,
                  packageName,
                  dep.datasource || managerKey
                );
                
                const dependency: Dependency = {
                  type: dep.datasource || managerKey,
                  name: packageName,
                  currentVersion: dep.currentVersion || dep.currentValue || 'unknown',
                  newVersion: update.newVersion || update.newValue || 'unknown',
                  manager: packageFile.manager || managerKey,
                  depType: dep.depType || update.updateType,
                  status: 'discovered', // Default status for discovered updates
                  registryUrl: registryUrl
                };
                
                this.addOrUpdateDependency(dependency);
              }
            }
          }
        }
      }
    }
  }

  private constructFullPackageUrl(baseUrl: string | undefined, packageName: string, datasource: string): string | undefined {
    if (!baseUrl || !packageName) {
      return undefined;
    }

    // Handle different datasource types
    switch (datasource) {
      case 'npm':
        // For npm registries, append the package name
        return `${baseUrl}/${packageName}`;
      case 'github-tags':
      case 'github-releases':
        // GitHub URLs are typically already complete
        return baseUrl.includes(packageName) ? baseUrl : `https://github.com/${packageName}`;
      case 'node-version':
        // Node.js distribution URL
        return baseUrl;
      default:
        // For other types, try to append package name if it's not already there
        return baseUrl.includes(packageName) ? baseUrl : `${baseUrl}/${packageName}`;
    }
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
    if (this.monacoEditor) {
      this.monacoEditor.dispose();
      this.monacoEditor = null;
    }
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

  // ── Resizable split pane ──────────────────────────────────────

  onDividerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging = true;

    this.boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    this.boundMouseUp = () => this.onMouseUp();

    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;

    const container = document.querySelector('.split-pane') as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let pct = ((event.clientX - rect.left) / rect.width) * 100;

    // Clamp to min/max
    pct = Math.max(this.MIN_SPLIT, Math.min(this.MAX_SPLIT, pct));

    this.ngZone.run(() => {
      this.splitPosition = pct;
      // Notify Monaco that its container size changed
      if (this.monacoEditor) {
        this.monacoEditor.layout();
      }
    });
  }

  private onMouseUp(): void {
    this.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
  }

  resetSplitPosition(): void {
    this.splitPosition = 50;
    if (this.monacoEditor) {
      this.monacoEditor.layout();
    }
  }

  // ── Resizable Monaco editor height ────────────────────────

  onEditorResizeMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isEditorResizing = true;
    this.editorResizeStartY = event.clientY;
    this.editorResizeStartHeight = this.editorHeight;

    this.boundEditorResizeMove = (e: MouseEvent) => this.onEditorResizeMove(e);
    this.boundEditorResizeUp = () => this.onEditorResizeUp();

    document.addEventListener('mousemove', this.boundEditorResizeMove);
    document.addEventListener('mouseup', this.boundEditorResizeUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  private onEditorResizeMove(event: MouseEvent): void {
    if (!this.isEditorResizing) return;

    const delta = event.clientY - this.editorResizeStartY;
    let newHeight = this.editorResizeStartHeight + delta;
    newHeight = Math.max(this.MIN_EDITOR_HEIGHT, Math.min(this.MAX_EDITOR_HEIGHT, newHeight));

    this.ngZone.run(() => {
      this.editorHeight = newHeight;
      if (this.monacoEditor) {
        this.monacoEditor.layout();
      }
    });
  }

  private onEditorResizeUp(): void {
    this.isEditorResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (this.boundEditorResizeMove) {
      document.removeEventListener('mousemove', this.boundEditorResizeMove);
      this.boundEditorResizeMove = null;
    }
    if (this.boundEditorResizeUp) {
      document.removeEventListener('mouseup', this.boundEditorResizeUp);
      this.boundEditorResizeUp = null;
    }
  }
}
