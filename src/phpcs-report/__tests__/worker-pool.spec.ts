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

        return expect(pool.waitForAvailable('test')).resolves.toStrictEqual(MockedWorker.mock.results[0].value);
    });

    it('should resolve when worker becomes available', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const promise = pool.waitForAvailable('test');

        // Change the active status and trigger the resolution.
        mockWorker.isActive = false;
        mockWorker.onActiveChanged(mockWorker);

        return expect(promise).resolves.toStrictEqual(MockedWorker.mock.results[0].value);
    });

    it('should support cancellation', () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const cancellationToken = new MockCancellationToken();

        const promise = pool.waitForAvailable('test', cancellationToken);

        // Mock a cancellation so that resolution will reject.
        cancellationToken.mockCancel();

        return expect(promise).rejects.toMatchObject(new CancellationError());
    });

    it('should support waiting after cancellation', async () => {
        const pool = new WorkerPool(1);

        const mockWorker = MockedWorker.mock.results[0].value;

        // Mark the worker as active so that the request will be queued.
        mockWorker.isActive = true;

        const cancellationToken = new MockCancellationToken();

        let promise = pool.waitForAvailable('test', cancellationToken);

        // Mark a cancellation so that resolution will reject.
        cancellationToken.mockCancel();

        // Change the active status and trigger the resolution.
        mockWorker.isActive = false;
        mockWorker.onActiveChanged(mockWorker);

        try {
            await promise;
        } catch (e) {
            expect(e).toBeInstanceOf(CancellationError);
        }

        promise = pool.waitForAvailable('test', cancellationToken);

        return expect(promise).resolves.toStrictEqual(MockedWorker.mock.results[0].value);
    });
});
