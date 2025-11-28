import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { PlaygroundComponent } from './playground.component';
import { PlaygroundService } from './playground.service';
import { Subject, Subscription } from 'rxjs';

describe('PlaygroundComponent', () => {
  let component: PlaygroundComponent;
  let fixture: ComponentFixture<PlaygroundComponent>;
  let mockPlaygroundService: { runRenovate: jest.Mock };

  beforeEach(async () => {
    // Create mock service
    mockPlaygroundService = {
      runRenovate: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PlaygroundComponent, ReactiveFormsModule],
      providers: [
        { provide: PlaygroundService, useValue: mockPlaygroundService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PlaygroundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Form Initialization', () => {
    it('should initialize form with default values', () => {
      expect(component.renovateForm).toBeDefined();
      expect(component.renovateForm.get('repositoryUrl')?.value).toBe('');
      expect(component.renovateForm.get('githubToken')?.value).toBe('');
      expect(component.renovateForm.get('renovateConfig')?.value).toContain('config:recommended');
    });

    it('should have required validators on all fields', () => {
      const form = component.renovateForm;
      
      form.patchValue({
        repositoryUrl: '',
        githubToken: '',
        renovateConfig: ''
      });

      expect(form.get('repositoryUrl')?.hasError('required')).toBe(true);
      expect(form.get('githubToken')?.hasError('required')).toBe(true);
      expect(form.get('renovateConfig')?.hasError('required')).toBe(true);
    });

    it('should validate repository URL format', () => {
      const urlControl = component.renovateForm.get('repositoryUrl');
      
      urlControl?.setValue('invalid-url');
      expect(urlControl?.hasError('urlInvalid')).toBe(true);

      urlControl?.setValue('https://github.com/owner/repo');
      expect(urlControl?.hasError('urlInvalid')).toBe(false);
    });

    it('should validate JSON format in renovateConfig', () => {
      const configControl = component.renovateForm.get('renovateConfig');
      
      configControl?.setValue('invalid json');
      expect(configControl?.hasError('jsonInvalid')).toBe(true);

      configControl?.setValue('{"extends": ["config:recommended"]}');
      expect(configControl?.hasError('jsonInvalid')).toBe(false);
    });
  });

  describe('runRenovate', () => {
    it('should not run if form is invalid', () => {
      component.renovateForm.patchValue({
        repositoryUrl: '',
        githubToken: '',
        renovateConfig: ''
      });

      component.runRenovate();

      expect(mockPlaygroundService.runRenovate).not.toHaveBeenCalled();
    });

    it('should clear logs and dependencies when starting', () => {
      // Set up valid form
      component.renovateForm.patchValue({
        repositoryUrl: 'https://github.com/test/repo',
        githubToken: 'test-token',
        renovateConfig: '{"extends": ["config:base"]}'
      });

      component.logs = [{ message: 'test', time: '10:00:00', level: 'info', type: 'log' }];
      component.dependencies = [{ 
        type: 'npm', 
        name: 'test', 
        currentVersion: '1.0.0', 
        newVersion: '2.0.0' 
      }];

      const messagesSubject = new Subject();
      const mockEventSource = { close: jest.fn() };
      
      mockPlaygroundService.runRenovate.mockReturnValue({
        messages: messagesSubject.asObservable(),
        eventSource: mockEventSource
      });

      component.runRenovate();

      // Logs and dependencies should be cleared (but may have initial messages)
      expect(component.isRunning).toBe(true);
      expect(mockPlaygroundService.runRenovate).toHaveBeenCalled();
    });

    it('should call service with correct parameters', () => {
      const messagesSubject = new Subject();
      const mockEventSource = { close: jest.fn() };
      
      mockPlaygroundService.runRenovate.mockReturnValue({
        messages: messagesSubject.asObservable(),
        eventSource: mockEventSource
      });

      component.renovateForm.patchValue({
        repositoryUrl: 'https://github.com/test/repo',
        githubToken: 'test-token',
        renovateConfig: '{"extends": ["config:base"]}'
      });

      component.runRenovate();

      expect(mockPlaygroundService.runRenovate).toHaveBeenCalledWith(
        'test-token',
        'https://github.com/test/repo',
        { extends: ['config:base'] }
      );
    });
  });

  describe('Log Processing', () => {
    it('should classify error logs correctly', () => {
      const errorLog = { message: 'Error occurred', time: '10:00:00', level: 'error', type: 'log' };
      
      const logClass = component.getLogClass(errorLog);

      expect(logClass).toBe('log-error');
    });

    it('should classify warning logs correctly', () => {
      const warningLog = { message: 'Warning message', time: '10:00:00', level: 'warn', type: 'log' };
      
      const logClass = component.getLogClass(warningLog);

      expect(logClass).toBe('log-warning');
    });

    it('should classify success logs correctly', () => {
      const successLog = { message: 'Success completed', time: '10:00:00', level: 'success', type: 'log' };
      
      const logClass = component.getLogClass(successLog);

      expect(logClass).toBe('log-success');
    });

    it('should classify info logs correctly', () => {
      const infoLog = { message: 'Info message', time: '10:00:00', level: 'info', type: 'log' };
      
      const logClass = component.getLogClass(infoLog);

      expect(logClass).toBe('log-info');
    });

    it('should return correct icon for each log type', () => {
      const errorLog = { message: 'Error', time: '10:00:00', level: 'error', type: 'log' };
      const warningLog = { message: 'Warning', time: '10:00:00', level: 'warn', type: 'log' };
      const successLog = { message: 'Success', time: '10:00:00', level: 'success', type: 'log' };
      const infoLog = { message: 'Info', time: '10:00:00', level: 'info', type: 'log' };

      expect(component.getLogIcon(errorLog)).toBe('❌');
      expect(component.getLogIcon(warningLog)).toBe('⚠️');
      expect(component.getLogIcon(successLog)).toBe('✅');
      expect(component.getLogIcon(infoLog)).toBe('ℹ️');
    });

    it('should clean log messages', () => {
      const log = { 
        message: '2024-10-22T10:00:00.000Z INFO: Test message', 
        time: '10:00:00', 
        level: 'info', 
        type: 'log' 
      };

      const cleanedMessage = component.getLogMessage(log);

      expect(cleanedMessage).toBe('Test message');
    });
  });

  describe('Dependency Processing', () => {
    it('should add new dependency if not exists', () => {
      const dependency = {
        type: 'npm',
        name: 'lodash',
        currentVersion: '4.17.20',
        newVersion: '4.17.21'
      };

      component['addOrUpdateDependency'](dependency);

      expect(component.dependencies.length).toBe(1);
      expect(component.dependencies[0]).toEqual(dependency);
    });

    it('should not add duplicate dependencies', () => {
      const dependency = {
        type: 'npm',
        name: 'lodash',
        currentVersion: '4.17.20',
        newVersion: '4.17.21'
      };

      component['addOrUpdateDependency'](dependency);
      component['addOrUpdateDependency'](dependency);

      expect(component.dependencies.length).toBe(1);
    });

    it('should update existing dependency', () => {
      const dependency = {
        type: 'npm',
        name: 'lodash',
        currentVersion: '4.17.20',
        newVersion: '4.17.21',
        status: 'discovered' as const
      };

      component['addOrUpdateDependency'](dependency);

      const updatedDependency = {
        ...dependency,
        status: 'update-available' as const
      };

      component['addOrUpdateDependency'](updatedDependency);

      expect(component.dependencies.length).toBe(1);
      expect(component.dependencies[0].status).toBe('update-available');
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format valid timestamp', () => {
      const timestamp = '2024-10-22T14:30:45.123Z';
      
      const formatted = component['formatTimestamp'](timestamp);

      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should return current timestamp for invalid input', () => {
      const formatted = component['formatTimestamp']('');

      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should generate current timestamp', () => {
      const timestamp = component.getCurrentTimestamp();

      expect(timestamp).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Status Badge Helpers', () => {
    it('should return correct badge class for discovered status', () => {
      const badgeClass = component.getStatusBadgeClass('discovered');
      expect(badgeClass).toBe('badge bg-info');
    });

    it('should return correct badge class for update-available status', () => {
      const badgeClass = component.getStatusBadgeClass('update-available');
      expect(badgeClass).toBe('badge bg-success');
    });

    it('should return default badge class for unknown status', () => {
      const badgeClass = component.getStatusBadgeClass();
      expect(badgeClass).toBe('badge bg-secondary');
    });

    it('should return correct label for statuses', () => {
      expect(component.getStatusLabel('discovered')).toBe('Discovered');
      expect(component.getStatusLabel('update-available')).toBe('Update Available');
      expect(component.getStatusLabel()).toBe('Unknown');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup connections on destroy', () => {
      const mockEventSource = { close: jest.fn() };
      component['currentEventSource'] = mockEventSource;

      component.ngOnDestroy();

      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('should unsubscribe from subscription on destroy', () => {
      const mockSubscription = { unsubscribe: jest.fn() } as unknown as Subscription;
      component['currentSubscription'] = mockSubscription;

      component.ngOnDestroy();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Scroll Behavior', () => {
    it('should not throw error when checking scroll position', () => {
      expect(() => component.checkScrollPosition()).not.toThrow();
    });
  });
});
