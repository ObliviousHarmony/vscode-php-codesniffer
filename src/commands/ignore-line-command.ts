import { Range, TextDocument, TextLine, workspace as vsCodeWorkspace, WorkspaceEdit } from 'vscode';

/**
 * A class for handling problem ignore line commands.
 */
export class IgnoreLineCommand {
    /**
     * The identifier for the command.
     */
    public static readonly COMMAND = 'phpCodeSniffer.ignoreLine';

    /**
     * The VS Code workspace.
     */
    private workspace: typeof vsCodeWorkspace;

    /**
     * Constructor.
     *
     * @param {workspace} workspace The VS Code workspace.
     */
    public constructor(workspace: typeof vsCodeWorkspace) {
        this.workspace = workspace;
    }

    /**
     * Handles the command.
     *
     * @param {TextDocument} document The document containing the problem we're ignoring.
     * @param {string} code The code for the problem we're ignoring.
     * @param {number} line The line to limit the ignore to.
     */
    public handle(document: TextDocument, source: string, line: number): void {
        const sourceLine = document.lineAt(line);
        if (this.editExistingComment(document, source, sourceLine)) {
            return;
        }

        // Add a commend at the end of the line since we're not using it.
        const range = new Range(
            line,
            sourceLine.range.end.character,
            line,
            sourceLine.range.end.character + 1
        );

        // Make sure there's only a space at the end if there isn't one already.
        let ignoreLine = '// phpcs:ignore ' + source;
        if (!sourceLine.text.match(/(?:\s|\t)$/)) {
            ignoreLine = ' ' + ignoreLine;
        }

        const edit = new WorkspaceEdit();
        edit.replace(document.uri, range, ignoreLine);
        this.workspace.applyEdit(edit);
    }

    /**
     * Attempts to edit an existing comment if one exists.
     *
     * @param {TextDocument} document The document we're editing.
     * @param {string} source The source of the problem we're editing.
     * @param {TextLine} line The line of content we're editing.
     */
    private editExistingComment(document: TextDocument, source: string, line: TextLine): boolean {
        const existing = line.text.match(/phpcs:ignore ([A-Za-z.,]+)*/);
        if (!existing) {
            return false;
        }

        // We're going to replace the existing comment.
        const range = new Range(
            line.lineNumber,
            existing.index ?? 0,
            line.lineNumber,
            (existing.index ?? 0) + existing[0].length
        )

        // Add the new source.
        const sources = existing[1].split(',');
        sources.push(source);

        const edit = new WorkspaceEdit();
        edit.replace(document.uri, range, 'phpcs:ignore ' + sources.join(','));
        this.workspace.applyEdit(edit);
        return true;
    }
}
