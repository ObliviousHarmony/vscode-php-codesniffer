import {
	CancellationToken,
	CancellationTokenSource,
	Disposable,
	TextDocument,
} from 'vscode';
import { Logger } from './logger';
import { Configuration } from './configuration';
import { WorkerPool } from '../phpcs-report/worker-pool';
import { UriMap } from '../common/uri-map';

/**
 * A base class for all of the updates that interact with PHPCS.
 */
export abstract class WorkerService implements Disposable {
	/**
	 * The logger to use.
	 */
	protected readonly logger: Logger;

	/**
	 * The configuration object.
	 */
	protected readonly configuration: Configuration;

	/**
	 * The pool of workers for making report requests.
	 */
	protected readonly workerPool: WorkerPool;

	/**
	 * A map containing all of the cancellation token sources to prevent overlapping execution.
	 */
	private readonly cancellationTokenSourceMap: UriMap<CancellationTokenSource>;

	/**
	 * Constructor.
	 *
	 * @param {Logger} logger The logger to use.
	 * @param {Configuration} configuration The configuration object to use.
	 * @param {WorkerPool} workerPool The worker pool to use.
	 */
	public constructor(
		logger: Logger,
		configuration: Configuration,
		workerPool: WorkerPool
	) {
		this.logger = logger;
		this.configuration = configuration;
		this.workerPool = workerPool;
		this.cancellationTokenSourceMap = new UriMap();
	}

	/**
	 * Disposes of the services's resources.
	 */
	public dispose(): void {
		for (const kvp of this.cancellationTokenSourceMap) {
			kvp[1].dispose();
		}
		this.cancellationTokenSourceMap.clear();
	}

	/**
	 * Cancels an in-progress update for the document if one is taking place.
	 *
	 * @param {TextDocument} document The document to cancel.
	 */
	public cancel(document: TextDocument): void {
		const cancellationTokenSource = this.cancellationTokenSourceMap.get(
			document.uri
		);
		if (cancellationTokenSource) {
			cancellationTokenSource.cancel();
			cancellationTokenSource.dispose();
			this.cancellationTokenSourceMap.delete(document.uri);
		}
	}

	/**
	 * Cancels in-progress updates for all documents.
	 */
	public cancelAll(): void {
		for (const kvp of this.cancellationTokenSourceMap) {
			kvp[1].cancel();
			kvp[1].dispose();
		}
		this.cancellationTokenSourceMap.clear();
	}

	/**
	 * A handler to be called when a document is closed to clean up after it.
	 *
	 * @param {TextDocument} document The document that was closed.
	 */
	public onDocumentClosed(document: TextDocument): void {
		// Stop any executing tasks.
		this.cancel(document);
	}

	/**
	 * Prepares a cancellation token for the service.
	 *
	 * @param {TextDocument} document The document to prepare a cancellation token for.
	 * @param {CancellationToken} [cancellationToken] The optional parent cancellation token.
	 */
	protected createCancellationToken(
		document: TextDocument,
		cancellationToken?: CancellationToken
	): CancellationToken | null {
		// We want to prevent overlapping execution.
		if (this.cancellationTokenSourceMap.has(document.uri)) {
			return null;
		}

		// Store the token so that we can cancel if necessary.
		const cancellationTokenSource = new CancellationTokenSource(
			// @ts-ignore: The definition is wrong; the token source accepts a parent token.
			cancellationToken
		);
		this.cancellationTokenSourceMap.set(
			document.uri,
			cancellationTokenSource
		);

		// On cancellation we should remove the existing token.
		cancellationTokenSource.token.onCancellationRequested(() => {
			this.cancellationTokenSourceMap.delete(document.uri);
		});

		return cancellationTokenSource.token;
	}

	/**
	 * Deletes the document's associated cancellation token.
	 *
	 * @param {TextDocument} document The document we've finished working on.
	 */
	protected deleteCancellationToken(document: TextDocument): void {
		const cancellationTokenSource = this.cancellationTokenSourceMap.get(
			document.uri
		);
		if (cancellationTokenSource) {
			cancellationTokenSource.dispose();
			this.cancellationTokenSourceMap.delete(document.uri);
		}
	}
}
