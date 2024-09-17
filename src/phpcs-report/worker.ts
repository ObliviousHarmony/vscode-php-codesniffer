import { ChildProcess, spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { resolve as resolvePath } from 'path';
import { CancellationError, CancellationToken, Disposable } from 'vscode';
import * as splitString from 'split-string';
import { Request } from './request';
import { ReportType, Response } from './response';
import { PHPCS_INTEGRATION_VERSION } from '../services/configuration';

/**
 * A callback to execute when the worker has completed its task.
 *
 * @callback CompletionCallback
 * @param {Worker} worker The worker that has completed its task.
 */
type CompletionCallback = (worker: Worker) => void;

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

		console.log(output, errorOutput);

		// Depending on the type of error we may want to perform some processing.
		const match = this.errorOutput.match(
			/Uncaught InvalidArgumentException: (The extension[^)]+)/
		);
		if (match) {
			this.errorOutput = match[1];
		}
	}
}

/**
 * A worker for getting reports out of PHPCS and returning them to the consumer.
 */
export class Worker {
	/**
	 * A callback to execute when a worker's active status changes.
	 */
	private readonly onCompletion?: CompletionCallback;

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
	 * @param {CompletionCallback} [onCompletion] A callback to execute when a worker has completed its task.
	 */
	public constructor(onCompletion?: CompletionCallback) {
		this.onCompletion = onCompletion;
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
			// The absolute lack of a standard indicates that the worker shouldn't run.
			if (request.options.standard === null) {
				this.onCompletion?.(this);
				resolve(Response.empty(request.type));
				return;
			}

			// We can save time by not running the worker if there is no content.
			if (request.documentContent.length <= 0) {
				this.onCompletion?.(this);
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

			// When the process closes we should clean up the worker and prepare it for a fresh execution.
			this.activeProcess.on('close', () => {
				if (cancellationHandler) {
					cancellationHandler.dispose();
				}
				delete this.cancellationToken;
				delete this.activeProcess;

				// The worker should broadcast its availability.
				this.onCompletion?.(this);
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
		// Allow for the configuration to decide whether the report files are autoloaded
		let report;
		if (request.options.autoloadPHPCSIntegration) {
			report =
				'ObliviousHarmony\\VSCodePHPCSIntegration\\VSCodeIntegration';
		} else {
			// Let an environment variable override the asset path.
			let assetsPath;
			if (process.env.ASSETS_PATH) {
				assetsPath = process.env.ASSETS_PATH;
			} else {
				// After bundling there will be a single file at the root of
				// the repo. We need to treat this path relative to that
				// instead of the current file's location.
				assetsPath = resolvePath(__dirname, 'assets');
			}

			// Resolve a path to the report file.
			report = resolvePath(
				assetsPath,
				'phpcs-integration',
				'VSCodeIntegration.php'
			);
		}

		// Prepare the arguments for our PHPCS process.
		const processArguments = [
			'-q', // Make sure custom configs never break our output.
			'--report=' + report,
			// We want to reserve error exit codes for actual errors in the PHPCS execution since errors/warnings are expected.
			'--runtime-set',
			'ignore_warnings_on_exit',
			'1',
			'--runtime-set',
			'ignore_errors_on_exit',
			'1',
		];

		// We support the use of arguments in the executable option. This allows for
		// users to build more complex commands such as those that should be ran
		// in a container or with specific arguments.
		const supportedQuotes = ["'", '"'];
		const parsedExecutable = splitString(request.options.executable, {
			quotes: supportedQuotes,
			brackets: false,
			separator: ' ',
		});
		if (!parsedExecutable.length) {
			throw new Error('No executable was given.');
		}

		// Trim quotes from the start/end of each argument since Node will
		// handle quoting any arguments for us when we spawn the process.
		for (const key in parsedExecutable) {
			const segment = parsedExecutable[key];

			const first = segment.at(0);
			if (!first) {
				continue;
			}

			if (!supportedQuotes.includes(first)) {
				continue;
			}

			// Only remove matching quotes.
			if (segment.at(-1) !== first) {
				continue;
			}

			parsedExecutable[key] = segment.slice(1, -1);
		}

		// The first segment will always be the executable.
		const executable = parsedExecutable.shift();
		if (!executable) {
			throw new Error('No executable was given.');
		}

		// Any remaining matches will be arguments that we pass to the executable.
		// Make sure to add them to the front so it runs PHPCS correctly.
		processArguments.unshift(...parsedExecutable);

		// Only set the standard when the user has selected one.
		if (request.options.standard) {
			processArguments.push('--standard=' + request.options.standard);
		}

		// Prepare the options for the PHPCS process.
		const processOptions: SpawnOptionsWithoutStdio = {
			cwd: request.workingDirectory,
			env: {
				...process.env,
				// Pass the request data using environment vars.
				PHPCS_VSCODE_INPUT: JSON.stringify({
					version: PHPCS_INTEGRATION_VERSION,
					type: request.type,
					data: request.data,
				}),
			},
			windowsHide: true,
		};

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

		// Make sure that we handle any process-related errors.
		let handledProcessError = false;
		phpcsProcess.on('error', (err) => {
			handledProcessError = true;

			if (err.message.includes('ENOENT')) {
				reject(
					new PHPCSError(
						'',
						'The PHPCS executable "' +
							executable +
							'" could not be found.'
					)
				);
				return;
			}

			reject(new PHPCSError('', 'The PHPCS process failed to start.'));
		});

		// Once the process has finished we will try to deliver a successful report to the requester.
		phpcsProcess.on('close', (code) => {
			// There's nothing to do since the process error rejected the promise.
			if (handledProcessError) {
				return;
			}

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
			// Buffer the input so that Windows' blocking read will pull everything.
			phpcsProcess.stdin.cork();

			// Write the input file path before the content so PHPCS can utilize it.
			phpcsProcess.stdin.write(
				'phpcs_input_file: ' + request.documentPath + '\n'
			);

			// Write out the file content now and close the input.
			phpcsProcess.stdin.end(request.documentContent);
		}

		// Clear the content to free memory as we don't need it anymore.
		request.documentContent = '';

		return phpcsProcess;
	}
}
