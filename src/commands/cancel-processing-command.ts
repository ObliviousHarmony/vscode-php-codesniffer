import { WorkerService } from '../services/worker-service';

/**
 * A class for handling the command that cancels all active document processing.
 */
export class CancelProcessingCommand {
	/**
	 * The identifier for the command.
	 */
	public static readonly COMMAND = 'phpCodeSniffer.cancelProcessing';

	/**
	 * All of the worker services that we should cancel execution for.
	 */
	private readonly cancellableServices: WorkerService[];

	/**
	 * Constructor.
	 *
	 * @param {workspace} workspace The VS Code workspace.
	 */
	public constructor(cancellableServices: WorkerService[]) {
		this.cancellableServices = cancellableServices;
	}

	/**
	 * Handles the command.
	 */
	public handle(): void {
		for (const service of this.cancellableServices) {
			service.cancelAll();
		}
	}
}
