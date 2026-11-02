import * as React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import axios from 'axios';
import { useAuth } from '@/auth/AuthContext';
import { privateErrorMessage, usePrivateSite } from '@/auth/privateSite';
import { getServerUrl } from '@/sync/serverConfig';

type Invite = { id: string; label: string; maxUses: number; usedCount: number; expiresAt: string; revokedAt: string | null };
export default function Admin() {
    const { credentials } = useAuth();
    const { site, user, refresh } = usePrivateSite();
    const [invites, setInvites] = React.useState<Invite[]>([]);
    const [label, setLabel] = React.useState('');
    const [uses, setUses] = React.useState('1');
    const [days, setDays] = React.useState('7');
    const [generated, setGenerated] = React.useState('');
    const [message, setMessage] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [icp, setIcp] = React.useState(site?.icpNumber || '');
    const [icpUrl, setIcpUrl] = React.useState(site?.icpUrl || '');
    const [police, setPolice] = React.useState(site?.policeNumber || '');
    const [policeUrl, setPoliceUrl] = React.useState(site?.policeUrl || '');
    const options = React.useMemo(() => ({ headers: { Authorization: `Bearer ${credentials?.token}` } }), [credentials?.token]);
    const load = React.useCallback(async () => {
        const { data } = await axios.get(`${getServerUrl()}/v1/admin/invites`, options);
        setInvites(data.invites);
    }, [options]);
    React.useEffect(() => { if (user?.role === 'admin') void load().catch(() => setMessage('暂时无法加载。')); }, [user?.role, load]);
    const run = async (operation: () => Promise<void>) => {
        if (busy) return;
        setBusy(true); setMessage('');
        try { await operation(); await load(); } catch (e) { setMessage(privateErrorMessage(e)); }
        finally { setBusy(false); }
    };
    const createInvite = () => run(async () => {
        const { data } = await axios.post(`${getServerUrl()}/v1/admin/invites`, { label, maxUses: Number(uses), expiresInDays: Number(days) }, options);
        setGenerated(`${window.location.origin}/?invite=${encodeURIComponent(data.code)}`);
        setMessage('邀请链接已生成，请复制保存后分享。');
    });
    const field = (title: string, value: string, onChangeText: (value: string) => void) => <View style={{ gap: 6 }}>
        <Text style={{ color: '#404040' }}>{title}</Text>
        <TextInput accessibilityLabel={title} value={value} onChangeText={onChangeText} editable={!busy} autoCapitalize="none" style={{ borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 8, padding: 10, color: '#171717', backgroundColor: '#fff' }} />
    </View>;
    const button = (title: string, action: () => void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={{ backgroundColor: '#171717', borderRadius: 8, padding: 12, opacity: busy ? 0.6 : 1 }}><Text style={{ color: '#fff', textAlign: 'center' }}>{title}</Text></Pressable>;
    if (user?.role !== 'admin') return <View style={{ padding: 24 }}><Text>没有访问权限。</Text></View>;
    return <ScrollView contentContainerStyle={{ padding: 24, gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center' }} style={{ backgroundColor: '#fafafa' }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 24, fontWeight: '600', color: '#171717' }}>管理</Text>
        <Text style={{ color: '#525252' }}>管理员：{user.username}</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#171717' }}>邀请注册</Text>
        {field('备注', label, setLabel)}
        {field('可使用次数', uses, setUses)}
        {field('有效天数', days, setDays)}
        {button('生成邀请链接', createInvite)}
        {generated ? <TextInput accessibilityLabel="邀请链接" value={generated} multiline editable={false} style={{ padding: 12, borderWidth: 1, borderColor: '#d4d4d4', backgroundColor: '#fff', color: '#171717' }} /> : null}
        {message ? <Text accessibilityRole="alert" style={{ color: '#525252' }}>{message}</Text> : null}
        {invites.map((invite) => <View key={invite.id} style={{ padding: 12, gap: 8, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 8 }}>
            <Text style={{ color: '#171717' }}>{invite.label || '未备注'} · 已使用 {invite.usedCount}/{invite.maxUses}</Text>
            <Text style={{ color: '#737373' }}>到期：{new Date(invite.expiresAt).toLocaleString()} · {invite.revokedAt ? '已撤销' : new Date(invite.expiresAt).getTime() <= Date.now() ? '已过期' : invite.usedCount >= invite.maxUses ? '已用完' : '有效'}</Text>
            {!invite.revokedAt && button('撤销', () => void run(async () => { await axios.delete(`${getServerUrl()}/v1/admin/invites/${invite.id}`, options); }))}
        </View>)}
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#171717' }}>备案信息</Text>
        {field('ICP 编号', icp, setIcp)}
        {field('ICP 链接', icpUrl, setIcpUrl)}
        {field('公安备案编号', police, setPolice)}
        {field('公安备案链接', policeUrl, setPoliceUrl)}
        {button('保存备案信息', () => void run(async () => {
            await axios.put(`${getServerUrl()}/v1/admin/site`, { icpNumber: icp, icpUrl, policeNumber: police, policeUrl }, options);
            await refresh(); setMessage('已保存。');
        }))}
    </ScrollView>;
}
