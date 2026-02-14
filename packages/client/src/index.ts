#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import chalk from 'chalk';
import { portNumberCustomValidationForCommander } from './utils/index.js';
import socketHandler from './lib/socket.js';
import { startInspector } from './lib/inspector.js';
import 'dotenv/config';

// Get package.json version
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '../package.json');
const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

// Configure the CLI program
program
    .name('ProxyHub')
    .description("Test your API's with ease - Tunnel localhost to the internet")
    .version(version)
    .requiredOption('-p, --port <port>', 'Port number for proxying', portNumberCustomValidationForCommander)
    .option('-d, --debug', 'Enable debug mode', false)
    .option('-t, --token <token>', 'Token for tunnel protection')
    .option('-i, --inspect', 'Enable request inspector', false)
    .option('--inspect-port <port>', 'Port for inspector UI', parseInt);

// Parse command line arguments
program.parse(process.argv);

// Get parsed options and check for env var fallback
const parsedOpts = program.opts() as ClientInitializationOptions;
const options: ClientInitializationOptions = {
    port: parsedOpts.port,
    debug: parsedOpts.debug,
    token: parsedOpts.token || process.env.PROXYHUB_TOKEN,
    inspect: parsedOpts.inspect,
    inspectPort: parsedOpts.inspectPort,
    version,
};

// Startup logging
console.log('\nStarting ProxyHub Client...');
console.log('Target:', chalk.cyan(`http://localhost:${options.port}`));
if (options.token) {
    console.log('Token protection:', chalk.green('enabled'));
}
if (options.debug) {
    console.log('Debug mode:', chalk.green('enabled'));
}
if (options.inspect) {
    console.log('Inspector:', chalk.green('enabled'));
}
console.log('');

// Start the ProxyHub client
socketHandler(options);

// Start inspector if enabled
if (options.inspect) {
    const inspectPort = options.inspectPort || options.port + 1000;
    startInspector(inspectPort, options.port);
}

