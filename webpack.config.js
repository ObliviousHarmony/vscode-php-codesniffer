'use strict';

const path = require('path');

const config = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: [ '.ts' ]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader'
            },
            {
                test: /\.php$/,
                loader: 'file-loader',
                options: {
                    name: '[path][name].[ext]',
                    esModule: false,
                }
            }
        ]
    }
}
module.exports = config;
