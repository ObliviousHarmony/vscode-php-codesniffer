import { CancellationError, CancellationToken, Disposable } from 'vscode';
import { PromiseMap } from '../common/promise-map';
import { Worker } from './worker';

/**
 * An interface describing the data we store with promises.
 */
interface PromiseMapData {
    cancellationToken?: CancellationToken;
    cancellationListener?: Disposable;
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
     * The workers that have been assigned from the pool.
     */
    private readonly inUse: Set<Worker>;

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

        this.inUse = new Set();
        this.waitMap = new PromiseMap();
    }

    /**
     * The number of workers free for assignment.
     */
    public get freeCount(): number {
        let count = this.workers.length
        for (const worker of this.workers) {
            if (worker.isActive || this.inUse.has(worker)) {
                count--;
            }
        }

        return count;
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
                this.inUse.add(worker);
                resolve(worker);
                return;
            }

            // Listen for cancellations to remove pending actios
            let cancellationListener: Disposable|undefined;
            if (cancellationToken) {
                cancellationListener = cancellationToken.onCancellationRequested(() => this.onCancellation(key));
            }

            // Queue the wait in the map so that we can resolve it when a worker becomes available.
            this.waitMap.set(key, resolve, reject, { cancellationToken, cancellationListener });
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

        // Since the worker is no longer in use we should indicate as such.
        this.inUse.delete(worker);

        // Iterate over all of the promises so that we can resolve the worker and reject cancellations.
        for (const key of this.waitMap.keys()) {
            const data = this.waitMap.getData(key) as PromiseMapData;

            // Give the worker to the first live request that we find.
            if (!data.cancellationToken || !data.cancellationToken.isCancellationRequested) {
                this.inUse.add(worker);
                this.waitMap.resolve(key, worker);
                break;
            }
        }
    }

    /**
     * Returns the first available worker if there is one.
     */
    private getFirstAvailable(): Worker|null {
        for (const worker of this.workers) {
            if (worker.isActive) {
                continue;
            }

            // It's possible that a worker has been assigned but is not yet active.
            if (this.inUse.has(worker)) {
                continue;
            }

            return worker;
        }

        return null;
    }

    /**
     * A handler for processing cancellations.
     *
     * @param {string} key The key of the request being cancelled.
     */
    private onCancellation(key: string): void {
        const data = this.waitMap.getData(key);
        if (!data) {
            return;
        }

        if (data.cancellationListener) {
            data.cancellationListener.dispose();
        }

        // The pending promise should now be cancelled.
        this.waitMap.reject(key, new CancellationError());
    }
}
