import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Define interfaces for log messages
export interface RenovateLogMessage {
  time: string;
  msg: string;
  level?: string;
  type?: string;
  packageFiles?: unknown;
  config?: unknown;
  branchesInformation?: unknown[];
}

// Define interface for the Renovate run result
export interface RenovateRunResult {
  messages: Observable<RenovateLogMessage>;
  eventSource: { close: () => void };
}

@Injectable({
  providedIn: 'root',
})
export class PlaygroundService {
  runRenovate(githubToken: string, repositoryUrl: string, renovateConfig: object): RenovateRunResult {
    const sseUrl = `/api/playground/run`;
    const body = JSON.stringify({
      token: githubToken,
      repository: repositoryUrl,
      config: renovateConfig
    });

    const abortController = new AbortController();

    // Create a mock EventSource-like object for compatibility
    const eventSource = {
      close: () => {
        abortController.abort();
      }
    };

    // Create the observable for messages using fetch with POST
    const messagesObservable = new Observable<RenovateLogMessage>(observer => {
      // Use fetch to make POST request and read SSE stream
      fetch(sseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body,
        signal: abortController.signal
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) {
          throw new Error('Response body is not readable');
        }

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            observer.complete();
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by \n\n)
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || ''; // Keep incomplete message in buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            // Parse SSE format: "data: {...}"
            const dataMatch = message.match(/^data: (.+)$/m);
            if (!dataMatch) continue;

            try {
              const parsedData = JSON.parse(dataMatch[1]);
              console.log('SSE parsed data:', parsedData);

              // Handle the new backend format: {data: {original, time, msg, level}, type}
              let logMessage: RenovateLogMessage;

              if (parsedData.data && typeof parsedData.data === 'object' && !Array.isArray(parsedData.data)) {
                // New format from backend: data is an object with {original, time, msg, level}
                const dataObj = parsedData.data;
                
                // Try to parse the original field if it's a JSON string
                let innerData: any = {};
                if (dataObj.original && typeof dataObj.original === 'string') {
                  try {
                    innerData = JSON.parse(dataObj.original);
                  } catch (e) {
                    console.warn('Could not parse original data:', e);
                  }
                }

                // Create the log message
                logMessage = {
                  time: dataObj.time || parsedData.timestamp || new Date().toISOString(),
                  msg: dataObj.msg || innerData.msg || '',
                  level: dataObj.level || innerData.level || 'info',
                  type: parsedData.type || 'log'
                };

                // Check for special data types in innerData
                if (innerData.msg === 'packageFiles with updates' && innerData.config) {
                  logMessage.config = innerData.config;
                  logMessage.type = 'packageFilesWithUpdates';
                } else if (innerData.msg === 'packageFiles' && innerData.packageFiles) {
                  logMessage.packageFiles = innerData.packageFiles;
                  logMessage.type = 'packageFiles';
                } else if (innerData.msg === 'branches info extended' && innerData.branchesInformation) {
                  logMessage.branchesInformation = innerData.branchesInformation;
                  logMessage.type = 'branchesInfoExtended';
                } else if (innerData.branchesInformation) {
                  // Fallback: check for branchesInformation at top level
                  logMessage.branchesInformation = innerData.branchesInformation;
                  logMessage.type = 'branchesInfoExtended';
                }

                observer.next(logMessage);
              } else if (parsedData.data && typeof parsedData.data === 'string') {
                // Old format: data is a JSON string
                try {
                  const innerData = JSON.parse(parsedData.data);
                  logMessage = {
                    time: parsedData.time || new Date().toISOString(),
                    msg: innerData.msg || '',
                    level: innerData.level || parsedData.level || 'info',
                    type: parsedData.type || 'log'
                  };

                  if (innerData.msg === 'packageFiles with updates' && innerData.config) {
                    logMessage.config = innerData.config;
                    logMessage.type = 'packageFilesWithUpdates';
                  } else if (innerData.msg === 'packageFiles' && innerData.packageFiles) {
                    logMessage.packageFiles = innerData.packageFiles;
                    logMessage.type = 'packageFiles';
                  } else if (innerData.msg === 'branches info extended' && innerData.branchesInformation) {
                    logMessage.branchesInformation = innerData.branchesInformation;
                    logMessage.type = 'branchesInfoExtended';
                  }

                  observer.next(logMessage);
                } catch (innerError) {
                  observer.next({
                    time: parsedData.time || new Date().toISOString(),
                    msg: parsedData.data,
                    level: parsedData.level || 'info',
                    type: parsedData.type || 'log'
                  });
                }
              } else {
                // Fallback for any other format
                observer.next({
                  time: parsedData.time || parsedData.timestamp || new Date().toISOString(),
                  msg: parsedData.data || parsedData.msg || '',
                  level: parsedData.level || 'info',
                  type: parsedData.type || 'log'
                });
              }

              // If this is a completion message, complete the stream
              if (parsedData.type === 'success' || parsedData.type === 'warning' || parsedData.type === 'complete') {
                observer.complete();
                eventSource.close();
                break;
              }
            } catch (e) {
              // If parsing fails, skip this message
              console.error('Failed to parse SSE message:', e);
            }
          }
        }
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          observer.error(error);
        }
        observer.complete();
      });

      // Return teardown logic
      return () => {
        eventSource.close();
      };
    });

    // Return both the observable and the EventSource instance
    return {
      messages: messagesObservable,
      eventSource: eventSource
    };
  }
}
