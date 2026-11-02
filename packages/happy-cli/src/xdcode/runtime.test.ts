import { describe, expect, it } from 'vitest';
import { parseXdcodeModels, resolveXdcodeModel } from './runtime';

describe('xdcode catalog boundary', () => {
    const catalog = {
        current: { model: 'shared-model', provider: 'provider-b', reasoning_effort: 'high' },
        providers: {
            'provider-a': { name: 'Service A', endpoint: 'https://private.invalid', env_key: 'PRIVATE_KEY', token: 'secret' },
            'provider-b': { name: 'Service B', credentials_present: true },
        },
        models: [
            { id: 'a/model', name: 'Coder A', model: 'shared-model', provider: 'provider-a', reasoning_efforts: ['low', 'high'] },
            { id: 'b:model', name: 'Coder B', model: 'shared-model', provider: 'provider-b', reasoning_efforts: [] },
            { id: 'unsupported', model: 'chat-only', provider: 'provider-a', compatibility: 'incompatible' },
        ],
    };

    it('keeps same-name models from different providers independently selectable', () => {
        const models = parseXdcodeModels(catalog);
        expect(resolveXdcodeModel(models, 'xdcode:a%2Fmodel').providerId).toBe('provider-a');
        expect(resolveXdcodeModel(models, 'xdcode:b%3Amodel').providerId).toBe('provider-b');
        expect(resolveXdcodeModel(models).providerId).toBe('provider-b');
        expect(models).toHaveLength(3);
    });

    it('exports only selection metadata and preserves an explicit empty effort list', () => {
        const models = parseXdcodeModels(catalog);
        const serialized = JSON.stringify(models);
        for (const privateValue of ['private.invalid', 'PRIVATE_KEY', 'secret', 'credentials_present']) {
            expect(serialized).not.toContain(privateValue);
        }
        expect(resolveXdcodeModel(models, 'xdcode:b%3Amodel').thinkingLevels).toEqual([]);
    });

    it('rejects a removed selection without silently changing provider', () => {
        expect(() => resolveXdcodeModel(parseXdcodeModels(catalog), 'xdcode:missing')).toThrow('unavailable');
    });
});
