import { mocked } from 'ts-jest/utils';
import { Worker } from '../worker';
import { WorkerPool } from '../worker-pool';
import { MockCancellationToken } from '../../__mocks__/vscode';
import { CancellationError } from 'vscode';

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

    afterEach(() => {
        MockedWorker.mockClear();
    });

    it('should resolve instantly if worker is available', () => {
        const pool = new WorkerPool(1);

        expect(pool.waitForAvailable('test')).resolves.toStrictEqual(MockedWorker.mock.results[0].value);
    });

    it('should resolve when worker becomes available', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        expect(pool.waitForAvailable('test')).resolves.toStrictEqual(MockedWorker.mock.results[0].value);

        // Change the active status and trigger the resolution.
        mockWorker.isActive = false;
        mockWorker.onActiveChanged(mockWorker);
    });

    it('should support cancellation', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const cancellationToken = new MockCancellationToken();

        expect(pool.waitForAvailable('test', cancellationToken)).rejects.toMatchObject(new CancellationError());

        // Mark a cancellation so that resolution will reject.
        cancellationToken.isCancellationRequested = true;

        // Change the active status and trigger the resolution.
        mockWorker.isActive = false;
        mockWorker.onActiveChanged(mockWorker);
    });
});
