import {
	Disposable,
	commands as vsCodeCommands,
	workspace as vsCodeWorkspace,
} from 'vscode';
import { IgnoreLineCommand } from '../commands/ignore-line-command';

/**
 * A class for providing command to VS Code.
 */
export class CommandProvider implements Disposable {
	/**
	 * The subscriptions our provider has.
	 */
	private readonly subscriptions: Disposable[];

	/**
	 * Constructor.
	 */
	public constructor() {
		this.subscriptions = [];
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
