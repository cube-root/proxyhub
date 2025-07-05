import socketHandler from "./socket.js";
import chalk from "chalk";

const run = (option: ClientInitializationOptions) => {
    console.log('\n🚀 Starting ProxyHub Client...');
    console.log('📍 Target:', chalk.red.bold(`http://localhost:${option.port}`));
    console.log('🔧 Debug mode:', option.debug ? chalk.green('enabled') : chalk.gray('disabled'));
    console.log('📜 Keep history:', option.keepHistory ? chalk.green('enabled') : chalk.gray('disabled'));
    console.log('');
    
    // Initialize the socket handler
    socketHandler(option);
};

export default run; 