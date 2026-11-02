import * as React from 'react';
import axios from 'axios';
import { getServerUrl } from '@/sync/serverConfig';
import { useAuth } from '@/auth/AuthContext';

export type PublicSite = {
    privateSite: boolean; initialized: boolean; title: string;
    icpNumber: string; icpUrl: string; policeNumber: string; policeUrl: string;
};
export type SiteUser = { username: string; role: 'admin' | 'user' };

const Context = React.createContext<{
    site: PublicSite | null; user: SiteUser | null; error: string | null; refresh: () => Promise<void>;
}>({ site: null, user: null, error: null, refresh: async () => {} });

export function PrivateSiteProvider({ children }: { children: React.ReactNode }) {
    const auth = useAuth();
    const [site, setSite] = React.useState<PublicSite | null>(null);
    const [user, setUser] = React.useState<SiteUser | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const refresh = React.useCallback(async () => {
        try {
            const { data } = await axios.get<PublicSite>(`${getServerUrl()}/v1/site`);
            setSite(data); setError(null);
            if (auth.credentials && data.privateSite && data.initialized) {
                try {
                    const response = await axios.get<SiteUser>(`${getServerUrl()}/v1/site/me`, { headers: { Authorization: `Bearer ${auth.credentials.token}` } });
                    setUser(response.data);
                } catch (e) {
                    setUser(null);
                    if (axios.isAxiosError(e) && e.response?.status === 401) await auth.logout();
                    else throw e;
                }
            } else setUser(null);
        } catch { setError('暂时无法连接，请稍后重试。'); }
    }, [auth.credentials]);
    React.useEffect(() => { void refresh(); }, [refresh]);
    return <Context.Provider value={{ site, user, error, refresh }}>{children}</Context.Provider>;
}
export const usePrivateSite = () => React.useContext(Context);

export const privateErrorMessage = (error: unknown): string => {
    const messages: Record<string, string> = {
        invalid_credentials: '账号或密码错误。', invalid_invite: '邀请码无效、已过期或已用完。', invite_required: '请输入邀请码。',
        username_taken: '这个账号已被使用。', already_initialized: '初始化已经完成，请使用管理员账号登录。',
        not_initialized: '网站尚未初始化。', too_many_attempts: '操作过于频繁，请稍后重试。', account_exists: '这个账户已注册，请登录。',
    };
    if (axios.isAxiosError(error)) return messages[error.response?.data?.error] || (error.response?.status === 400 ? '请检查输入内容，账号需为 3–32 位字母、数字或 ._-，密码至少 8 位。' : '操作失败，请稍后重试。');
    return error instanceof Error && error.message.includes('HTTPS') ? error.message : '操作失败，请稍后重试。';
};
