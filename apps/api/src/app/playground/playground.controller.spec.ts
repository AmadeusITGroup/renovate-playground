import { Test, TestingModule } from '@nestjs/testing';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';
import { Request, Response } from 'express';
import { of, throwError } from 'rxjs';

describe('PlaygroundController', () => {
  let controller: PlaygroundController;

  const mockPlaygroundService = {
    runRenovate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaygroundController],
      providers: [
        {
          provide: PlaygroundService,
          useValue: mockPlaygroundService,
        },
      ],
    }).compile();

    controller = module.get<PlaygroundController>(PlaygroundController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('runRenovate', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      mockRequest = {
        on: jest.fn(),
      };

      mockResponse = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        writableEnded: false,
      };
    });

    it('should return 400 if token is missing', async () => {
      await controller.runRenovate(
        '',
        'config',
        'repository',
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'GitHub token is required',
      });
    });

    it('should return 400 if config is missing', async () => {
      await controller.runRenovate(
        'token',
        '',
        'repository',
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Configuration is required',
      });
    });

    it('should return 400 if repository is missing', async () => {
      await controller.runRenovate(
        'token',
        'config',
        '',
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Repository URL is required',
      });
    });

    it('should set proper SSE headers', async () => {
      const validConfig = encodeURIComponent(JSON.stringify({ extends: ['config:base'] }));
      
      mockPlaygroundService.runRenovate.mockReturnValue(of({
        data: 'test',
        type: 'info',
      }));

      await controller.runRenovate(
        'test-token',
        validConfig,
        'https://github.com/test/repo',
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }));
    });

    it('should return 400 for invalid JSON config', async () => {
      const invalidConfig = 'invalid-json';

      await controller.runRenovate(
        'test-token',
        invalidConfig,
        'https://github.com/test/repo',
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid JSON configuration provided',
      });
    });

    it('should handle service errors gracefully', async () => {
      const validConfig = encodeURIComponent(JSON.stringify({ extends: ['config:base'] }));
      
      mockPlaygroundService.runRenovate.mockReturnValue(
        throwError(() => new Error('Service error'))
      );

      await controller.runRenovate(
        'test-token',
        validConfig,
        'https://github.com/test/repo',
        mockRequest as Request,
        mockResponse as Response
      );

      // Should write initial connection message
      expect(mockResponse.write).toHaveBeenCalled();
    });
  });
});
