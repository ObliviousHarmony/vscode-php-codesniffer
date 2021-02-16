/**
 * An entry for tracking information about a promise in the map.
 */
interface MapEntry<R, D> {
    resolve(args: R): void;
    reject(reason?: unknown): void;
    data: D;
}

/**
 * An error for rejecting promises that have been replaced in the map.
 */
export class PromiseMapReplacementError extends Error {
    public constructor() {
        super('The promise has been replaced in the map.');
    }
}

/**
 * A map for tracking promises that are not resolved in their executor.
 */
export class PromiseMap<R, D> {
    /**
     * The map of promises.
     */
    private readonly map: Map<string, MapEntry<R, D>>;

    /**
     * Constructor.
     */
    public constructor() {
        this.map = new Map();
    }

    /**
     * Returns an iterator for the keys in the map.
     */
    public keys(): IterableIterator<string> {
        return this.map.keys();
    }

    /**
     * Sets a promise into the map keyed by the given ID.
     *
     * @param {string} key The key for the map.
     * @param {Function} resolve The resolve function for the promise.
     * @param {Function} reject The reject function for the promise.
     * @param {*} data The data associated with the promise.
     */
    public set(
        key: string,
        resolve: (args: R) => void,
        reject: (reason?: unknown) => void,
        data: D
    ): void {
        const existing = this.map.get(key);
        if (!existing) {
            this.map.set(key, { resolve, reject, data });
            return;
        }

        // Inform the consumer that the promise has been replaced in the queue.
        existing.reject(new PromiseMapReplacementError());

        // Update the record since we're replacing it.
        existing.resolve = resolve;
        existing.reject = reject;
        existing.data = data;
    }

    /**
     * Indicates whether or not the promise is in the map.
     *
     * @param {string} key The key of the promise entry.
     */
    public has(key: string): boolean {
        return this.map.has(key);
    }

    /**
     * Fetches the data associated with a promise
     *
     * @param {string} key The key of the promise whose data to fetch.
     */
    public getData(key: string): D|undefined {
        const entry = this.map.get(key);
        if (!entry) {
            return undefined;
        }

        return entry.data;
    }

    /**
     * Resolves a promise in the map.
     *
     * @param {string} key The key of the promise to resolve.
     * @param {*} args The arguments for the promise resolution.
     */
    public resolve(key: string, args: R): void {
        const entry = this.map.get(key);
        if (!entry) {
            throw new Error('No promise to resolve.');
        }

        entry.resolve(args);
        this.map.delete(key);
    }

    /**
     * Rejects a promise in the map.
     *
     * @param {string} key The key of the promise to reject.
     * @param {*} reason The reason for the rejection.
     */
    public reject(key: string, reason: unknown): void {
        const entry = this.map.get(key);
        if (!entry) {
            throw new Error('No promise to reject.');
        }

        entry.reject(reason);
        this.map.delete(key);
    }
}
