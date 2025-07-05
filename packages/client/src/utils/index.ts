import { InvalidArgumentError } from 'commander';
import chalk from 'chalk';

/**
 * Custom validation function for port numbers in Commander
 * @param value - The port value to validate
 * @returns The validated port number
 * @throws InvalidArgumentError if port is invalid
 */
export const portNumberCustomValidationForCommander = (value: string): number => {
    const port = parseInt(value, 10);
    
    if (isNaN(port)) {
        throw new InvalidArgumentError('Port must be a number');
    }
    
    if (port < 1 || port > 65535) {
        throw new InvalidArgumentError('Port must be between 1 and 65535');
    }
    
    return port;
};

/**
 * Print connection information to the console
 * @param data - URL information from the server
 */
export const printInfo = (data: UrlInfo): void => {
    console.log('\n' + chalk.green.bold('🎉 Tunnel established successfully!'));
    console.log(chalk.cyan.bold('📡 Your local service is now accessible at:'));
    console.log(chalk.yellow.bold(`   ${data.url}`));
    console.log(chalk.gray(`   -> forwarding to localhost:${data.localPort}`));
    console.log(chalk.gray(`   Connection ID: ${data.id}`));
    console.log(chalk.green.bold('\n✅ Ready to receive requests...\n'));
};

/**
 * Print error information to the console
 * @param message - Error message to display
 */
export const printError = (message: string): void => {
    console.log(chalk.red.bold('❌ Error:'), message);
};

/**
 * Print debug information to the console
 * @param message - Debug message to display
 * @param data - Optional data to display
 */
export const printDebug = (message: string, data?: any): void => {
    console.log(chalk.blue.bold('🔍 Debug:'), message);
    if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
}; 