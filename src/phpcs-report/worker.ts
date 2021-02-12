import { ChildProcess, spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { CancellationToken, Disposable } from 'vscode';
import { ReportFiles } from './report-files';
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
 * A worker for getting reports out of PHPCS and returning them to the consumer.
 */
export class Worker {
    /**
     * The current process if the worker is active.
     */
    private activeProcess?: ChildProcess;

    /**
     * The cancellation token we should use to check if the request may have been cancelled.
     */
    private cancellationToken?: CancellationToken;

    /**
     * A callback to execute when a worker's active status changes.
     */
    private onActiveChanged?: ActiveChangedCallback;

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
    public execute<T extends ReportType>(request: Request<T>, cancellationToken?: CancellationToken): void {
        if (this.isActive) {
            throw new Error('This worker is already active.');
        }

        // Under certain circumstances we shouldn't bother generating a report because it will be empty.
        if (request.options.standard === 'Disabled' || request.documentContent.length <= 0) {
            request.onComplete(Response.fromRaw(request.type, ''));
            return;
        }

        // When a consumer passes a cancellation token we will use that to signal
        // that the running request should be terminated and the worker freed.
        let cancellationHandler: Disposable | null = null;
        if (cancellationToken) {
            // Keep track of the handler so that we can remove it when cancellation is no longer possible.
            cancellationHandler = cancellationToken.onCancellationRequested(() => this.onCancellation(cancellationToken));
        }
        this.cancellationToken = cancellationToken;

        // The requester will receive the report when it is finished.
        this.activeProcess = this.createProcess(request);

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

        this.activeProcess?.kill('SIGTERM');
    }

    /**
     * Returns an absolute path to the report file for the given type of report.
     *
     * @param {ReportType} type The type of report we're getting the path of.
     */
    private getReportFile(type: ReportType): string {
        switch (type) {
            case ReportType.Diagnostic: return ReportFiles.Diagnostic;
            case ReportType.CodeAction: return ReportFiles.CodeAction;
            case ReportType.Format: return ReportFiles.Format;
            default:
                throw new Error(`An invalid report type of "${type}" was used.`);
        }
    }

    /**
     * Creates a PHPCS process to execute the report generation.
     *
     * @param {Request} request The request we're processing.
     */
    private createProcess<T extends ReportType>(request: Request<T>): ChildProcess {
        const processArguments = [
            '-q', // Make sure custom configs never break our output.
            '--report=' + this.getReportFile(request.type),
            // We want to reserve error exit codes for actual errors in the PHPCS execution since errors/warnings are expected.
            '--runtime-set', 'ignore_warnings_on_exit', '1',
            '--runtime-set', 'ignore_errors_on_exit', '1',
            '--standard=' + request.options.standard
        ];

        const processOptions: SpawnOptionsWithoutStdio = {};

        // Pass the request data using environment vars.
        if (request.data) {
            processOptions.env = process.env;
            processOptions.env['PHPCS_VSCODE_DATA'] = JSON.stringify(request.data);
        }

        // Give the working directory when requested.
        if (request.options.workingDirectory) {
            processOptions.cwd = request.options.workingDirectory;
        }

        // Create a new process to fetch the report.
        const phpcsProcess = spawn(request.options.executable, processArguments, processOptions);

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
                return;
            }

            if (code !== 0) {
                console.error(pendingReport, pendingError);
                request.onComplete(Response.fromRaw(request.type, ''));
                return;
            }

            // Use the completion handler to give the report to the requester.
            request.onComplete(
                Response.fromRaw(
                    request.type,
                    pendingReport
                )
            );
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
