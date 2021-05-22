import {
	commands,
	ExtensionContext,
	languages,
	window,
	workspace,
} from 'vscode';
import { CodeActionCollection } from './types';
import { Configuration } from './services/configuration';
import { WorkspaceListener } from './listeners/workspace-listener';
import { WorkerPool } from './phpcs-report/worker-pool';
import { CodeActionProvider } from './providers/code-action-provider';
import { CommandProvider } from './providers/command-provider';
import { FormatDocumentProvider } from './providers/format-document-provider';
import { CodeActionEditResolver } from './services/code-action-edit-resolver';
import { DiagnosticUpdater } from './services/diagnostic-updater';
import { DocumentFormatter } from './services/document-formatter';
import { Logger } from './services/logger';
import { LinterStatus } from './services/linter-status';

export function activate(context: ExtensionContext): void {
	// We will store all of the diagnostics and code actions
	// here to share across all of our dependencies.
	const diagnosticCollection =
		languages.createDiagnosticCollection('PHP_CodeSniffer');
	context.subscriptions.push(diagnosticCollection);
	const codeActionCollection = new CodeActionCollection();

	// Create all of our dependencies.
	const logger = new Logger(window);
	const linterStatus = new LinterStatus(window);
	const configuration = new Configuration(workspace);
	const workerPool = new WorkerPool(10);
	const diagnosticUpdater = new DiagnosticUpdater(
		logger,
		configuration,
		workerPool,
		linterStatus,
		diagnosticCollection,
		codeActionCollection
	);
	const codeActionEditResolver = new CodeActionEditResolver(
		logger,
		configuration,
		workerPool
	);
	const documentFormatter = new DocumentFormatter(
		logger,
		configuration,
		workerPool
	);
	const commandProvider = new CommandProvider();
	const workspaceListener = new WorkspaceListener(
		configuration,
		diagnosticUpdater,
		codeActionEditResolver,
		documentFormatter
	);

	// Make sure all of our dependencies will be cleaned up.
	context.subscriptions.push(logger);
	context.subscriptions.push(linterStatus);
	context.subscriptions.push(diagnosticUpdater);
	context.subscriptions.push(codeActionEditResolver);
	context.subscriptions.push(documentFormatter);
	context.subscriptions.push(commandProvider);
	context.subscriptions.push(workspaceListener);

	// Register all of our providers.
	commandProvider.register(workspace, commands);
	context.subscriptions.push(
		languages.registerCodeActionsProvider(
			{ language: 'php' },
			new CodeActionProvider(codeActionCollection, codeActionEditResolver)
		)
	);
	const formatDocumentProvider = new FormatDocumentProvider(
		documentFormatter,
		diagnosticUpdater
	);
	context.subscriptions.push(
		languages.registerDocumentFormattingEditProvider(
			{ language: 'php' },
			formatDocumentProvider
		)
	);
	context.subscriptions.push(
		languages.registerDocumentRangeFormattingEditProvider(
			{ language: 'php' },
			formatDocumentProvider
		)
	);

	// Start listening to the workspace.
	workspaceListener.start(workspace, window);
}
