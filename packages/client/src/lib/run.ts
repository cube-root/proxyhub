import socketHandler from "./socket.js";
import chalk from "chalk";

const run = (option: ClientInitializationOptions) => {
    console.log('\n🚀 Starting ProxyHub Client...');
    console.log('📍 Target:', chalk.red.bold(`http://localhost:${option.port}`));
    console.log('🔧 Debug mode:', option.debug ? chalk.green('enabled') : chalk.gray('disabled'));
    console.log('📜 Keep history:', option.keepHistory ? chalk.green('enabled') : chalk.gray('disabled'));
    console.log('🌐 Web interface:', option.webInterface ? chalk.green('enabled') : chalk.gray('disabled'));
    
    if (option.webInterface) {
        const webPort = option.webPort || 4001;
        console.log('📱 Web logs:', chalk.cyan.bold(`http://localhost:${webPort}`));
    }
    
    console.log('');
    
    // Initialize the socket handler
    socketHandler(option);
};

export default run; 