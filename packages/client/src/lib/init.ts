import { intro, outro, text, select, confirm, cancel, isCancel, note } from '@clack/prompts';
import chalk from 'chalk';

export interface WizardResult {
    options: ClientInitializationOptions;
    authKey?: string;
}

function bail<T>(value: T | symbol): T {
    if (isCancel(value)) {
        cancel('Setup cancelled');
        process.exit(0);
    }
    return value as T;
}

function validatePort(v: string | undefined, fallback: number): string | undefined {
    const raw = v && v.trim() ? v : String(fallback);
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > 65535) return 'Port must be a number between 1 and 65535';
    return undefined;
}

function buildCommandPreview(opts: ClientInitializationOptions, authKey: string | undefined, userPickedMock: boolean, userPickedInspect: boolean): string {
    const parts: string[] = ['proxyhub'];
    if (opts.inspectorOnly) parts.push('--inspector-only');
    if (opts.port) parts.push(`-p ${opts.port}`);
    if (userPickedMock) parts.push('--mock');
    if (userPickedInspect) parts.push('--inspect');
    if (opts.inspectPort) parts.push(`--inspect-port ${opts.inspectPort}`);
    if (opts.token) parts.push('--token ***');
    if (authKey) parts.push('--auth-key ***');
    if (opts.debug) parts.push('--debug');
    return parts.join(' ');
}

export async function runWizard(): Promise<WizardResult> {
    intro(chalk.bgMagenta.white(' ProxyHub Setup '));

    const mode = bail(await select({
        message: 'What do you want to run?',
        options: [
            { value: 'proxy', label: 'Proxy a local server', hint: 'tunnel traffic to localhost' },
            { value: 'inspect', label: 'Proxy + request inspector', hint: 'tunnel + UI at /__inspect' },
            { value: 'hybrid', label: 'Proxy + mocks (hybrid)', hint: 'mock some paths, proxy the rest' },
            { value: 'mock', label: 'Pure mock mode', hint: 'no local server required' },
            { value: 'inspector-only', label: 'Inspector only (no tunnel)', hint: 'browse logged requests locally' },
        ],
    })) as 'proxy' | 'inspect' | 'hybrid' | 'mock' | 'inspector-only';

    if (mode === 'inspector-only') {
        const defaultIp = 3001;
        const ipStr = bail(await text({
            message: 'Inspector port',
            placeholder: String(defaultIp),
            defaultValue: String(defaultIp),
            validate: (v) => validatePort(v, defaultIp),
        })) as string;
        const picked = parseInt(ipStr || String(defaultIp), 10);

        const debug = bail(await confirm({
            message: 'Enable debug mode?',
            initialValue: false,
        })) as boolean;

        const options: ClientInitializationOptions = {
            inspectorOnly: true,
            inspectPort: picked !== defaultIp ? picked : undefined,
            debug,
        };

        note(buildCommandPreview(options, undefined, false, false), 'Equivalent command');
        outro(chalk.green('Starting ProxyHub Inspector...'));

        return { options };
    }

    const needsPort = mode !== 'mock';
    let port: number | undefined;
    if (needsPort) {
        const portStr = bail(await text({
            message: 'Local port to proxy',
            placeholder: '3000',
            defaultValue: '3000',
            validate: (v) => validatePort(v, 3000),
        })) as string;
        port = parseInt(portStr || '3000', 10);
    }

    const userPickedMock = mode === 'hybrid' || mode === 'mock';
    const userPickedInspect = mode === 'inspect';
    const inspectEnabled = userPickedMock || userPickedInspect;

    let inspectPort: number | undefined;
    if (inspectEnabled) {
        const defaultIp = port ? port + 1000 : 3001;
        const ipStr = bail(await text({
            message: 'Inspector port',
            placeholder: String(defaultIp),
            defaultValue: String(defaultIp),
            validate: (v) => validatePort(v, defaultIp),
        })) as string;
        const picked = parseInt(ipStr || String(defaultIp), 10);
        if (picked !== defaultIp) inspectPort = picked;
    }

    const useToken = bail(await confirm({
        message: 'Protect the tunnel with a token?',
        initialValue: false,
    })) as boolean;
    let token: string | undefined;
    if (useToken) {
        token = bail(await text({
            message: 'Tunnel token',
            placeholder: 'my-secret-token',
            validate: (v) => (!v ? 'Token cannot be empty' : undefined),
        })) as string;
    }

    const useAuthKey = bail(await confirm({
        message: 'Use a ProxyHub server auth key?',
        initialValue: false,
    })) as boolean;
    let authKey: string | undefined;
    if (useAuthKey) {
        authKey = bail(await text({
            message: 'Auth key',
            placeholder: 'your-auth-key',
            validate: (v) => (!v ? 'Auth key cannot be empty' : undefined),
        })) as string;
    }

    const debug = bail(await confirm({
        message: 'Enable debug mode?',
        initialValue: false,
    })) as boolean;

    const options: ClientInitializationOptions = {
        port,
        mock: userPickedMock,
        inspect: inspectEnabled,
        inspectPort,
        token,
        debug,
    };

    note(buildCommandPreview(options, authKey, userPickedMock, userPickedInspect), 'Equivalent command');
    outro(chalk.green('Starting ProxyHub...'));

    return { options, authKey };
}
