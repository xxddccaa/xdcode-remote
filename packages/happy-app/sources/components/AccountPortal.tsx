import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import axios from 'axios';
import { useAuth } from '@/auth/AuthContext';
import { usePrivateSite, privateErrorMessage } from '@/auth/privateSite';
import { authChallenge } from '@/auth/authChallenge';
import { wrapAccountSecret, unwrapAccountSecret, accountPasswordProof } from '@/auth/privateCredentials';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { getServerUrl } from '@/sync/serverConfig';

export function AccountPortal() {
    const auth = useAuth();
    const { site, error: connectionError, refresh } = usePrivateSite();
    const [register, setRegister] = React.useState(() => typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('invite'));
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmation, setConfirmation] = React.useState('');
    const [icpNumber, setIcpNumber] = React.useState('');
    const [policeNumber, setPoliceNumber] = React.useState('');
    const [invite, setInvite] = React.useState(() => typeof window === 'undefined' ? '' : new URL(window.location.href).searchParams.get('invite') || '');
    const [error, setError] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const setup = site?.initialized === false;
    const creating = setup || register;
    React.useEffect(() => { document.title = 'Happy'; }, []);

    const submit = async () => {
        if (busy) return;
        if (password.length < 8 || password.length > 128) { setError('密码需为 8–128 位。'); return; }
        if (creating && password !== confirmation) { setError('两次输入的密码不一致。'); return; }
        setBusy(true); setError('');
        try {
            let token: string; let secret: Uint8Array;
            const passwordProof = await accountPasswordProof(username, password);
            if (creating) {
                secret = setup && auth.credentials?.secret
                    ? decodeBase64(auth.credentials.secret, 'base64url') : crypto.getRandomValues(new Uint8Array(32));
                const envelope = await wrapAccountSecret(secret, password);
                const proof = authChallenge(secret);
                const result = await axios.post(`${getServerUrl()}/v1/site/${setup ? 'bootstrap' : 'register'}`, {
                    username, passwordProof, ...envelope, inviteCode: invite,
                    ...(setup ? { icpNumber, policeNumber } : {}),
                    publicKey: encodeBase64(proof.publicKey), challenge: encodeBase64(proof.challenge), signature: encodeBase64(proof.signature),
                });
                token = result.data.token;
            } else {
                const result = await axios.post(`${getServerUrl()}/v1/site/login`, { username, passwordProof });
                secret = await unwrapAccountSecret(result.data, password);
                const publicKey = Array.from(authChallenge(secret).publicKey, (byte) => byte.toString(16).padStart(2, '0')).join('');
                if (publicKey !== result.data.publicKey) throw new Error('账户密钥无效。');
                token = result.data.token;
            }
            await auth.login(token, encodeBase64(secret, 'base64url'));
            if (typeof window !== 'undefined' && window.location.search.includes('invite=')) window.history.replaceState(null, '', window.location.pathname);
            await refresh();
        } catch (e) { setError(privateErrorMessage(e)); await refresh(); }
        finally { setBusy(false); }
    };
    const inputStyle = { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff', color: '#171717' };
    const field = (label: string, value: string, setter: (value: string) => void, secure = false) => <View style={{ gap: 6 }}>
        <Text style={{ color: '#404040', fontSize: 14 }}>{label}</Text>
        <TextInput accessibilityLabel={label} value={value} onChangeText={setter} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} style={inputStyle} editable={!busy} onSubmitEditing={() => void submit()} />
    </View>;
    return <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }} style={{ flex: 1, backgroundColor: '#fafafa' }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 360, gap: 20 }}>
            <Text accessibilityRole="header" style={{ fontSize: 36, fontWeight: '600', color: '#171717', textAlign: 'center' }}>Happy</Text>
            {!site ? <><ActivityIndicator />{connectionError && <Text style={{ color: '#b91c1c' }}>{connectionError}</Text>}<Pressable onPress={() => void refresh()}><Text style={{ textAlign: 'center' }}>重试</Text></Pressable></> : <>
                <Text style={{ color: '#525252', textAlign: 'center' }}>{setup ? '首次设置：创建管理员账号' : register ? '使用邀请码注册' : '登录'}</Text>
                {field('账号', username, setUsername)}
                {field('密码', password, setPassword, true)}
                {creating && field('确认密码', confirmation, setConfirmation, true)}
                {setup && <>
                    {field('ICP 编号', icpNumber, setIcpNumber)}
                    {field('公安备案编号', policeNumber, setPoliceNumber)}
                    <Text style={{ color: '#737373', fontSize: 12 }}>填写本站的备案信息，也可稍后在管理页设置。</Text>
                </>}
                {register && !setup && field('邀请码', invite, setInvite)}
                {error ? <Text accessibilityRole="alert" style={{ color: '#b91c1c', fontSize: 14 }}>{error}</Text> : null}
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={{ backgroundColor: '#171717', borderRadius: 8, padding: 14, opacity: busy ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>{busy ? '请稍候…' : setup ? '完成设置' : register ? '注册' : '登录'}</Text>
                </Pressable>
                {!setup && <Pressable accessibilityRole="button" onPress={() => { setRegister(!register); setError(''); }}><Text style={{ textAlign: 'center', color: '#525252' }}>{register ? '返回登录' : '邀请码注册'}</Text></Pressable>}
            </>}
        </View>
    </ScrollView>;
}
