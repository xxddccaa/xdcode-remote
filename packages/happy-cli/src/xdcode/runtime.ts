import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

export type XdcodeModel = {
    code: string;
    value: string;
    description: string;
    model: string;
    providerId: string;
    providerName: string;
    catalogId?: string;
    thinkingLevels: string[];
    defaultThinkingLevel?: string;
};

export function xdcodeCommand(): string {
    return process.env.HAPPY_XDCODE_PATH || 'xdcode';
}

export function readXdcodeVersion(): string {
    return execFileSync(xdcodeCommand(), ['--version'], {
        encoding: 'utf8', timeout: 10_000, windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

let cached: { command: string; home: string | undefined; expires: number; models: XdcodeModel[] } | undefined;

/** Publish only catalog labels and selection fields; never endpoints or credentials. */
export function readXdcodeModels(fresh = false): XdcodeModel[] {
    const command = xdcodeCommand();
    const home = process.env.XDCODE_HOME;
    if (!fresh && cached?.command === command && cached.home === home && cached.expires > Date.now()) {
        return cached.models;
    }
    const raw = execFileSync(command, ['models', 'list', '--json'], {
        encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024,
        windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const models = parseXdcodeModels(JSON.parse(raw));
    cached = { command, home, expires: Date.now() + 30_000, models };
    return models;
}

export function parseXdcodeModels(data: any): XdcodeModel[] {
    if (!data || !Array.isArray(data.models)) throw new Error('Invalid xdcode model catalog');
    const models: XdcodeModel[] = data.models.filter((entry: any) =>
        typeof entry?.id === 'string' && typeof entry.model === 'string'
        && typeof entry.provider === 'string' && entry.compatibility !== 'incompatible',
    ).map((entry: any) => {
        const providerName = data.providers?.[entry.provider]?.name || entry.provider;
        return {
            code: `xdcode:${encodeURIComponent(entry.id)}`,
            value: entry.name || entry.model,
            description: String(providerName),
            model: entry.model, providerId: entry.provider, providerName: String(providerName),
            catalogId: entry.id,
            thinkingLevels: Array.isArray(entry.reasoning_efforts)
                ? entry.reasoning_efforts.filter((level: unknown) => typeof level === 'string') : [],
            ...(typeof entry.default_reasoning_effort === 'string'
                ? { defaultThinkingLevel: entry.default_reasoning_effort } : {}),
        };
    });
    const current = data.current;
    if (typeof current?.model === 'string' && typeof current.provider === 'string') {
        const entry = models.find((model) => model.model === current.model && model.providerId === current.provider);
        models.unshift({
            code: 'default', value: 'xdcode default', description: entry?.providerName || current.provider,
            model: current.model, providerId: current.provider,
            providerName: entry?.providerName || current.provider,
            catalogId: entry?.catalogId, thinkingLevels: entry?.thinkingLevels || [],
            ...(typeof current.reasoning_effort === 'string' ? { defaultThinkingLevel: current.reasoning_effort } : {}),
        });
    }
    return models;
}

export function resolveXdcodeModel(models: XdcodeModel[], key?: string): XdcodeModel {
    const selection = key ? models.find((model) => model.code === key) : models.find((model) => model.code === 'default');
    if (!selection) throw new Error('The selected xdcode model is unavailable. Refresh the machine model list and select again.');
    return selection;
}

let refreshing: Promise<XdcodeModel[]> | undefined;

export async function availableXdcodeModels(): Promise<XdcodeModel[]> {
    const command = xdcodeCommand();
    const home = process.env.XDCODE_HOME;
    if (cached?.command === command && cached.home === home && cached.expires > Date.now()) return cached.models;
    if (!refreshing) {
        refreshing = (async () => {
            try {
                const { stdout } = await promisify(execFile)(command, ['models', 'list', '--json'], {
                    encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
                });
                const models = parseXdcodeModels(JSON.parse(stdout));
                cached = { command, home, expires: Date.now() + 30_000, models };
                return models;
            } catch {
                cached = { command, home, expires: Date.now() + 30_000, models: [] };
                return [];
            } finally { refreshing = undefined; }
        })();
    }
    return refreshing;
}
