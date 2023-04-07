import { ChildProcess, spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { resolve as resolvePath } from 'path';
import { CancellationError, CancellationToken, Disposable } from 'vscode';
import { StandardType } from '../services/configuration';
import { Request } from './request';
import { ReportType, Response } from './response';

/**
 * A callback to execute when a worker's active status changes.
 *
 * @callback ActiveChangedCallback
 * @param {Worker} worker The worker that had its status changed.
 */
type ActiveChangedCallback = (worker: Worker) => void;

/**
 * A custom error type for those that come from PHPCS.
 */
export class PHPCSError extends Error {
	/**
	 * The output from the command.
	 */
	public readonly output: string;

	/**
	 * The error output from the command.
	 */
	public readonly errorOutput: string;

	/**
	 * Constructor.
	 *
	 * @param {string} output The output from the command.
	 * @param {string} errorOutput The error output from the command.
	 */
	public constructor(output: string, errorOutput: string) {
		super('The PHPCS worker encountered an error.');

		this.output = output;
		this.errorOutput = errorOutput;
	}
}

/**
 * A worker for getting reports out of PHPCS and returning them to the consumer.
 */
export class Worker {
	/**
	 * A callback to execute when a worker's active status changes.
	 */
	private readonly onActiveChanged?: ActiveChangedCallback;

	/**
	 * The current process if the worker is active.
	 */
	private activeProcess?: ChildProcess;

	/**
	 * The cancellation token we should use to check if the request may have been cancelled.
	 */
	private cancellationToken?: CancellationToken;

	/**
	 * Indicates whether or not the worker is currently active.
	 */
	public get isActive(): boolean {
		return !!this.activeProcess;
	}

	/**
	 * Constructor.
	 *
	 * @param {ActiveChangedCallback} [onActiveChanged] A callback to execute when a worker's active status changes.
	 */
	public constructor(onActiveChanged?: ActiveChangedCallback) {
		this.onActiveChanged = onActiveChanged;
	}

	/**
	 * Executes a request on a worker if it is not busy.
	 *
	 * @param {Request} request The request we want the worker to execute.
	 * @param {CancellationToken} [cancellationToken] An optional token to allow for cancelling requests.
	 */
	public execute<T extends ReportType>(
		request: Request<T>,
		cancellationToken?: CancellationToken
	): Promise<Response<T>> {
		if (this.isActive) {
			throw new Error('This worker is already active.');
		}

		return new Promise<Response<T>>((resolve, reject) => {
			// Under certain circumstances we shouldn't bother generating a report because it will be empty.
			if (
				request.options.standard === 'Disabled' ||
				request.documentContent.length <= 0
			) {
				resolve(Response.empty(request.type));
				return;
			}

			// When a consumer passes a cancellation token we will use that to signal
			// that the running request should be terminated and the worker freed.
			let cancellationHandler: Disposable | null = null;
			if (cancellationToken) {
				// Keep track of the handler so that we can remove it when cancellation is no longer possible.
				cancellationHandler = cancellationToken.onCancellationRequested(
					() => this.onCancellation(cancellationToken)
				);
			}
			this.cancellationToken = cancellationToken;

			// The requester will receive the report when it is finished.
			this.activeProcess = this.createProcess(request, resolve, reject);

			// The worker is no longer available.
			this.onActiveChanged?.(this);

			// When the process closes we should clean up the worker and prepare it for a fresh execution.
			this.activeProcess.on('close', () => {
				if (cancellationHandler) {
					cancellationHandler.dispose();
				}
				delete this.cancellationToken;
				delete this.activeProcess;

				// The worker should broadcast its availability.
				this.onActiveChanged?.(this);
			});
		});
	}

	/**
	 * A cancellation token hook for killing the worker if it is active.
	 *
	 * @param token
	 */
	private onCancellation(token: CancellationToken): void {
		if (!this.isActive) {
			return;
		}

		// We don't want to run the cancellation if the token we're
		// currently tracking is not the same as the one that was
		// responsible for triggering the cancellation.
		if (token !== this.cancellationToken) {
			return;
		}

		this.activeProcess?.kill('SIGKILL');
	}

	/**
	 * Creates a PHPCS process to execute the report generation.
	 *
	 * @param {Request} request The request we're processing.
	 */
	private createProcess<T extends ReportType>(
		request: Request<T>,
		resolve: (response: Response<T>) => void,
		reject: (e?: unknown) => void
	): ChildProcess {
		// Figure out the path to the PHPCS integration.
		const assetPath =
			process.env.ASSETS_PATH || resolvePath(__dirname, 'assets');

		// Prepare the arguments for our PHPCS process.
		const processArguments = [
			'-q', // Make sure custom configs never break our output.
			'--report=' +
				resolvePath(assetPath, 'phpcs-integration', 'VSCode.php'),
			// We want to reserve error exit codes for actual errors in the PHPCS execution since errors/warnings are expected.
			'--runtime-set',
			'ignore_warnings_on_exit',
			'1',
			'--runtime-set',
			'ignore_errors_on_exit',
			'1',
		];

		// Since the executable may also include arguments, we need to break the given option
		// apart and track the specific process and add the args to the array we will use
		// to spawn the process. We will break on spaces but also support quoted strings.
		const executableMatches = request.options.executable.match(
			/`((?:[^`\\]|\\`)*)`|'((?:[^'\\]|\\')*)'|"((?:[^"\\]|\\")*)"|([^\s"]+)/g
		);
		if (!executableMatches) {
			throw new Error('No executable was given.');
		}

		// The first segment will always be the executable.
		const executable = executableMatches.shift();
		if (!executable) {
			throw new Error('No executable was given.');
		}

		// Any remaining matches will be arguments that we pass to the executable.
		// Make sure to add them to the front so it runs PHPCS correctly.
		processArguments.unshift(...executableMatches);

		// Only set the standard when the user has selected one.
		if (request.options.standard !== StandardType.Default) {
			processArguments.push('--standard=' + request.options.standard);
		}

		// Prepare the options for the PHPCS process.
		const processOptions: SpawnOptionsWithoutStdio = {
			env: {
				...process.env,
				// Pass the request data using environment vars.
				PHPCS_VSCODE_INPUT: JSON.stringify({
					type: request.type,
					data: request.data,
				}),
			},
			windowsHide: true,
		};

		// Give the working directory when requested.
		if (request.options.workingDirectory) {
			processOptions.cwd = request.options.workingDirectory;
		}

		// Make sure PHPCS knows to read from STDIN.
		processArguments.push('-');

		// Create a new process to fetch the report.
		const phpcsProcess = spawn(
			executable,
			processArguments,
			processOptions
		);

		// We want to read all of the data from the report for processing.
		let pendingReport = '';
		phpcsProcess.stdout.on('data', (data) => {
			// When the request is cancelled don't waste memory recording stdio.
			if (this.cancellationToken?.isCancellationRequested) {
				pendingReport = '';
				return;
			}

			pendingReport += data;
		});

		// We should also read the error stream in case we need to handle one.
		let pendingError = '';
		phpcsProcess.stderr.on('data', (data) => {
			pendingError += data;
		});

		// Once the process has finished we will try to deliver a successful report to the requester.
		phpcsProcess.on('close', (code) => {
			// When the request is cancelled we don't need to send anyone the report.
			if (this.cancellationToken?.isCancellationRequested) {
				reject(new CancellationError());
				return;
			}

			if (code !== 0) {
				console.log(pendingReport, pendingError);
				reject(new PHPCSError(pendingReport, pendingError));
				return;
			}

			// Trim everything from the report that isn't JSON.
			pendingReport = pendingReport.replace(/^[^{]+(.+}).*/, '$1');

			// Resolve the promise to complete the report.
			resolve(Response.fromRaw(request.type, pendingReport));
		});

		// Send the document to be handled.
		if (phpcsProcess.stdin.writable) {
			phpcsProcess.stdin.end(request.documentContent);
		}

		// Clear the content to free memory as we don't need it anymore.
		request.documentContent = '';

		return phpcsProcess;
	}
}
