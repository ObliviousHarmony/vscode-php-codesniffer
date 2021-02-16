import { CancellationError, CancellationToken } from 'vscode';
import { PromiseMap } from '../common/promise-map';
import { Worker } from './worker';

// The type of data we're assocaiting with the promises in the map.
type PromiseMapData = CancellationToken|null;

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
    private readonly waitMap: PromiseMap<Worker, PromiseMapData>;

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

        this.waitMap = new PromiseMap();
    }

    /**
     * Waits for a worker to become available and resolves it.
     *
     * @param {string} key A key to identify requests uniquely.
     * @param {CancellationToken} [cancellationToken] The optional token for cancelling the search.
     */
    public waitForAvailable(key: string, cancellationToken?: CancellationToken): Promise<Worker> {
        return new Promise<Worker>((resolve, reject) => {
            // If there is already a worker available there is no reason to queue a request.
            const worker = this.getFirstAvailable();
            if (worker) {
                resolve(worker);
                return;
            }

            // Queue the wait in the map so that we can resolve it when a worker becomes available.
            this.waitMap.set(key, resolve, reject, cancellationToken ?? null);
        });
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

        // Iterate over all of the promises so that we can resolve the worker and reject cancellations.
        let workerAssigned = false;
        for (const key of this.waitMap.keys()) {
            const data = this.waitMap.getData(key) as PromiseMapData;
            // Entries without cancellation tokens do nothing without a worker to assign.
            if (!data && workerAssigned) {
                continue;
            }

            // Give the worker to the first live request that we find.
            if (!data || !data.isCancellationRequested) {
                this.waitMap.resolve(key, worker);
                workerAssigned = true;
                continue;
            }

            // Trigger cancellation errors on all cancelled requests.
            this.waitMap.reject(key, new CancellationError());
        }
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
}
