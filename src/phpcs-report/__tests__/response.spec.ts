import { ReportType, Response } from '../response';

describe('Response', () => {
    it('should parse empty reports', () => {
        const response = Response.empty(ReportType.Diagnostic);

        expect(response.type).toBe(0);
        expect(response.report).toBeUndefined();
    });

    it('should parse diagnostic reports', () => {
        const jsonString = '{"files":[{"filename":"the/test.php","diagnostics":[{"code":"Test","message":"TestM","range":{"startLine":0,"startCharacter":0,"endLine":0,"endCharacter":1},"severity":0,"source":"PHP_CodeSniffer"}],"codeActions":[{"title":"Fix Test","kind":"quickfix","diagnostic":0}]}]}';
        const response = Response.fromRaw(ReportType.Diagnostic, jsonString);

        expect(response.type).toBe(0);
        expect(response.report).toHaveProperty('diagnostics');
        expect(response.report?.diagnostics).toHaveLength(1);
        expect(response.report?.diagnostics[0].message).toBe('TestM');
        expect(response.report).toHaveProperty('codeActions');
        expect(response.report?.codeActions).toHaveLength(1);
        expect(response.report?.codeActions[0].title).toBe('Fix Test');
        // Make sure the code action contains a reference to the diagnostic and not a copy.
        expect(response.report?.codeActions[0].diagnostics).toStrictEqual([ response.report?.diagnostics[0] ]);
    });
});
