#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import chalk from 'chalk';
import { portNumberCustomValidationForCommander } from './utils/index.js';
import socketHandler from './lib/socket.js';
import { startInspector } from './lib/inspector.js';
import { runWizard } from './lib/init.js';
import 'dotenv/config';

// Get package.json version
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, '../package.json');
const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

function run(options: ClientInitializationOptions, authKey?: string): void {
    if (authKey) process.env.PROXYHUB_AUTH_KEY = authKey;

    // Validate: need either port or mock mode
    if (!options.port && !options.mock) {
        console.error(chalk.red('Error: Either --port or --mock is required.'));
        console.error(chalk.gray('  Use --port <port> to proxy to a local server'));
        console.error(chalk.gray('  Use --mock for pure mock mode (no local server needed)'));
        process.exit(1);
    }

    // Mock and inspect are co-dependent — enabling either enables both
    if (options.mock || options.inspect) {
        options.mock = true;
        options.inspect = true;
    }

    // Startup logging
    console.log('\nStarting ProxyHub Client...');
    if (options.port) {
        console.log('Target:', chalk.cyan(`http://localhost:${options.port}`));
    }
    if (options.mock && options.port) {
        console.log('Mode:', chalk.magenta('hybrid (mock + proxy)'));
    } else if (options.mock) {
        console.log('Mode:', chalk.magenta('pure mock (no local server)'));
    }
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
        const inspectPort = options.inspectPort || (options.port ? options.port + 1000 : 3001);
        startInspector(inspectPort, options.port, { mock: options.mock });
    }
}

const program = new Command();

program
    .name('ProxyHub')
    .description("Test your API's with ease - Tunnel localhost to the internet")
    .version(version)
    .option('-p, --port <port>', 'Port number for proxying', portNumberCustomValidationForCommander)
    .option('-d, --debug', 'Enable debug mode', false)
    .option('-t, --token <token>', 'Token for tunnel protection')
    .option('-i, --inspect', 'Enable request inspector', false)
    .option('-m, --mock', 'Enable mock mode', false)
    .option('--inspect-port <port>', 'Port for inspector UI', parseInt)
    .option('-k, --auth-key <key>', 'Authentication key for the ProxyHub server')
    .action(() => {
        const parsedOpts = program.opts() as ClientInitializationOptions & { port?: number; authKey?: string };
        const options: ClientInitializationOptions = {
            port: parsedOpts.port,
            debug: parsedOpts.debug,
            token: parsedOpts.token || process.env.PROXYHUB_TOKEN,
            inspect: parsedOpts.inspect,
            inspectPort: parsedOpts.inspectPort,
            mock: parsedOpts.mock,
        };
        run(options, parsedOpts.authKey);
    });

program
    .command('init')
    .description('Interactive wizard to configure and start ProxyHub')
    .action(async () => {
        const { options, authKey } = await runWizard();
        run(options, authKey);
    });

program.parseAsync(process.argv);
