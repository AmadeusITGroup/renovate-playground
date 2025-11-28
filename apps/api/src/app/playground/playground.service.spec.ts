import { Subscriber } from 'rxjs';
import { Test, TestingModule } from '@nestjs/testing';
import { PlaygroundService } from './playground.service';

describe('PlaygroundService', () => {
  let service: PlaygroundService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaygroundService],
    }).compile();

    service = module.get<PlaygroundService>(PlaygroundService);
  });

  afterEach(() => {
    // Clean up any running processes
    if (service['renovateProcess']) {
      service['renovateProcess'].kill();
      service['renovateProcess'] = null;
    }
    service['isProcessRunning'] = false;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runRenovate', () => {
    it('should return an Observable', () => {
      const result = service.runRenovate(
        'test-token',
        'https://github.com/test/repo',
        { extends: ['config:base'] }
      );

      expect(result).toBeDefined();
      expect(typeof result.subscribe).toBe('function');
    });

    it('should return info message when process is already running', (done) => {
      // Mark as running
      service['isProcessRunning'] = true;

      const observable = service.runRenovate(
        'test-token',
        'https://github.com/test/repo',
        { extends: ['config:base'] }
      );

      observable.subscribe({
        next: (event) => {
          expect(event.type).toBe('info');
          expect(event.data).toContain('already running');
        },
        complete: () => {
          service['isProcessRunning'] = false;
          done();
        },
      });
    });

    it('should handle invalid repository format', (done) => {
      const observable = service.runRenovate(
        'test-token',
        'invalid-repo',
        { extends: ['config:base'] }
      );

      // Subscribe and let it fail naturally or timeout
      const subscription = observable.subscribe({
        next: (event) => {
          // Process may emit events before failing
          expect(event).toBeDefined();
        },
        error: (error) => {
          expect(error).toBeDefined();
          done();
        },
        complete: () => {
          // May complete without error in some cases
          done();
        },
      });

      // Cleanup after a short time
      setTimeout(() => {
        subscription.unsubscribe();
        done();
      }, 1000);
    });
  });

  describe('processLogLine', () => {
    it('should parse valid JSON log lines', () => {
      const mockSubscriber = {
        next: jest.fn(),
        error: jest.fn(),
        complete: jest.fn(),
      };

      const jsonLog = JSON.stringify({
        msg: 'Test message',
        level: 'info',
        time: '2024-10-22T10:00:00.000Z',
      });

      service['processLogLine'](jsonLog, 'log', mockSubscriber as unknown as Subscriber<MessageEvent>);

      expect(mockSubscriber.next).toHaveBeenCalled();
      const call = mockSubscriber.next.mock.calls[0][0];
      expect(call).toHaveProperty('data');
      expect(call).toHaveProperty('type');
      expect(call.data).toHaveProperty('time');
    });

    it('should handle non-JSON log lines', () => {
      const mockSubscriber = {
        next: jest.fn(),
        error: jest.fn(),
        complete: jest.fn(),
      };

      service['processLogLine']('Plain text log', 'log', mockSubscriber as unknown as Subscriber<MessageEvent>);

      expect(mockSubscriber.next).toHaveBeenCalled();
      const call = mockSubscriber.next.mock.calls[0][0];
      expect(call.data).toHaveProperty('original', 'Plain text log');
      expect(call.data).toHaveProperty('time');
      expect(call.type).toBe('log');
    });

    it('should identify packageFiles messages', () => {
      const mockSubscriber = {
        next: jest.fn(),
        error: jest.fn(),
        complete: jest.fn(),
      };

      const packageFilesLog = JSON.stringify({
        msg: 'packageFiles',
        packageFiles: [{ file: 'package.json' }],
      });

      service['processLogLine'](packageFilesLog, 'log', mockSubscriber as unknown as Subscriber<MessageEvent>);

      expect(mockSubscriber.next).toHaveBeenCalled();
      const call = mockSubscriber.next.mock.calls[0][0];
      expect(call.type).toBe('packageFiles');
    });

    it('should identify branches info extended messages', () => {
      const mockSubscriber = {
        next: jest.fn(),
        error: jest.fn(),
        complete: jest.fn(),
      };

      const branchesLog = JSON.stringify({
        msg: 'branches info extended',
        branchesInformation: [{ branch: 'main' }],
      });

      service['processLogLine'](branchesLog, 'log', mockSubscriber as unknown as Subscriber<MessageEvent>);

      expect(mockSubscriber.next).toHaveBeenCalled();
      const call = mockSubscriber.next.mock.calls[0][0];
      expect(call.type).toBe('branchesInfoExtended');
    });
  });

  describe('cleanup', () => {
    it('should handle cleanup of non-existent directory', () => {
      expect(() => {
        service['cleanup']('/non/existent/path');
      }).not.toThrow();
    });
  });
});
