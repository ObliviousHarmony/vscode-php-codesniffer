import { Disposable, OutputChannel, window as vsCodeWindow } from 'vscode';
import { PHPCSError } from '../phpcs-report/worker';

/**
 * A logger for presenting errors to the user.
 */
export class Logger implements Disposable {
	/**
	 * The window for logging errors.
	 */
	private readonly window: typeof vsCodeWindow;

	/**
	 * The output channel to log into.
	 */
	private readonly outputChannel: OutputChannel;

	/**
	 * Constructor.
	 *
	 * @param {window} window The window to log errors using.
	 */
	public constructor(window: typeof vsCodeWindow) {
		this.window = window;
		this.outputChannel = this.window.createOutputChannel('PHP_CodeSniffer');
	}

	/**
	 * Disposes of a logger's resources.
	 */
	public dispose(): void {
		this.outputChannel.dispose();
	}

	/**
	 * Given an error this will take appropriate action to log it.
	 *
	 * @param {Error} error The error to log.
	 */
	public error(error: Error): void {
		// Users should be informed of PHPCS errors.
		if (error instanceof PHPCSError) {
			this.window.showErrorMessage(error.message);
			this.outputChannel.show(true);
			this.writeMessage(error.errorOutput || error.output);
			return;
		}

		this.writeMessage(error.message);
	}

	/**
	 * Writes a message to the output channel.
	 *
	 * @param {string} message The message to write.
	 */
	private writeMessage(message: string): void {
		const now = new Date();
		const timestamp =
			now.getFullYear() +
			'-' +
			now.getMonth() +
			'-' +
			now.getDay() +
			' ' +
			now.getHours() +
			':' +
			now.getMinutes() +
			now.getSeconds();
		this.outputChannel.append('[' + timestamp + ']: ');
		this.outputChannel.appendLine(message.trim());
	}
}
