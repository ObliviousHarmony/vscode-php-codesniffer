import { mocked } from 'ts-jest/utils';
import { Worker } from '../worker';
import { WorkerPool } from '../worker-pool';
import * as child_process from 'child_process';
import type { CancellationToken } from 'vscode';

jest.mock('../worker', () => {
    return {
        Worker: jest.fn().mockImplementation((onActiveChanged) => {
            const obj = {
                execute: jest.fn(),
                isActive: false,
                onActiveChanged
            };

            return obj;
        })
    };
});

describe('WorkerPool', () => {
    const MockedWorker = mocked(Worker, true);

    beforeAll(() => {
        try {
            child_process.execFileSync('phpcs', [ '--version' ]);
        } catch (e) {
            throw new Error('This test requires PHPCS to be installed globally.')
        }
    });

    afterEach(() => {
        MockedWorker.mockClear();
    });

    it('should execute callback instantly if worker is available', () => {
        const pool = new WorkerPool(1);

        const mockCallback = jest.fn();
        pool.waitForAvailable('test', mockCallback);

        expect(mockCallback).toHaveBeenCalled();
        // Make sure it was called with the expected worker.
        expect(mockCallback.mock.calls[0][0]).toStrictEqual(MockedWorker.mock.results[0].value);
    });

    it('should execute callback when worker becomes available', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const mockCallback = jest.fn();
        pool.waitForAvailable('test', mockCallback);

        expect(mockCallback).not.toHaveBeenCalled();

        // Change the active status and trigger the callback as if a worker finished a job.
        mockWorker.isActive = false;
        mockWorker.onActiveChanged(mockWorker);

        expect(mockCallback).toHaveBeenCalledWith(mockWorker, undefined);
    });

    it('should support cancellation', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const cancellationToken: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn()
        };

        const mockCallback = jest.fn();
        pool.waitForAvailable('test', mockCallback, cancellationToken);

        expect(cancellationToken.onCancellationRequested).toHaveBeenCalled();
    });
});
