import { describe, expect, it } from 'vitest';
import { getAvailableModels, getEffortLevelsForModel, getHardcodedPermissionModes } from '@/components/modelModeOptions';
import { resolveMachineAgent } from '@/utils/newSessionAgentSelection';

describe('xdcode mobile selections', () => {
    const models = [{
        code: 'xdcode:coder-a', value: 'Coder', description: 'My service',
        model: 'coder', providerId: 'my-service', providerName: 'My service',
        thinkingLevels: ['low', 'high'],
    }];
    it('offers the installed xdcode runtime and its actual model catalog', () => {
        expect(resolveMachineAgent('codex', { codex: false, xdcode: true })).toBe('xdcode');
        expect(getAvailableModels('xdcode', { xdcodeModels: models } as any, (key) => key)[0])
            .toMatchObject({ key: 'xdcode:coder-a', name: 'Coder', providerId: 'my-service' });
        expect(getEffortLevelsForModel('xdcode', 'xdcode:coder-a', { xdcodeModels: models } as any)
            .map((option) => option.key)).toEqual(['low', 'high']);
        expect(getHardcodedPermissionModes('xdcode', (key) => key).map((option) => option.key)).toContain('auto');
    });
});
