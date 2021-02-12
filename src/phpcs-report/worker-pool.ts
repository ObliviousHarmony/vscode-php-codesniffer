import { CancellationToken, Disposable } from 'vscode';
import { Worker } from './worker';

/**
 * A callback for once a worker has become available.
 *
 * @callback AvailableWorkerCallback
 * @param {Worker} worker The available worker.
 * @param {CancellationToken} [cancellationToken] The cancellation token that was give to the wait.
 */
export type AvailableWorkerCallback = (worker: Worker, cancellationToken?: CancellationToken) => void;

/**
 * A request for an available worker.
 */
interface AvailableWorkerRequest {
    callback: AvailableWorkerCallback;
    cancellationToken?: CancellationToken;
    cancellationHook?: Disposable;
}

/**
 * A pool for managing worker resources.
 */
export class WorkerPool {
    /**
     * The workers available in the pool.
     */
    private readonly workers: Worker[];

    /**
     * The queue of requests that are waiting to be executed.
     */
    private readonly queuedRequests: Map<string, AvailableWorkerRequest>;

    /**
     * Constructor.
     *
     * @param {number} capacity The number of workers we're creating.
     */
    public constructor(capacity: number) {
        this.workers = new Array(capacity);
        for (let i = 0; i < capacity; ++i) {
            this.workers[i] = new Worker(
                (worker) => this.onWorkerActiveChange(worker)
            );
        }

        this.queuedRequests = new Map();
    }

    /**
     * Queues a callback to receive a worker once one becomes available.
     *
     * @param {string} key A key to identify requests uniquely.
     * @param {AvailableWorkerCallback} callback The function to execute once a worker is available.
     * @param {CancellationToken} [cancellationToken] The optional token for cancelling the search.
     */
    public waitForAvailable(key: string, callback: AvailableWorkerCallback, cancellationToken?: CancellationToken): void {
        // A key may only have a single request at a time.
        if (this.queuedRequests.has(key)) {
            throw new Error('A request has already been queued for this key.');
        }

        // If there is already a worker available there is no reason to queue a request.
        const worker = this.getFirstAvailable();
        if (worker) {
            callback(worker, cancellationToken);
            return;
        }

        // If the consumer gives a cancellation token we should bind a callback.
        let cancellationHook: Disposable|undefined = undefined;
        if (cancellationToken) {
            cancellationHook = cancellationToken.onCancellationRequested(() => this.onCancellation(key, cancellationToken));
        }

        this.queuedRequests.set(key, { callback, cancellationToken, cancellationHook });
    }

    /**
     * A callback that is executed whenever a worker's active status changes.
     *
     * @param {Worker} worker The worker whose status changed.
     */
    private onWorkerActiveChange(worker: Worker): void {
        if (worker.isActive) {
            return;
        }

        // When a worker becomes inactive we should see if a request is waiting for one.
        if (!this.queuedRequests.size) {
            return;
        }
        const key = this.queuedRequests.keys().next().value;

        const request = this.queuedRequests.get(key);
        request?.callback(worker, request.cancellationToken);
        request?.cancellationHook?.dispose();

        this.queuedRequests.delete(key);
    }

    /**
     * Returns the first available worker if there is one.
     */
    private getFirstAvailable(): Worker|null {
        for (const worker of this.workers) {
            if (!worker.isActive) {
                return worker;
            }
        }

        return null;
    }

    /**
     * A callback triggered when a request is cancelled.
     *
     * @param {string} key The key for the request we're cancelling.
     * @param {CancellationToken} cancellationToken The cancellation token that was used for this.
     */
    private onCancellation(key: string, cancellationToken: CancellationToken): void {
        const request = this.queuedRequests.get(key);
        if (!request) {
            return;
        }

        // Make sure we don't allow cancellations from a different request.
        if (request.cancellationToken !== cancellationToken) {
            return;
        }

        // Remove the request since we're done.
        this.queuedRequests.delete(key);
    }
}
