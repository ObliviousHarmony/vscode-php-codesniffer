import { ReportType } from './response';

/**
 * The request options for PHPCS.
 */
export interface RequestOptions {
	executable: string;
	standard: string | null;
}

/**
 * The "CodeAction" request type for PHPCS.
 */
export interface CodeActionRequest {
	code: string;
	line: number;
	character: number;
}

/**
 * The "Format" request type for PHPCS.
 */
export interface FormatRequest {
	start?: {
		line: number;
		character: number;
	};
	end?: {
		line: number;
		character: number;
	};
}

/**
 * A type utility for providing safety to requests based on the type of report they are for.
 */
type RequestContent<T extends ReportType> = [T] extends [ReportType.CodeAction]
	? CodeActionRequest
	: [T] extends [ReportType.Format]
	? FormatRequest
	: null;

/**
 * An interface describing the shape of a request to the worker.
 */
export interface Request<T extends ReportType> {
	/**
	 * The type of report that is being requested.
	 */
	type: T;

	/**
	 * The working directory for the workspace that the report is being generated for.
	 */
	workingDirectory: string;

	/**
	 * The filesystem path for the document that the report is being generated for.
	 */
	documentPath: string;

	/**
	 * The content for the document that the report is being generated for.
	 */
	documentContent: string;

	/**
	 * Any options that are needed for the request.
	 */
	options: RequestOptions;

	/**
	 * The data for the request.
	 */
	data: RequestContent<T>;
}
