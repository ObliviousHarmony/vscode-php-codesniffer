import {
	Disposable,
	commands as vsCodeCommands,
	workspace as vsCodeWorkspace,
} from 'vscode';
import { CancelProcessingCommand } from '../commands/cancel-processing-command';
import { IgnoreLineCommand } from '../commands/ignore-line-command';
import { CodeActionEditResolver } from '../services/code-action-edit-resolver';
import { DiagnosticUpdater } from '../services/diagnostic-updater';
import { DocumentFormatter } from '../services/document-formatter';

/**
 * A class for providing command to VS Code.
 */
export class CommandProvider implements Disposable {
	/**
	 * The subscriptions our provider has.
	 */
	private readonly subscriptions: Disposable[];

	/**
	 * The service for updating document diagnostics.
	 */
	private readonly diagnosticUpdater: DiagnosticUpdater;

	/**
	 * The service for resolving code action edits.
	 */
	private readonly codeActionEditResolver: CodeActionEditResolver;

	/**
	 * The service for formatting documents.
	 */
	private readonly documentFormatter: DocumentFormatter;

	/**
	 * Constructor.
	 */
	public constructor(
		diagnosticUpdater: DiagnosticUpdater,
		codeActionEditResolver: CodeActionEditResolver,
		documentFormatter: DocumentFormatter
	) {
		this.subscriptions = [];
		this.diagnosticUpdater = diagnosticUpdater;
		this.codeActionEditResolver = codeActionEditResolver;
		this.documentFormatter = documentFormatter;
	}

	/**
	 * Cleans up the class' resources.
	 */
	public dispose(): void {
		for (const sub of this.subscriptions) {
			sub.dispose();
		}
		this.subscriptions.splice(0, this.subscriptions.length);
	}

	/**
	 * Registers the commands.
	 *
	 * @param {workspace} workspace The VS Code workspace.
	 * @param {commands} commands The VS Code commands object.
	 */
	public register(
		workspace: typeof vsCodeWorkspace,
		commands: typeof vsCodeCommands
	): void {
		// This command allows users to cancel all processing of documents in the extension.
		const cancelProcessingCommand = new CancelProcessingCommand([
			this.diagnosticUpdater,
			this.codeActionEditResolver,
			this.documentFormatter,
		]);
		this.subscriptions.push(
			commands.registerCommand(
				CancelProcessingCommand.COMMAND,
				cancelProcessingCommand.handle,
				cancelProcessingCommand
			)
		);

		// This command allows users to ignore specific sniffs on a line.
		const ignoreLineCommand = new IgnoreLineCommand(workspace);
		this.subscriptions.push(
			commands.registerCommand(
				IgnoreLineCommand.COMMAND,
				ignoreLineCommand.handle,
				ignoreLineCommand
			)
		);
	}
}
