const DEBUG = process.env.DEBUG === 'true';

export const debug = (...args: any[]) => {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
};
