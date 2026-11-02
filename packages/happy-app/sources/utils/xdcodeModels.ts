import { z } from 'zod';

export const XdcodeModelSchema = z.object({
    code: z.string(), value: z.string(), description: z.string(),
    model: z.string(), providerId: z.string(), providerName: z.string(),
    catalogId: z.string().optional(), thinkingLevels: z.array(z.string()),
    defaultThinkingLevel: z.string().optional(),
});
export type XdcodeModel = z.infer<typeof XdcodeModelSchema>;

export function xdcodeModelModes(models?: XdcodeModel[] | null) {
    return (models ?? []).map((model) => ({
        key: model.code, name: model.value, description: model.description,
        modelId: model.model, providerId: model.providerId, providerName: model.providerName,
        thinkingLevels: model.thinkingLevels, defaultThinkingLevel: model.defaultThinkingLevel,
    }));
}
