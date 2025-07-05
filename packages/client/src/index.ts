#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { portNumberCustomValidationForCommander } from './utils/index.js';
import run from './lib/run.js';
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
    .option('-d, --debug', 'Enable debug mode')
    .option('-keep, --keep-history', 'Do not delete history on disconnect');

// Parse command line arguments
program.parse(process.argv);

// Get parsed options
const options: ClientInitializationOptions = program.opts();

// Start the ProxyHub client
run(options);

